"""Scenario 4: volumes from a database and from a large upload. Opt-in, minutes each:

    FORJA_VOLUME_PG_ROWS=10000000 uv run pytest -s tests/campaign/test_volume_sources.py -k postgres
    FORJA_VOLUME_UPLOAD_MB=2048 uv run pytest -s tests/campaign/test_volume_sources.py -k upload

A PostgreSQL table loaded incrementally (first load, then only the new rows), and a file
uploaded in chunks, cut twice (once in the middle of a chunk). Time, peak memory and disk
for each step, written to $FORJA_CAMPAIGN_REPORT when set; everything is deleted after.
"""

from __future__ import annotations

import os
import shutil
from collections.abc import Iterator
from pathlib import Path

import duckdb
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from tests import databases as db
from tests.auth import api_client
from tests.campaign import reference as ref
from tests.test_volume import enough_memory

PG_ROWS = int(os.environ.get("FORJA_VOLUME_PG_ROWS", "0"))
UPLOAD_MB = int(os.environ.get("FORJA_VOLUME_UPLOAD_MB", "0"))
NEW_ROWS = 100_000


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    # Small trial files still need several chunks to be cut.
    chunk_mb = settings.upload_chunk_mb if UPLOAD_MB >= 100 else 1
    local = settings.model_copy(
        update={"job_runner": "inline", "scheduler_enabled": False, "upload_chunk_mb": chunk_mb}
    )
    with api_client(local) as admin:
        yield admin
    shutil.rmtree(settings.data_dir, ignore_errors=True)


def _sql(database: db.TestDatabase, *statements: str) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        for statement in statements:
            con.execute(sa.text(statement))
    engine.dispose()


def _orders(first: int, count: int, day: str) -> str:
    """Generated server side: no row crosses the network to be written."""
    return (
        "INSERT INTO volume.commandes "
        "SELECT i, 'C' || (i % 50000), (ARRAY['Lyon','Paris','Nantes','Lille'])[1 + i % 4], "
        f"round(((i % 9973) * 1.37)::numeric, 2), TIMESTAMP '{day}' + (i % 86400) * INTERVAL '1 s' "
        f"FROM generate_series({first}, {first + count - 1}) AS i"
    )


@pytest.mark.databases
@pytest.mark.skipif(PG_ROWS <= 0, reason="set FORJA_VOLUME_PG_ROWS to run it")
def test_postgres_table_loaded_incrementally(
    client: TestClient, postgres: db.TestDatabase, settings: Settings
) -> None:
    enough_memory()
    timer = ref.Timer(f"volume-postgres-{PG_ROWS}", settings.data_dir)
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    with timer.step("seed PostgreSQL"):
        _sql(
            postgres,
            "DROP SCHEMA IF EXISTS volume CASCADE",
            "CREATE SCHEMA volume",
            "CREATE UNLOGGED TABLE volume.commandes (id_commande BIGINT PRIMARY KEY, "
            "id_client TEXT NOT NULL, ville TEXT NOT NULL, montant NUMERIC(10, 2) NOT NULL, "
            "updated_at TIMESTAMP NOT NULL)",
            _orders(1, PG_ROWS, "2026-01-01"),
            "CREATE INDEX ON volume.commandes (updated_at)",
            f"GRANT USAGE ON SCHEMA volume TO {db.READER}",
            f"GRANT SELECT ON ALL TABLES IN SCHEMA volume TO {db.READER}",
            "ANALYZE volume.commandes",
        )
    try:
        project_id = client.post("/projects", json={"name": "Volume PG"}).json()["id"]
        connection = client.post(
            f"/projects/{project_id}/connections",
            json={
                "name": "Volume",
                "type": "postgres",
                "params": postgres.params(),
                "secrets": {"password": db.READER_PASSWORD},
            },
        ).json()
        enough_memory()
        with timer.step("first load"):
            imported = client.post(
                f"/connections/{connection['id']}/import",
                json={
                    "tables": [
                        {
                            "schema_name": "volume",
                            "table": "commandes",
                            "mode": "incremental",
                            "cursor_column": "updated_at",
                        }
                    ]
                },
            )
            first = imported.json()["run"]
            assert first["status"] == "succeeded", imported.text
        [source] = client.get(f"/projects/{project_id}/sources").json()
        assert source["row_count"] == PG_ROWS

        _sql(postgres, _orders(PG_ROWS + 1, NEW_ROWS, "2026-01-02"))
        enough_memory()
        with timer.step("incremental load"):
            again = client.post(f"/connections/{connection['id']}/load", json={})
            assert again.json()["status"] == "succeeded", again.text
        assert again.json()["metrics"]["loads"][0]["rows"] == NEW_ROWS

        assert client.post(f"/sources/{source['id']}/plan/approve").status_code == 200
        enough_memory()
        with timer.step("Silver"):
            built = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
            assert built.json()["status"] == "succeeded", built.text
        timer.write(
            rows=PG_ROWS,
            new_rows=NEW_ROWS,
            warehouse_mb=round(state.generator.warehouse_path(project_id).stat().st_size / 2**20),
        )
        print(timer.steps, timer.memory, timer.disk)
    finally:
        _sql(postgres, "DROP SCHEMA IF EXISTS volume CASCADE")


