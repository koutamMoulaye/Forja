from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import duckdb

from forja_core.catalog import SCHEMA_VERSION, Catalog
from forja_core.catalog.migrations import MIGRATIONS
from forja_core.models import ProjectCreate


def _create_v1_catalog(path: Path) -> None:
    """A catalog as written by the first release, with one source and its profile."""
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
    con.execute(MIGRATIONS[0][1])
    con.execute("INSERT INTO schema_version VALUES (1)")
    created = datetime(2026, 1, 1, 12, 0)
    con.execute("INSERT INTO projects VALUES ('p1', 'Legacy', NULL, 'medallion', ?)", [created])
    con.execute(
        "INSERT INTO sources VALUES ('s1', 'p1', 'clients', 'csv', 'clients.csv', NULL, "
        "'utf-8', ';', 3, 2, ?, 'p1/bronze/clients/x.parquet', '[]', ?)",
        [json.dumps([{"name": "id", "type": "VARCHAR", "technical": False}]), created],
    )
    report = {
        "source_id": "s1",
        "source_name": "clients",
        "profiled_at": created.isoformat() + "Z",
        "row_count": 3,
        "column_count": 1,
        "columns": [],
        "candidate_keys": [],
        "duplicates": {"duplicate_rows": 0, "duplicate_pct": 0, "duplicate_groups": 0},
        "pii": [],
        "quality": {"score": 90, "formula": "f", "components": [], "issues": []},
    }
    con.execute("INSERT INTO profiles VALUES ('s1', 90, ?, ?)", [json.dumps(report), created])
    con.close()


def test_fresh_catalog_is_at_latest_version(tmp_path: Path) -> None:
    with Catalog(tmp_path / "meta.duckdb") as catalog:
        assert catalog.schema_version == SCHEMA_VERSION


def test_v1_catalog_is_migrated_without_loss(tmp_path: Path) -> None:
    path = tmp_path / "meta.duckdb"
    _create_v1_catalog(path)

    with Catalog(path) as catalog:
        assert catalog.schema_version == SCHEMA_VERSION
        [source] = catalog.list_sources("p1")
        assert source.name == "clients"
        assert source.version == 1
        assert source.latest_version_id == "s1"
        assert source.quality_score == 90

        [version] = catalog.list_versions("s1")
        assert version.id == "s1"
        assert version.new_row_count == 3
        assert catalog.get_profile("s1").quality.score == 90

    # Reopening does not re-apply migrations.
    with Catalog(path) as catalog:
        assert catalog.schema_version == SCHEMA_VERSION


RENAME = "UPDATE projects SET name = ? WHERE id = ?"


def test_reads_do_not_wait_for_a_write(tmp_path: Path) -> None:
    with Catalog(tmp_path / "meta.duckdb") as catalog:
        project = catalog.create_project(ProjectCreate(name="Ventes"))
        held, release = threading.Event(), threading.Event()

        def write() -> None:
            with catalog._transaction():
                catalog._execute(RENAME, ["Achats", project.id])
                held.set()
                release.wait(10)

        writer = threading.Thread(target=write)
        writer.start()
        try:
            assert held.wait(10)
            with ThreadPoolExecutor(1) as pool:
                # Answered while the write is still open, with what was committed.
                read = pool.submit(catalog.get_project, project.id).result(timeout=5)
            assert read.name == "Ventes"
        finally:
            release.set()
            writer.join()
        assert catalog.get_project(project.id).name == "Achats"


def test_a_transaction_reads_its_own_writes(tmp_path: Path) -> None:
    with Catalog(tmp_path / "meta.duckdb") as catalog:
        project = catalog.create_project(ProjectCreate(name="Ventes"))
        with catalog._transaction():
            catalog._execute(RENAME, ["Achats", project.id])
            assert catalog.get_project(project.id).name == "Achats"
