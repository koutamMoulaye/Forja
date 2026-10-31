"""Volume: a generated CSV file from ingestion to an exported data mart.

Opt-in, it takes minutes:

    FORJA_VOLUME_ROWS=5000000 uv run pytest tests/test_volume.py -s     # local
    FORJA_VOLUME_ROWS=1000000 ...                                         # CI

Ingestion, profile, Silver, Gold (heuristic proposal, no language model), a data mart
asked in French, then the export of the published tables: time and peak memory (resident
set of the API process and of the dbt subprocess, sampled every 50 ms) for each step, and
the disk used after it; everything generated is deleted afterwards. The measures are
printed as JSON and written to ``$FORJA_VOLUME_REPORT`` when set. Below 6 GB of free
memory the test stops before measuring: the figures would be the machine's, not Forja's.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import duckdb
import psutil
import pytest

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.models import Layer
from tests.auth import api_client
from tests.campaign import reference as ref

ROWS = int(os.environ.get("FORJA_VOLUME_ROWS", "0"))
MIN_FREE_GB = float(os.environ.get("FORJA_VOLUME_MIN_FREE_GB", "6"))
pytestmark = [
    pytest.mark.volume,
    pytest.mark.skipif(ROWS <= 0, reason="set FORJA_VOLUME_ROWS to run the volume test"),
]


@dataclass
class PeakSampler:
    """Highest resident memory of this process and its children while running."""

    interval: float = 0.05
    peak: int = 0
    _stop: threading.Event = field(default_factory=threading.Event)

    def _rss(self) -> int:
        process = psutil.Process()
        total = process.memory_info().rss
        for child in process.children(recursive=True):
            try:
                total += child.memory_info().rss
            except psutil.Error:
                continue
        return int(total)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.peak = max(self.peak, self._rss())
            self._stop.wait(self.interval)

    @contextmanager
    def running(self) -> Iterator[None]:
        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()
        try:
            yield
        finally:
            self._stop.set()
            thread.join()
            self.peak = max(self.peak, self._rss())


def enough_memory() -> None:
    free = psutil.virtual_memory().available / 1024**3
    if free < MIN_FREE_GB:
        pytest.fail(
            f"only {free:.1f} GB of free memory (at least {MIN_FREE_GB:g} GB wanted): free "
            "some before measuring",
            pytrace=False,
        )


def measure[T](
    name: str, results: dict[str, Any], step: Callable[[], T], disk: Path | None = None
) -> T:
    enough_memory()
    sampler = PeakSampler()
    started = time.perf_counter()
    with sampler.running():
        value = step()
    results[name] = {
        "seconds": round(time.perf_counter() - started, 1),
        "peak_memory_mb": round(sampler.peak / 1024**2),
    }
    if disk is not None:
        results[name]["disk_after_mb"] = round(_size(disk) / 1024**2)
    return value


def _size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def generate(path: Path, rows: int) -> None:
    """Orders written by DuckDB; the last hundredth repeats earlier rows exactly
    (duplicates for the profile and the Silver deduplication), with personal data."""
    with duckdb.connect() as con:
        con.execute(
            f"""
            COPY (
                SELECT
                    CAST(j AS VARCHAR) AS id_commande,
                    'client' || CAST(j % 50000 AS VARCHAR) || '@exemple.fr' AS email,
                    ['Lyon', 'Paris', 'Nantes', 'Lille', 'Bordeaux'][1 + j % 5] AS ville,
                    CAST(round((j % 9973) * 1.37, 2) AS VARCHAR) AS montant,
                    strftime(DATE '2024-01-01' + CAST(j % 730 AS INTEGER), '%Y-%m-%d')
                        AS date_commande,
                    CASE WHEN j % 17 = 0 THEN NULL
                        ELSE ['payée', 'en attente', 'annulée'][1 + j % 3] END AS statut
                FROM (
                    SELECT CASE WHEN i >= {rows} - {rows} // 100 THEN i - {rows} // 2 ELSE i END
                        AS j
                    FROM range({rows}) t(i)
                )
            ) TO '{path.as_posix()}' (HEADER, DELIMITER ';')
            """
        )


def test_volume(tmp_path: Path) -> None:
    enough_memory()
    root = tmp_path / "volume"
    settings = Settings(
        data_dir=root / "data",
        secrets_dir=root / "secrets",
        log_format="console",
        log_level="WARNING",
        job_runner="inline",
        scheduler_enabled=False,
        auto_approve_silver=True,
    )
    results: dict[str, Any] = {"rows": ROWS, "machine": {
        "cpus": os.cpu_count(),
        "memory_gb": round(psutil.virtual_memory().total / 1024**3, 1),
        "duckdb_memory_limit": settings.duckdb_memory_limit,
        "duckdb_threads": settings.duckdb_threads,
    }}  # fmt: skip
    source_file = root / "commandes.csv"
    data = settings.data_dir
    root.mkdir(parents=True)
    try:
        with api_client(settings) as client:
            state: AppState = client.app.state.forja  # type: ignore[attr-defined]
            measure("generate", results, lambda: generate(source_file, ROWS))
            results["csv_mb"] = round(source_file.stat().st_size / 1024**2)
            project_id = client.post("/projects", json={"name": "Volume"}).json()["id"]

            [source] = measure(
                "ingest_and_profile",
                results,
                lambda: state.ingestion.ingest_file(project_id, source_file, "commandes.csv"),
                data,
            )
            profile = state.catalog.get_profile(source.id)
            assert source.row_count == ROWS
            assert profile.row_count == ROWS and profile.sampled is (
                settings.profiling_full_scan_rows < ROWS
            )
            assert profile.duplicates.duplicate_rows > 0
            results["profile_seconds"] = round((profile.duration_ms or 0) / 1000, 1)
            results["ingest_seconds"] = round(
                results["ingest_and_profile"]["seconds"] - results["profile_seconds"], 1
            )
            results["bronze_mb"] = round(
                _size(state.workspace.layer_dir(project_id, Layer.BRONZE)) / 1024**2
            )

            def silver() -> None:
                job = ref.run(
                    client,
                    client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"}),
                )
                results["silver_rows_valid"] = (job.get("metrics") or {}).get("rows_valid")

            measure("silver_build", results, silver, data)
            results["warehouse_mb"] = round(
                state.generator.warehouse_path(project_id).stat().st_size / 1024**2
            )

            def gold() -> None:
                ref.run(
                    client,
                    client.post(
                        f"/projects/{project_id}/gold-plan/propose", json={"use_llm": False}
                    ),
                )
                approved = client.post(f"/projects/{project_id}/gold-plan/approve")
                assert approved.status_code == 200, approved.text
                ref.run(
                    client,
                    client.post(f"/projects/{project_id}/runs", json={"type": "build_gold"}),
                )

            measure("gold_build", results, gold, data)

            def mart() -> None:
                request = ref.ask_mart(client, project_id, "Montant des commandes par ville")
                validated = client.post(f"/mart-requests/{request['id']}/validate")
                ref.run(client, validated)
                published = client.get(f"/mart-requests/{request['id']}").json()
                assert published["status"] == "published", published["status"]
                results["mart"] = published["published_name"]

            measure("data_mart", results, mart, data)

            def export() -> None:
                ref.run(
                    client,
                    client.post(
                        f"/projects/{project_id}/runs",
                        json={"type": "export", "formats": ["parquet", "csv"]},
                    ),
                )

            measure("export", results, export, data)
            results["exports_mb"] = round(_size(state.publisher.exports_dir(project_id)) / 1024**2)
            results["disk_total_mb"] = round(_size(root) / 1024**2)
    finally:
        shutil.rmtree(root, ignore_errors=True)
    assert not root.exists()
    report = json.dumps(results, indent=2, ensure_ascii=False)
    print(report)
    target = os.environ.get("FORJA_VOLUME_REPORT")
    if target:
        Path(target).write_text(report + "\n", encoding="utf-8")
    # Streaming keeps memory far below the data size, within DuckDB's limit.
    limit_mb = int(settings.duckdb_memory_limit.removesuffix("GB")) * 1024
    for step in ("ingest_and_profile", "silver_build", "gold_build", "data_mart", "export"):
        assert results[step]["peak_memory_mb"] < limit_mb + 1024, results
