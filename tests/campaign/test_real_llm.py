"""Scenario 8: a real language model proposes the star model of the reference journey.

Opt-in (CPU inference takes minutes): FORJA_CAMPAIGN_LLM_MODEL=qwen3.5:9b with Ollama
running. The model receives the Silver schemas, statistics and confirmed relations, never
a value; its proposal must pass Forja's validation, or Forja falls back on its heuristic.
The duration, the origin and the issues are written to $FORJA_CAMPAIGN_REPORT.
"""

from __future__ import annotations

import os
import time
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests import databases as db
from tests.auth import api_client
from tests.campaign import reference as ref
from tests.fake_api import FakeApiState, serve

MODEL = os.environ.get("FORJA_CAMPAIGN_LLM_MODEL", "")
OLLAMA = os.environ.get("FORJA_LLM_OLLAMA_BASE_URL", "http://localhost:11434")


def _ollama() -> bool:
    try:
        return httpx.get(f"{OLLAMA}/api/tags", timeout=3).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = [
    pytest.mark.databases,
    pytest.mark.skipif(not MODEL, reason="set FORJA_CAMPAIGN_LLM_MODEL to run it"),
    pytest.mark.skipif(not MODEL or not _ollama(), reason="Ollama does not answer"),
]


@pytest.fixture
def client(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("FORJA_LLM_PROVIDER", "ollama")
    monkeypatch.setenv("FORJA_LLM_MODEL", MODEL)
    monkeypatch.setenv("FORJA_LLM_CACHE", "false")
    local = settings.model_copy(
        update={"job_runner": "inline", "connector_allowed_hosts": ["127.0.0.1"]}
    )
    with api_client(local) as admin:
        yield admin


def test_a_real_model_proposes_the_reference_star(
    client: TestClient, postgres: db.TestDatabase, tmp_path: os.PathLike[str]
) -> None:
    timer = ref.Timer(f"real-llm-gold-{MODEL.replace(':', '-')}")
    ref.seed_orders(postgres, range(1, 121), month=1)
    try:
        with serve(FakeApiState(clients=ref.clients(), auth="bearer")) as (base, _fake):
            project_id = client.post("/projects", json={"name": "LLM"}).json()["id"]
            path = ref.products_csv(tmp_path / "produits.csv")  # type: ignore[operator]
            with path.open("rb") as handle:
                client.post(
                    f"/projects/{project_id}/sources", files={"file": ("produits.csv", handle)}
                )
            database = client.post(
                f"/projects/{project_id}/connections",
                json={
                    "name": "Ventes",
                    "type": "postgres",
                    "params": postgres.params(),
                    "secrets": {"password": db.READER_PASSWORD},
                },
            ).json()
            ref.run(
                client,
                client.post(
                    f"/connections/{database['id']}/import",
                    json={"tables": [{"schema_name": "ventes", "table": "commandes"}]},
                ),
            )
            api = client.post(
                f"/projects/{project_id}/connections",
                json={
                    "name": "CRM",
                    "type": "rest_api",
                    "params": {
                        "base_url": base,
                        "auth": {"kind": "bearer"},
                        "pagination": {"kind": "page_number", "page_size": 5},
                        "endpoints": [{"name": "clients", "path": "/page/clients"}],
                    },
                    "secrets": {"token": "secret-token-456"},
                },
            ).json()
            ref.run(
                client,
                client.post(
                    f"/connections/{api['id']}/import",
                    json={"endpoints": [{"endpoint": "clients"}]},
                ),
            )
        for source in client.get(f"/projects/{project_id}/sources").json():
            assert client.post(f"/sources/{source['id']}/plan/approve").status_code == 200
        ref.run(client, client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"}))
        for relation in client.get(f"/projects/{project_id}/relations").json():
            client.post(f"/relations/{relation['id']}/confirm")

        started = time.perf_counter()
        with timer.step("Gold proposal"):
            job = ref.run(
                client,
                client.post(f"/projects/{project_id}/gold-plan/propose", json={"use_llm": True}),
            )
        seconds = round(time.perf_counter() - started, 1)
        plan = client.get(f"/projects/{project_id}/gold-plan").json()
        errors = [i for i in plan["issues"] if i["severity"] == "error"]
        timer.write(
            model=MODEL,
            origin=plan["origin"],
            seconds=seconds,
            facts=[f["name"] for f in plan["facts"]],
            dimensions=[d["name"] for d in plan["dimensions"]],
            errors=[i["message"] for i in errors],
            warnings=job.get("result", {}).get("warnings"),
        )
        print(plan["origin"], seconds, [f["name"] for f in plan["facts"]], errors)
        # The proposal is either the model's, validated, or the heuristic's after a refusal.
        assert plan["origin"].startswith(("llm:", "heuristic"))
        assert errors == []
    finally:
        ref.drop_orders(postgres)
