"""Scenario 5: security, on hostile names and with real credentials.

- Table and column names carrying SQL are loaded as data: they are quoted, never run.
- The database password and the API token never come out: not in an API response,
  a run log, the audit trail, a notification, a log line, a file of the workspace, or
  the context sent to the language model.

SSRF is covered by tests/test_connectors_rest.py and the role matrix of every connector
and schedule route by tests/test_permissions.py (each route of the API must be in it).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import Any

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.gold.service import GoldPlanService
from forja_llm import LLMProvider, LLMSettings
from forja_llm.base import Completion
from forja_llm.gold import LLMGoldProposer
from tests import databases as db
from tests.auth import api_client
from tests.fake_api import FakeApiState, make_orders, serve

pytestmark = pytest.mark.databases

HOSTILE_TABLE = 'commandes"; DROP TABLE ventes.temoin; --'
HOSTILE_COLUMN = "montant; DELETE FROM ventes.temoin"
TOKEN = "secret-token-456"


class _Recording(LLMProvider):
    """Keeps every prompt; answers something the proposer refuses."""

    name = "recording"

    def __init__(self) -> None:
        super().__init__(LLMSettings(model="m", max_attempts=1, cache=False), sleep=lambda _: None)
        self.prompts: list[str] = []

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.prompts.append(system + prompt)
        return Completion("{}", 10, 2)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    local = settings.model_copy(
        update={"job_runner": "inline", "connector_allowed_hosts": ["127.0.0.1"]}
    )
    with api_client(local) as admin:
        yield admin


def _sql(database: db.TestDatabase, *statements: str) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for statement in statements:
            con.execute(sa.text(statement))
    engine.dispose()


def _quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def test_hostile_names_are_data_and_credentials_never_come_out(
    client: TestClient,
    postgres: db.TestDatabase,
    settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    table = f"ventes.{_quoted(HOSTILE_TABLE)}"
    _sql(
        postgres,
        "CREATE SCHEMA IF NOT EXISTS ventes",
        "CREATE TABLE ventes.temoin (x INTEGER)",
        "INSERT INTO ventes.temoin VALUES (1)",
        f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, {_quoted(HOSTILE_COLUMN)} NUMERIC, "
        '"a""b" TEXT)',
        f"INSERT INTO {table} VALUES (1, 10.5, 'x'), (2, 20.5, 'y')",
        f"GRANT USAGE ON SCHEMA ventes TO {db.READER}",
        f"GRANT SELECT ON ALL TABLES IN SCHEMA ventes TO {db.READER}",
    )
    responses: list[str] = []

    def keep(response: Any) -> Any:
        responses.append(response.text)
        return response

    try:
        project_id = client.post("/projects", json={"name": "Sécurité"}).json()["id"]
        database = keep(
            client.post(
                f"/projects/{project_id}/connections",
                json={
                    "name": "Ventes",
                    "type": "postgres",
                    "params": postgres.params(),
                    "secrets": {"password": db.READER_PASSWORD},
                },
            )
        ).json()
        explored = keep(client.get(f"/connections/{database['id']}/explore")).json()
        assert HOSTILE_TABLE in {t["name"] for t in explored["tables"]}
        imported = keep(
            client.post(
                f"/connections/{database['id']}/import",
                json={"tables": [{"schema_name": "ventes", "table": HOSTILE_TABLE}]},
            )
        )
        assert imported.json()["run"]["status"] == "succeeded", imported.text

        # Nothing ran: the witness table is still there, with its row.
        engine = sa.create_engine(postgres.admin_url())
        with engine.connect() as con:
            assert con.execute(sa.text("SELECT count(*) FROM ventes.temoin")).scalar() == 1
        engine.dispose()

        hostile_orders = [
            {**order, "montant; DROP TABLE x": order["amount"]} for order in make_orders(4)
        ]
        with serve(FakeApiState(orders=hostile_orders, auth="bearer")) as (base, _state):
            api = keep(
                client.post(
                    f"/projects/{project_id}/connections",
                    json={
                        "name": "Boutique",
                        "type": "rest_api",
                        "params": {
                            "base_url": base,
                            "auth": {"kind": "bearer"},
                            "pagination": {"kind": "page_number", "page_size": 3},
                            "endpoints": [{"name": "orders", "path": "/page/orders"}],
                        },
                        "secrets": {"token": TOKEN},
                    },
                )
            ).json()
            loaded = keep(
                client.post(
                    f"/connections/{api['id']}/import",
                    json={"endpoints": [{"endpoint": "orders"}]},
                )
            )
            assert loaded.json()["run"]["status"] == "succeeded", loaded.text

        sources = keep(client.get(f"/projects/{project_id}/sources")).json()
        columns = {
            c["name"]
            for s in sources
            for c in keep(client.get(f"/sources/{s['id']}")).json()["columns"]
        }
        assert any("montant" in c for c in columns)
        for source in sources:
            assert client.post(f"/sources/{source['id']}/plan/approve").status_code == 200
        built = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
        assert built.json()["status"] == "succeeded", built.text

        # The language model is asked for a star model: its context, seen whole.
        state: AppState = client.app.state.forja  # type: ignore[attr-defined]
        provider = _Recording()
        # The answer is refused: the proposal falls back on the heuristic, the prompt is kept.
        GoldPlanService(state.catalog, LLMGoldProposer(provider, state.catalog)).propose(project_id)
        assert provider.prompts

        for path in (
            f"/projects/{project_id}/connections",
            f"/connections/{database['id']}",
            f"/connections/{api['id']}",
            f"/projects/{project_id}/runs?limit=50",
            "/audit",
            "/notifications?limit=50&offset=0",
            f"/projects/{project_id}/graph",
        ):
            keep(client.get(path))
        runs = client.get(f"/projects/{project_id}/runs?limit=50").json()
        for run in runs["items"] if isinstance(runs, dict) else runs:
            keep(client.get(f"/runs/{run['id']}/logs"))

        workspace = b""
        for file in settings.data_dir.rglob("*"):
            if not file.is_file() or file.stat().st_size > 50_000_000:
                continue
            try:
                workspace += file.read_bytes()
            except PermissionError:
                continue  # A database the API holds open (Windows): read through it below.
        catalog = "\n".join(
            repr(state.catalog._fetchall(f'SELECT * FROM "{name}"'))
            for (name,) in state.catalog._fetchall(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            )
        )
        outputs = {
            "API responses": "\n".join(responses),
            "log lines": caplog.text,
            "language model context": "\n".join(provider.prompts),
            "catalog": catalog,
        }
        for secret in (db.READER_PASSWORD, TOKEN):
            for where, text in outputs.items():
                assert secret not in text, f"{secret!r} in {where}"
            assert secret.encode() not in workspace, f"{secret!r} in a workspace file"
        # Nor any value of the data: names and statistics only.
        context = outputs["language model context"]
        assert "Client 1" not in context and "SKU-1-0" not in context
    finally:
        _sql(postgres, "DROP SCHEMA IF EXISTS ventes CASCADE")
