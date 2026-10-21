"""End to end, through the HTTP API and the background worker, with a real dbt build.

v1: dirty French CSV -> plan -> approve -> build -> Silver, rejects, export.
v2: delta with an extra column -> drift detected -> plan refreshed -> incremental build.
"""

from __future__ import annotations

import io
from decimal import Decimal
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.parquet as pq
from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests.fixtures import generate as fx
from tests.test_api import wait_for_run


def _upload(client: TestClient, project_id: str, path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        response = client.post(
            f"/projects/{project_id}/sources", files={"file": ("clients.csv", handle)}
        )
    assert response.status_code == 201, response.text
    [source] = response.json()
    return dict(source)


def _build(client: TestClient, project_id: str) -> dict[str, Any]:
    response = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
    assert response.status_code == 202
    run = wait_for_run(client, response.json()["id"])
    logs = client.get(f"/runs/{run['id']}/logs").text
    assert run["status"] == "succeeded", logs
    return run


def _warehouse(settings: Settings, project_id: str) -> duckdb.DuckDBPyConnection:
    path = settings.data_dir / project_id / "warehouse.duckdb"
    return duckdb.connect(str(path), read_only=True)


def test_dirty_csv_to_silver_rejects_and_exports_then_incremental_v2(
    client: TestClient, settings: Settings, fixtures_dir: Path
) -> None:
    project_id = client.post("/projects", json={"name": "Clients"}).json()["id"]

    # --- v1: ingestion, plan review --------------------------------------------------
    source = _upload(client, project_id, fixtures_dir / fx.CLIENTS_V1)
    source_id = source["id"]
    assert source["version"] == 1
    assert source["delimiter"] == ";" and source["encoding"] == "cp1252"

    plan = client.get(f"/sources/{source_id}/plan").json()
    assert plan["status"] == "draft"
    assert plan["primary_key"]["columns"] == ["id"]
    columns = {c["source_column"]: c for c in plan["columns"]}
    assert columns["date_inscription"]["explanation"].startswith(
        "Conversion en date au format JJ/MM/AAAA, 1 valeur invalide détectée."
    )

    early = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
    assert wait_for_run(client, early.json()["id"])["status"] == "failed"

    approved = client.post(f"/sources/{source_id}/plan/approve").json()
    assert approved["status"] == "approved"

    # --- v1: build ------------------------------------------------------------------
    run = _build(client, project_id)
    metrics = run["metrics"]
    assert metrics["rows_read"] == fx.CLIENTS_V1_ROWS
    assert metrics["duplicates_removed"] == len(fx.FR_DUPLICATED_INDEXES)
    assert metrics["rows_valid"] == fx.CLIENTS_V1_VALID
    assert metrics["rows_rejected"] == fx.CLIENTS_V1_REJECTED
    assert metrics["duration_seconds"] > 0
    assert metrics["dbt_tests"]["failed"] == 0 and metrics["dbt_tests"]["errored"] == 0
    assert client.get(f"/sources/{source_id}/plan").json()["status"] == "applied"

    with _warehouse(settings, project_id) as con:
        [(silver_rows,)] = con.execute("SELECT count(*) FROM stg_clients").fetchall()
        [(rejected_rows,)] = con.execute(
            "SELECT count(*) FROM stg_clients__rejects WHERE _batch_id = ?",
            [source["latest_version_id"]],
        ).fetchall()
        [(email, amount, active)] = con.execute(
            "SELECT email, montant_total, actif FROM stg_clients WHERE id = 1"
        ).fetchall()
    assert silver_rows == fx.CLIENTS_V1_VALID
    assert rejected_rows == fx.CLIENTS_V1_REJECTED
    assert email == "jean.dupont@example.fr"  # Silver keeps personal data in clear
    assert isinstance(amount, Decimal) and isinstance(active, bool)

    # --- v1: exports ----------------------------------------------------------------
    [table] = client.get(f"/projects/{project_id}/tables").json()
    assert table["row_count"] == fx.CLIENTS_V1_VALID
    assert table["rejected_count"] == fx.CLIENTS_V1_REJECTED

    csv = client.get(f"/tables/{table['id']}/export", params={"format": "csv"})
    assert csv.status_code == 200
    text = csv.content.decode("utf-8")
    assert text.splitlines()[0].startswith('"id";"nom";"prenom";"email"')
    assert len(text.splitlines()) == fx.CLIENTS_V1_VALID + 1
    assert "jean.dupont@example.fr" not in text

    parquet = client.get(f"/tables/{table['id']}/export", params={"format": "parquet"})
    exported = pq.read_table(io.BytesIO(parquet.content))
    assert exported.num_rows == fx.CLIENTS_V1_VALID
    assert not any(name.startswith("_") for name in exported.column_names)

    export_run = client.post(f"/projects/{project_id}/runs", json={"type": "export"})
    export = wait_for_run(client, export_run.json()["id"])
    assert export["status"] == "succeeded"
    serving = settings.data_dir / export["metrics"]["serving_path"]
    with duckdb.connect(str(serving), read_only=True) as con:
        [(published,)] = con.execute("SELECT count(*) FROM clients").fetchall()
    assert published == fx.CLIENTS_V1_VALID

    # --- v2: new version with an extra column ----------------------------------------
    v2 = _upload(client, project_id, fixtures_dir / fx.CLIENTS_V2)
    assert v2["id"] == source_id and v2["version"] == 2
    drift = v2["schema_drift"]
    assert drift["has_drift"] is True
    assert drift["added"] == ["segment"] and drift["removed"] == []
    versions = client.get(f"/sources/{source_id}/versions").json()
    assert versions[1]["new_row_count"] == fx.CLIENTS_V2_ROWS

    refreshed = client.get(f"/sources/{source_id}/plan").json()
    assert refreshed["status"] == "draft"
    assert refreshed["version"] == approved["version"] + 1
    assert any("segment" in warning for warning in refreshed["warnings"])
    client.post(f"/sources/{source_id}/plan/approve")

    # --- v2: incremental build ------------------------------------------------------
    run = _build(client, project_id)
    [incremental] = run["metrics"]["sources"]
    assert incremental["full_refresh"] is False
    assert incremental["rows_read"] == fx.CLIENTS_V2_ROWS
    assert incremental["rows_already_processed"] == fx.CLIENTS_V1_ROWS
    assert incremental["rows_valid"] == fx.CLIENTS_V2_ROWS - 1
    assert incremental["rows_rejected"] == 1

    new_clients = len(fx.CLIENTS_V2_NEW_IDS) - 1  # one of them is rejected
    with _warehouse(settings, project_id) as con:
        [(silver_rows,)] = con.execute("SELECT count(*) FROM stg_clients").fetchall()
        [(segment, amount, run_id)] = con.execute(
            "SELECT segment, montant_total, _run_id FROM stg_clients WHERE id = ?",
            [fx.CLIENTS_V2_UPDATED_ID],
        ).fetchall()
        [(untouched_segment, untouched_run)] = con.execute(
            "SELECT segment, _run_id FROM stg_clients WHERE id = 2"
        ).fetchall()
        [(reason,)] = con.execute(
            "SELECT _reject_reason FROM stg_clients__rejects WHERE id = ?",
            [str(fx.CLIENTS_V2_INVALID_ID)],
        ).fetchall()
    assert silver_rows == fx.CLIENTS_V1_VALID + new_clients
    assert (segment, amount, run_id) == ("premium", Decimal("99999.99"), run["id"])
    assert untouched_segment is None and untouched_run != run["id"]
    assert reason == "email : format d'email invalide"
