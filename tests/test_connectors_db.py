"""Database connectors against real PostgreSQL, MySQL (and SQL Server in CI) containers."""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests import databases as db
from tests.auth import api_client, user_client

pytestmark = pytest.mark.databases


def _servers() -> list[db.TestDatabase]:
    servers = [db.POSTGRES, db.MYSQL]
    if os.environ.get("FORJA_TEST_SQLSERVER") == "1":
        servers.append(db.SQLSERVER)
    return servers


@pytest.fixture(scope="module")
def running() -> Iterator[None]:
    mode = db.mode()
    if mode == "skip":
        pytest.skip("FORJA_TEST_DATABASES=skip")
    if not db.docker_available():
        if mode == "require":
            pytest.fail("Docker is required for the database connector tests")
        pytest.skip("Docker does not answer: database connector tests skipped")
    profiles = ["test-db"] + (
        ["test-sqlserver"] if os.environ.get("FORJA_TEST_SQLSERVER") == "1" else []
    )
    for profile in profiles:
        db.start(profile)
    try:
        yield
    finally:
        for profile in profiles:
            db.stop(profile)


@pytest.fixture(params=_servers(), ids=lambda d: d.kind)
def database(request: pytest.FixtureRequest, running: None) -> db.TestDatabase:
    server: db.TestDatabase = request.param
    db.seed(server)
    return server


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    local = settings.model_copy(update={"job_runner": "inline", "scheduler_enabled": False})
    with api_client(local) as test_client:
        yield test_client


def _connection(
    client: TestClient, database: db.TestDatabase, *, password: str = db.READER_PASSWORD
) -> tuple[str, dict[str, Any]]:
    project = client.post("/projects", json={"name": f"Base {database.kind}"}).json()
    response = client.post(
        f"/projects/{project['id']}/connections",
        json={
            "name": f"{database.kind} boutique",
            "type": database.kind,
            "params": database.params(),
            "secrets": {"password": password},
        },
    )
    assert response.status_code == 201, response.text
    connection: dict[str, Any] = response.json()
    return project["id"], connection


def test_connection_test_reports_a_read_only_account(
    client: TestClient, database: db.TestDatabase
) -> None:
    _, connection = _connection(client, database)
    assert connection["secrets_set"] == ["password"]
    assert db.READER_PASSWORD not in json.dumps(connection)
    result = client.post(f"/connections/{connection['id']}/test").json()
    assert result["ok"] is True, result
    assert result["server_version"]
    assert result["read_only"] in (True, None)
    assert client.get(f"/connections/{connection['id']}").json()["last_test"]["ok"] is True