def _put(client: TestClient, upload_id: str, offset: int, data: bytes) -> int:
    response = client.put(
        f"/uploads/{upload_id}/chunks",
        params={"offset": offset},
        content=data,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200, response.text
    return int(response.json()["received"])


@pytest.mark.skipif(UPLOAD_MB <= 0, reason="set FORJA_VOLUME_UPLOAD_MB to run it")
def test_large_upload_cut_twice(client: TestClient, settings: Settings, tmp_path: Path) -> None:
    enough_memory()
    timer = ref.Timer(f"volume-upload-{UPLOAD_MB}mb", settings.data_dir)
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    file = tmp_path / "ventes.csv"
    rows = UPLOAD_MB * 2**20 // 62  # about 62 bytes a line
    with timer.step("generate"), duckdb.connect() as con:
        con.execute(
            f"""COPY (SELECT i AS id_vente, 'C' || (i % 50000) AS id_client,
                ['Lyon', 'Paris', 'Nantes', 'Lille'][1 + i % 4] AS ville,
                CAST(round((i % 9973) * 1.37, 2) AS VARCHAR) AS montant,
                DATE '2024-01-01' + CAST(i % 730 AS INTEGER) AS date_vente
            FROM range({rows}) t(i)) TO '{file.as_posix()}' (HEADER, DELIMITER ';')"""
        )
    size = file.stat().st_size
    project_id = client.post("/projects", json={"name": "Gros envoi"}).json()["id"]
    opening = {"filename": "ventes.csv", "size": size, "fingerprint": f"ventes-{size}"}
    upload = client.post(f"/projects/{project_id}/uploads", json=opening).json()
    chunk = int(upload["chunk_size"])
    try:
        with timer.step("upload, cut twice"), file.open("rb") as handle:
            offset = 0
            for cut in (0.3, 0.7):
                while offset < size * cut:
                    handle.seek(offset)
                    offset = _put(client, upload["id"], offset, handle.read(chunk))
                if cut == 0.3:
                    # Cut in the middle of a chunk: half of it reached the disk.
                    staged = state.uploads.staged_path(state.uploads.get(upload["id"]))
                    handle.seek(offset)
                    with staged.open("ab") as partial:
                        partial.write(handle.read(chunk // 2))
                # The page is opened again: the same file finds where to resume.
                again = client.post(f"/projects/{project_id}/uploads", json=opening).json()
                assert again["id"] == upload["id"]
                assert again["received"] >= offset
                offset = int(again["received"])
            while offset < size:
                handle.seek(offset)
                offset = _put(client, upload["id"], offset, handle.read(chunk))
        file.unlink()
        enough_memory()
        with timer.step("ingestion and profile"):
            job = ref.run(client, client.post(f"/uploads/{upload['id']}/complete"))
        [source_id] = job["result"]["sources"]
        assert client.get(f"/sources/{source_id}").json()["row_count"] == rows
        timer.write(file_mb=round(size / 2**20), rows=rows, chunk_mb=chunk // 2**20)
        print(timer.steps, timer.memory, timer.disk)
    finally:
        file.unlink(missing_ok=True)
