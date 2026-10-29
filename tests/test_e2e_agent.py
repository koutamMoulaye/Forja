"""End to end through the HTTP API and the background worker, in multi-user mode with
approval of data marts:

engineer builds the shop up to Gold → analyst asks an ambiguous question → the agent
asks back → the analyst proposes a synonym and answers → verification preview →
validation → the engineer accepts the synonym and approves → mart_* published →
the analyst exports it, pseudonymized.
"""

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests.auth import api_client, user_client
from tests.fixtures import ecommerce as ec
from tests.test_api import wait_for_run

SOURCES = (ec.CLIENTS, ec.PRODUITS, ec.COMMANDES, ec.LIGNES)


def _run(client: TestClient, response: Any) -> dict[str, Any]:
    assert response.status_code in (200, 202), response.text
    body = response.json()
    run_id = body["id"] if "status" in body and "type" in body else body["run"]["id"]
    run = wait_for_run(client, run_id)
    assert run["status"] == "succeeded", client.get(f"/runs/{run_id}/logs").text
    return run


def _build_gold(engineer: TestClient, project_id: str, ecommerce_dir: Path) -> None:
    for name in SOURCES:
        with (ecommerce_dir / name).open("rb") as handle:
            [source] = engineer.post(
                f"/projects/{project_id}/sources", files={"file": (name, handle)}
            ).json()
        assert engineer.post(f"/sources/{source['id']}/plan/approve").status_code == 200
    _run(engineer, engineer.post(f"/projects/{project_id}/runs", json={"type": "build_silver"}))
    for relation in engineer.get(f"/projects/{project_id}/relations").json():
        assert engineer.post(f"/relations/{relation['id']}/confirm").status_code == 200
    _run(
        engineer,
        engineer.post(f"/projects/{project_id}/gold-plan/propose", json={"use_llm": False}),
    )
    assert engineer.post(f"/projects/{project_id}/gold-plan/approve").status_code == 200
    _run(engineer, engineer.post(f"/projects/{project_id}/runs", json={"type": "build_gold"}))


def test_analyst_requests_a_data_mart(settings: Settings, ecommerce_dir: Path) -> None:
    shared = settings.model_copy(
        update={"auth_mode": "multi", "mart_require_approval": True, "agent_today": "2025-01-15"}
    )
    with api_client(shared) as admin:
        project_id = admin.post("/projects", json={"name": "Boutique"}).json()["id"]
        with (
            user_client(admin, project_id, "ingenieur@exemple.fr", "engineer") as engineer,
            user_client(admin, project_id, "analyste@exemple.fr", "analyst") as analyst,
        ):
            _build_gold(engineer, project_id, ecommerce_dir)

            # --- The analyst reads the business vocabulary ----------------------------------
            response = analyst.get(f"/projects/{project_id}/semantic-layer")
            assert response.status_code == 200, response.text
            layer = response.json()
            assert {m["name"] for m in layer["metrics"]} >= {"montant", "prix_moyen"}
            assert layer["overrides"] == []

            # --- An ambiguous question: the agent asks back ---------------------------------
            asked = analyst.post(
                f"/projects/{project_id}/mart-requests",
                json={"question": "Évolution des ventes par ville en 2024"},
            )
            assert asked.status_code == 202
            _run(analyst, asked)
            mart_id = asked.json()["mart_request"]["id"]
            request = analyst.get(f"/mart-requests/{mart_id}").json()
            first = request["iterations"][-1]
            assert request["status"] == "drafted" and first["status"] == "clarification"
            assert first["path"] == "parser" and first["context_tokens"] < 1500
            options = first["clarification"]["options"]
            revenue = next(i for i, o in enumerate(options) if o["ref"] == "metric:montant")

            # It proposes the word its team uses for the revenue, for next time.
            proposal = analyst.post(
                f"/projects/{project_id}/semantic-layer/synonym-proposals",
                json={
                    "target": "metric:montant",
                    "synonym": "encaissements",
                    "mart_request_id": mart_id,
                },
            )
            assert proposal.status_code == 201

            # --- The answer gives a verification preview ------------------------------------
            _run(
                analyst, analyst.post(f"/mart-requests/{mart_id}/answer", json={"option": revenue})
            )
            request = analyst.get(f"/mart-requests/{mart_id}").json()
            preview_version = request["iterations"][-1]
            assert request["status"] == "previewed" and preview_version["version"] == 2
            assert preview_version["summary"] == (
                "Chiffre d'affaires par mois et par ville, sur 2024."
            )
            preview = preview_version["preview"]
            assert preview["row_count"] > 0 and len(preview["rows"]) <= 50
            assert "group by" in preview_version["sql"]
            codes = {c["code"]: c["status"] for c in preview["controls"]}
            assert codes["reconciliation"] == "ok"
            assert codes["unknown_member"] in ("ok", "warning")

            # --- Validation, then approval by an engineer ----------------------------------
            validated = analyst.post(f"/mart-requests/{mart_id}/validate").json()
            assert validated["mart_request"]["status"] == "validated"
            assert validated["run"] is None  # waiting for an engineer
            assert analyst.post(f"/mart-requests/{mart_id}/approve").status_code == 403
            pending = engineer.get(
                f"/projects/{project_id}/semantic-layer/synonym-proposals",
                params={"status": "pending"},
            ).json()
            assert [p["synonym"] for p in pending] == ["encaissements"]
            assert engineer.post(f"/synonym-proposals/{pending[0]['id']}/accept").status_code == 200

            approved = engineer.post(f"/mart-requests/{mart_id}/approve")
            publication = _run(engineer, approved)
            request = analyst.get(f"/mart-requests/{mart_id}").json()
            assert request["status"] == "published"
            name = request["published_name"]
            assert name.startswith("mart_montant_par_mois_par_ville")
            assert publication["metrics"]["exports"]

            # --- The analyst finds and exports their mart ------------------------------------
            tables = {t["name"]: t for t in analyst.get(f"/projects/{project_id}/tables").json()}
            mart = tables[name]
            assert mart["layer"] == "mart" and mart["publish"]
            exported = analyst.get(f"/tables/{mart['id']}/export", params={"format": "csv"})
            assert exported.status_code == 200
            rows = list(csv.DictReader(io.StringIO(exported.text), delimiter=";"))
            assert len(rows) == mart["row_count"] > 0
            assert set(rows[0]) == {"mois", "ville", "montant"}

            # The accepted synonym is now part of the layer: no question back, no LLM.
            again = analyst.post(
                f"/projects/{project_id}/mart-requests",
                json={"question": "Évolution des encaissements par ville en 2024"},
            )
            _run(analyst, again)
            second = analyst.get(f"/mart-requests/{again.json()['mart_request']['id']}").json()
            latest = second["iterations"][-1]
            assert latest["status"] == "previewed" and latest["path"] == "parser"
            assert latest["spec"]["metrics"] == ["montant"]

            entries = admin.get(f"/projects/{project_id}/audit").json()["items"]
            audit = {e["action"] for e in entries}
            assert {
                "agent.request", "agent.answer", "synonym.propose", "synonym.accept",
                "mart.validate", "mart.approve", "mart.publish", "table.export",
            } <= audit  # fmt: skip
