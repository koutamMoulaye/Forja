"""Scenario 1: the reference journey, from three kinds of sources to a refreshed data mart.

A file, a PostgreSQL table and an API become sources; their plans are approved, the
star model is built, an analyst publishes a data mart, then a scheduled load (on a
simulated clock) brings new orders: Silver, Gold, the data mart and the served DuckDB
file must all hold them.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core import duck
from forja_core.config import Settings
from forja_core.connectors.rest import Clock
from tests import databases as db
from tests.auth import api_client, user_client
from tests.campaign import reference as ref
from tests.fake_api import FakeApiState, serve

pytestmark = pytest.mark.databases


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


def _ask(analyst: TestClient, project_id: str, question: str) -> dict[str, Any]:
    """A data mart requested in French, clarified when the agent asks back."""
    asked = analyst.post(f"/projects/{project_id}/mart-requests", json={"question": question})
    ref.run(analyst, asked)
    mart_id = asked.json()["mart_request"]["id"]
    for _ in range(3):
        request: dict[str, Any] = analyst.get(f"/mart-requests/{mart_id}").json()
        latest = request["iterations"][-1]
        if request["status"] == "previewed":
            return request
        assert latest["status"] == "clarification", latest
        options = latest["clarification"]["options"]
        choice = next((i for i, o in enumerate(options) if o.get("ref") == "metric:montant"), 0)
        ref.run(analyst, analyst.post(f"/mart-requests/{mart_id}/answer", json={"option": choice}))
    raise AssertionError(f"no preview after three answers: {request}")


def _mart_total(path: Path, table: str) -> tuple[int, float]:
    with duck.connect(path, read_only=True) as con:
        rows, total = con.execute(f'SELECT count(*), sum("montant") FROM "{table}"').fetchone() or (
            0,
            0,
        )
    return int(rows), float(total or 0)


def test_reference_journey(settings: Settings, tmp_path: Path, postgres: db.TestDatabase) -> None:
    timer = ref.Timer("reference-journey")
    ref.seed_orders(postgres, range(1, 121), month=1)
    shared = settings.model_copy(
        update={
            "auth_mode": "multi",
            "mart_require_approval": True,
            "agent_today": "2026-03-15",
            "connector_allowed_hosts": ["127.0.0.1"],
            "job_runner": "inline",
        }
    )
    clock = FakeClock(datetime(2026, 3, 15, 5, 30, tzinfo=UTC))  # 6:30 in Paris
    try:
        with (
            serve(FakeApiState(clients=ref.clients(), auth="bearer")) as (base, _fake),
            api_client(shared) as admin,
        ):
            state: AppState = admin.app.state.forja  # type: ignore[attr-defined]
            state.schedules.clock = clock
            state.connectors.clock = Clock(sleep=lambda _s: None)
            project_id = admin.post("/projects", json={"name": "Référence"}).json()["id"]
            with (
                user_client(admin, project_id, "ingenieur@exemple.fr", "engineer") as engineer,
                user_client(admin, project_id, "analyste@exemple.fr", "analyst") as analyst,
            ):
                with timer.step("sources"):
                    path = ref.products_csv(tmp_path / "produits.csv")
                    with path.open("rb") as handle:
                        uploaded = engineer.post(
                            f"/projects/{project_id}/sources",
                            files={"file": ("produits.csv", handle)},
                        )
                    assert uploaded.status_code == 201, uploaded.text
                    database = engineer.post(
                        f"/projects/{project_id}/connections",
                        json={
                            "name": "Ventes",
                            "type": "postgres",
                            "params": postgres.params(),
                            "secrets": {"password": db.READER_PASSWORD},
                        },
                    ).json()
                    ref.run(
                        engineer,
                        engineer.post(
                            f"/connections/{database['id']}/import",
                            json={
                                "tables": [
                                    {
                                        "schema_name": "ventes",
                                        "table": "commandes",
                                        "mode": "incremental",
                                        "cursor_column": "updated_at",
                                        "lookback_minutes": 10,
                                    }
                                ]
                            },
                        ),
                    )
                    api = engineer.post(
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
                        engineer,
                        engineer.post(
                            f"/connections/{api['id']}/import",
                            json={"endpoints": [{"endpoint": "clients"}]},
                        ),
                    )
                    sources = engineer.get(f"/projects/{project_id}/sources").json()
                    assert {s["name"] for s in sources} == {"produits", "commandes", "clients"}

                with timer.step("plans, silver, relations, gold"):
                    for source in sources:
                        approved = engineer.post(f"/sources/{source['id']}/plan/approve")
                        assert approved.status_code == 200, approved.text
                    ref.run(
                        engineer,
                        engineer.post(
                            f"/projects/{project_id}/runs", json={"type": "build_silver"}
                        ),
                    )
                    for relation in engineer.get(f"/projects/{project_id}/relations").json():
                        engineer.post(f"/relations/{relation['id']}/confirm")
                    ref.run(
                        engineer,
                        engineer.post(
                            f"/projects/{project_id}/gold-plan/propose", json={"use_llm": False}
                        ),
                    )
                    gold = engineer.post(f"/projects/{project_id}/gold-plan/approve")
                    assert gold.status_code == 200, gold.text
                    ref.run(
                        engineer,
                        engineer.post(f"/projects/{project_id}/runs", json={"type": "build_gold"}),
                    )

                with timer.step("data mart"):
                    request = _ask(analyst, project_id, "Montant des ventes par mois et par ville")
                    validated = analyst.post(f"/mart-requests/{request['id']}/validate")
                    assert validated.status_code in (200, 202), validated.text
                    ref.run(engineer, engineer.post(f"/mart-requests/{request['id']}/approve"))
                    published = analyst.get(f"/mart-requests/{request['id']}").json()
                    assert published["status"] == "published"
                    table = published["published_name"]

                project = state.catalog.get_project(project_id)
                serving = state.publisher.serving_path(project)
                rows_before, total_before = _mart_total(serving, table)
                assert rows_before > 0

                with timer.step("scheduled load and refresh"):
                    saved = engineer.put(
                        f"/connections/{database['id']}/schedule",
                        json={"text": "tous les jours à 7 h"},
                    )
                    assert saved.status_code == 200, saved.text
                    ref.seed_orders(postgres, range(121, 181), month=3)
                    clock.now += timedelta(hours=1)  # 7:30 in Paris: the load is due
                    [job] = state.scheduler.tick()
                    finished = state.catalog.get_job(job.id)
                    assert finished.status.value == "succeeded", state.catalog.job_logs(job.id)
                    assert finished.params.chain is True
                    loads = {m.object: m for m in finished.metrics.loads}  # type: ignore[union-attr]
                    assert loads["ventes.commandes"].version == 2
                    assert finished.metrics is not None and finished.metrics.models

                rows_after, total_after = _mart_total(serving, table)
                assert total_after > total_before, (total_before, total_after)
                assert rows_after >= rows_before
                mart_table = state.catalog.find_table(project_id, table)
                assert mart_table is not None and mart_table.last_run_id == job.id
                timer.write(
                    mart=table,
                    rows=[rows_before, rows_after],
                    totals=[total_before, total_after],
                )
    finally:
        ref.drop_orders(postgres)