def test_wrong_password_fails_without_echoing_it(
    client: TestClient, database: db.TestDatabase, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    _, connection = _connection(client, database, password="Not-The-Password-42")
    result = client.post(f"/connections/{connection['id']}/test").json()
    assert result["ok"] is False
    assert "Not-The-Password-42" not in result["message"]
    assert "Not-The-Password-42" not in caplog.text


def test_exploration_lists_tables_columns_estimates_and_cursors(
    client: TestClient, database: db.TestDatabase
) -> None:
    db.analyze(database)
    _, connection = _connection(client, database)
    response = client.get(f"/connections/{connection['id']}/explore")
    assert response.status_code == 200, response.text
    exploration = response.json()
    assert database.schema in exploration["schemas"]
    tables = {t["name"]: t for t in exploration["tables"] if t["schema_name"] == database.schema}
    assert {"customers", "orders", "Order Lines", "paid_orders"} <= set(tables)
    assert tables["paid_orders"]["kind"] == "view"
    orders = tables["orders"]
    assert orders["primary_key"] == ["id"]
    assert orders["suggested_cursor"] == "updated_at"
    assert [c["kind"] for c in orders["cursor_candidates"]] == ["timestamp", "increasing_id"]
    columns = {c["name"]: c for c in orders["columns"]}
    assert columns["amount"]["forja_type"] == "decimal128(10, 2)"
    assert columns["updated_at"]["forja_type"].startswith("timestamp[us")
    assert tables["customers"]["suggested_cursor"] in ("created_at", "id")
    if database.kind != "sqlserver":
        assert (orders["estimated_rows"] or 0) >= 0


def _import(client: TestClient, connection_id: str, tables: list[dict[str, Any]]) -> dict[str, Any]:
    response = client.post(f"/connections/{connection_id}/import", json={"tables": tables})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def test_full_and_incremental_loads(client: TestClient, database: db.TestDatabase) -> None:
    project_id, connection = _connection(client, database)
    schema = database.schema
    body = _import(
        client,
        connection["id"],
        [
            {
                "schema_name": schema,
                "table": "orders",
                "mode": "incremental",
                "cursor_column": "updated_at",
            },
            {"schema_name": schema, "table": "customers"},
            {"schema_name": schema, "table": "Order Lines"},
        ],
    )
    run = body["run"]
    assert run["status"] == "succeeded", run
    loads = {m["object"].split(".")[-1]: m for m in run["metrics"]["loads"]}
    assert loads["orders"]["rows"] == 20 and loads["orders"]["mode"] == "incremental"
    assert loads["customers"]["rows"] == 5
    assert loads["Order Lines"]["rows"] == 3

    sources = {s["name"]: s for s in client.get(f"/projects/{project_id}/sources").json()}
    assert {"orders", "customers", "order_lines"} <= set(sources)
    orders = sources["orders"]
    assert orders["format"] == "database" and orders["row_count"] == 20
    assert orders["origin"]["cursor_column"] == "updated_at"
    types = {c["name"]: c["type"] for c in orders["columns"]}
    assert types["amount"] == "DECIMAL(10,2)"
    assert types["id"] == "BIGINT"
    assert types["ordered_on"] == "DATE"
    lines = {c["name"] for c in sources["order_lines"]["columns"]}
    assert {"line id", "select", "Qty"} <= lines
    profile = client.get(f"/sources/{orders['id']}/profile").json()
    assert profile["row_count"] == 20 and profile["duration_ms"] is not None

    # Three new orders and one modified: only those four rows are read again.
    db.insert_orders(database, range(21, 24), day=2)
    db.touch_order(database, 5, day=3)
    second = client.post(f"/connections/{connection['id']}/load", json={}).json()
    assert second["status"] == "succeeded", second
    loads = {m["object"].split(".")[-1]: m for m in second["metrics"]["loads"]}
    assert loads["orders"]["rows"] == 4
    assert loads["orders"]["version"] == 2
    assert loads["orders"]["cursor_value"].startswith("2026-01-03")
    assert loads["customers"]["rows"] == 5  # full mode: every row, every time
    refreshed = client.get(f"/sources/{orders['id']}").json()
    assert refreshed["version"] == 2 and refreshed["row_count"] == 4
    versions = client.get(f"/sources/{orders['id']}/versions").json()
    assert versions[-1]["new_row_count"] == 4

    # Nothing changed: no new version.
    third = client.post(
        f"/connections/{connection['id']}/load", json={"source_ids": [orders["id"]]}
    ).json()
    assert [m["skipped"] for m in third["metrics"]["loads"]] == ["aucune nouvelle ligne"]
    assert client.get(f"/sources/{orders['id']}").json()["version"] == 2


def test_names_come_from_the_database_only(client: TestClient, database: db.TestDatabase) -> None:
    _, connection = _connection(client, database)
    response = client.post(
        f"/connections/{connection['id']}/import",
        json={
            "tables": [{"schema_name": database.schema, "table": "orders; DROP TABLE customers"}]
        },
    )
    assert response.status_code == 404, response.text
    response = client.post(
        f"/connections/{connection['id']}/import",
        json={
            "tables": [
                {
                    "schema_name": database.schema,
                    "table": "orders",
                    "mode": "incremental",
                    "cursor_column": "id) OR (1=1",
                }
            ]
        },
    )
    assert response.status_code == 422, response.text
    explored = client.get(f"/connections/{connection['id']}/explore").json()
    assert "customers" in {t["name"] for t in explored["tables"]}


def test_connections_are_for_engineers_and_admins(
    settings: Settings, database: db.TestDatabase
) -> None:
    multi = settings.model_copy(
        update={"job_runner": "inline", "scheduler_enabled": False, "auth_mode": "multi"}
    )
    with api_client(multi) as admin:
        project_id, connection = _connection(admin, database)
        with user_client(admin, project_id, "analyste@forja.test", "analyst") as analyst:
            assert analyst.get(f"/projects/{project_id}/connections").status_code == 403
            assert analyst.get(f"/connections/{connection['id']}").status_code == 403
            assert analyst.post(f"/connections/{connection['id']}/load", json={}).status_code == 403
        with user_client(admin, project_id, "ingenieur@forja.test", "engineer") as engineer:
            listed = engineer.get(f"/projects/{project_id}/connections")
            assert listed.status_code == 200
            assert db.READER_PASSWORD not in listed.text
