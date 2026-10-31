"""Scenario 3: drifts. A column dropped then retyped in the database; an API that fails
in the middle of a load.

A schema change the approved plan cannot clean as approved blocks the source: loads keep
their rows, Silver waits, the engineers are notified once; once the refreshed plan is
approved, Silver runs again. An API answering 5xx, then not answering in time, fails the
load without moving its cursor: the next load reads everything, once.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.connectors.rest import Clock
from tests import databases as db
from tests.auth import api_client
from tests.campaign import reference as ref
from tests.fake_api import OK, STALL, FakeApiState, make_orders, serve

pytestmark = pytest.mark.databases


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    local = settings.model_copy(
        update={"job_runner": "inline", "connector_allowed_hosts": ["127.0.0.1"]}
    )
    with api_client(local) as admin:
        state: AppState = admin.app.state.forja  # type: ignore[attr-defined]
        state.connectors.clock = Clock(sleep=lambda _s: None)
        yield admin


def _sql(database: db.TestDatabase, *statements: str) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for statement in statements:
            con.execute(sa.text(statement))
    engine.dispose()


def _insert(database: db.TestDatabase, ids: range, *, month: int, product: bool) -> None:
    """Orders of a later month than every order before them, with or without the
    product column (once it is dropped)."""
    columns = "id_commande, id_client, date_commande, montant, updated_at"
    if product:
        columns += ", id_produit"
    rows = []
    for i in ids:
        day = f"2026-{month:02d}-{1 + i % 27:02d}"
        product_value = f", 'P{1 + i % ref.PRODUCTS:03d}'" if product else ""
        rows.append(
            f"({i}, 'C{1 + i % ref.CLIENTS:03d}', '{day}', '{10 + i % 90}.50', "
            f"'{day} 10:{i % 60:02d}:00'{product_value})"
        )
    _sql(database, f"INSERT INTO ventes.commandes ({columns}) VALUES {', '.join(rows)}")


def _load(client: TestClient, connection_id: str, *, chain: bool = True) -> dict[str, Any]:
    response = client.post(f"/connections/{connection_id}/load", json={"chain": chain})
    assert response.status_code == 202, response.text
    job: dict[str, Any] = response.json()
    return job


def _logs(client: TestClient, job: dict[str, Any]) -> str:
    return client.get(f"/runs/{job['id']}/logs").text


def _drift_notifications(client: TestClient) -> list[dict[str, Any]]:
    body = client.get("/notifications?limit=50&offset=0").json()
    items: list[dict[str, Any]] = body["items"] if isinstance(body, dict) else body
    return [n for n in items if n["kind"] == "schema_drift"]


def _approve_refreshed_plan(client: TestClient, source_id: str) -> dict[str, Any]:
    plan: dict[str, Any] = client.get(f"/sources/{source_id}/plan").json()
    assert plan["status"] == "draft", plan["status"]
    approved = client.post(f"/sources/{source_id}/plan/approve")
    assert approved.status_code == 200, approved.text
    return plan


def test_a_dropped_then_retyped_column_blocks_until_the_plan_is_approved(
    client: TestClient, postgres: db.TestDatabase
) -> None:
    timer = ref.Timer("drift-database")
    ref.seed_orders(postgres, range(1, 41), month=1)
    try:
        project_id = client.post("/projects", json={"name": "Dérives"}).json()["id"]
        connection = client.post(
            f"/projects/{project_id}/connections",
            json={
                "name": "Ventes",
                "type": "postgres",
                "params": postgres.params(),
                "secrets": {"password": db.READER_PASSWORD},
            },
        ).json()
        imported = client.post(
            f"/connections/{connection['id']}/import",
            json={
                "tables": [
                    {
                        "schema_name": "ventes",
                        "table": "commandes",
                        "mode": "incremental",
                        "cursor_column": "updated_at",
                    }
                ]
            },
        )
        assert imported.status_code == 201, imported.text
        [source] = client.get(f"/projects/{project_id}/sources").json()
        assert client.post(f"/sources/{source['id']}/plan/approve").status_code == 200
        built = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
        assert built.json()["status"] == "succeeded", built.text

        with timer.step("column dropped"):
            _sql(postgres, "ALTER TABLE ventes.commandes DROP COLUMN id_produit")
            _insert(postgres, range(41, 51), month=2, product=False)
            dropped = _load(client, connection["id"])
            [load] = dropped["metrics"]["loads"]
            assert dropped["status"] == "succeeded" and load["rows"] == 10
            assert load["blocking_drift"] is True
            assert "id_produit (supprimée)" in _logs(client, dropped)
            assert "nothing rebuilt" in _logs(client, dropped)
            [notified] = _drift_notifications(client)
            assert "id_produit" in notified["detail"]

            # A later load, same schema: still blocked, not notified again.
            _insert(postgres, range(51, 56), month=3, product=False)
            again = _load(client, connection["id"])
            assert again["metrics"]["loads"][0]["blocking_drift"] is True
            assert "nothing rebuilt" in _logs(client, again)
            assert len(_drift_notifications(client)) == 1

        with timer.step("plan approved, Silver again"):
            plan = _approve_refreshed_plan(client, source["id"])
            gone = {c["source_column"]: c["present_in_latest"] for c in plan["columns"]}
            assert gone["id_produit"] is False
            _insert(postgres, range(56, 58), month=4, product=False)
            resumed = _load(client, connection["id"])
            assert resumed["metrics"]["loads"][0]["blocking_drift"] is False
            # Every row waiting since the drift is cleaned now.
            assert "stg_commandes: 17 new Bronze row(s)" in _logs(client, resumed)
            assert resumed["status"] == "succeeded"

        with timer.step("column retyped"):
            _sql(
                postgres,
                "ALTER TABLE ventes.commandes ALTER COLUMN montant TYPE VARCHAR(20) "
                "USING montant::text",
            )
            _insert(postgres, range(58, 63), month=5, product=False)
            retyped = _load(client, connection["id"])
            assert retyped["metrics"]["loads"][0]["blocking_drift"] is True
            logs = _logs(client, retyped)
            assert "montant (DECIMAL(10,2) → VARCHAR)" in logs, logs
            assert len(_drift_notifications(client)) == 2

            plan = _approve_refreshed_plan(client, source["id"])
            assert any("montant" in w and "VARCHAR" in w for w in plan["warnings"])
            _insert(postgres, range(63, 65), month=6, product=False)
            resumed = _load(client, connection["id"])
            assert resumed["metrics"]["loads"][0]["blocking_drift"] is False
            # A plan whose types changed rebuilds the table from every Bronze row.
            logs = _logs(client, resumed)
            assert "stg_commandes: full refresh (plan v3)" in logs, logs
            assert "stg_commandes: 64 new Bronze row(s) out of 64" in logs
            assert resumed["status"] == "succeeded"
        timer.write()
    finally:
        ref.drop_orders(postgres)


def test_an_api_outage_mid_load_leaves_no_duplicate(client: TestClient) -> None:
    timer = ref.Timer("drift-api")
    with serve(FakeApiState(orders=make_orders(9), auth="bearer")) as (base, state):
        project_id = client.post("/projects", json={"name": "Panne"}).json()["id"]
        connection = client.post(
            f"/projects/{project_id}/connections",
            json={
                "name": "Boutique",
                "type": "rest_api",
                "params": {
                    "base_url": base,
                    "auth": {"kind": "bearer"},
                    "pagination": {"kind": "page_number", "page_size": 3},
                    "max_retries": 2,
                    "timeout_seconds": 0.5,
                    "endpoints": [
                        {
                            "name": "orders",
                            "path": "/page/orders",
                            "incremental": {"param": "since", "cursor_field": "updated_at"},
                        }
                    ],
                },
                "secrets": {"token": "secret-token-456"},
            },
        ).json()
        imported = client.post(
            f"/connections/{connection['id']}/import", json={"endpoints": [{"endpoint": "orders"}]}
        )
        assert imported.json()["run"]["status"] == "succeeded", imported.text
        orders = next(
            s for s in client.get(f"/projects/{project_id}/sources").json() if s["name"] == "orders"
        )
        assert orders["row_count"] == 9

        state.orders += make_orders(6, start=20)
        with timer.step("5xx mid-load"):
            # First page answered, then the second fails on every attempt.
            state.failures = [OK, 503, 503, 503]
            failed = _load(client, connection["id"], chain=False)
            assert failed["status"] == "failed"
            assert "503 after 3 attempt" in _logs(client, failed)
            assert client.get(f"/sources/{orders['id']}").json()["version"] == 1

        with timer.step("timeouts mid-load"):
            state.stall_seconds = 1.5
            state.failures = [OK, STALL, STALL, STALL]
            failed = _load(client, connection["id"], chain=False)
            assert failed["status"] == "failed"
            assert "cannot be reached" in _logs(client, failed)
            assert client.get(f"/sources/{orders['id']}").json()["version"] == 1

        with timer.step("resumed"):
            state.failures = []
            resumed = _load(client, connection["id"], chain=False)
            assert resumed["status"] == "succeeded", _logs(client, resumed)
            loads = {m["object"]: m for m in resumed["metrics"]["loads"]}
            assert loads["orders"]["rows"] == 6
            refreshed = client.get(f"/sources/{orders['id']}").json()
            assert refreshed["version"] == 2 and refreshed["row_count"] == 6
            nothing = _load(client, connection["id"], chain=False)
            assert {m["skipped"] for m in nothing["metrics"]["loads"]} == {"aucune nouveauté"}
        timer.write()
