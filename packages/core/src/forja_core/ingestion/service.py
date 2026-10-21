"""Ingestion pipeline: read a file, land it in Bronze, register it and profile it."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ForjaError
from forja_core.ingestion.detection import detect_format
from forja_core.ingestion.readers import RawTable, read_source
from forja_core.logging import get_logger
from forja_core.models import TECHNICAL_COLUMNS, ColumnSchema, Source, SourceFormat
from forja_core.profiling.profiler import Profiler
from forja_core.storage import Workspace
from forja_core.utils import slugify, sql_literal, unique_name, utcnow

log = get_logger(__name__)

_HEAD_BYTES = 8


def row_hashes(table: pa.Table) -> list[str]:
    """SHA-256 of each row's values, in column order, serialized as canonical JSON."""
    columns = [column.to_pylist() for column in table.columns]
    return [
        hashlib.sha256(
            json.dumps(list(row), default=str, ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest()
        for row in zip(*columns, strict=True)
    ]


def add_technical_columns(table: pa.Table, source_file: str, ingested_at: datetime) -> pa.Table:
    rows = table.num_rows
    hashes = row_hashes(table)
    table = table.append_column(
        "_ingested_at", pa.array([ingested_at] * rows, type=pa.timestamp("us", tz="UTC"))
    )
    table = table.append_column("_source_file", pa.array([source_file] * rows, type=pa.string()))
    return table.append_column("_row_hash", pa.array(hashes, type=pa.string()))


def describe_parquet(path: Path) -> list[ColumnSchema]:
    with duckdb.connect() as con:
        rows = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet({sql_literal(str(path))})"
        ).fetchall()
    return [
        ColumnSchema(name=str(r[0]), type=str(r[1]), technical=r[0] in TECHNICAL_COLUMNS)
        for r in rows
    ]


class IngestionService:
    def __init__(
        self,
        catalog: Catalog,
        workspace: Workspace,
        settings: Settings,
        profiler: Profiler | None = None,
    ) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.settings = settings
        self.profiler = profiler or Profiler(settings)

    def ingest_file(self, project_id: str, path: Path, original_filename: str) -> list[Source]:
        """Ingest one uploaded file. Excel workbooks produce one source per non-empty sheet."""
        self.catalog.get_project(project_id)
        filename = Path(original_filename).name or "upload"
        with path.open("rb") as handle:
            head = handle.read(_HEAD_BYTES)
        fmt = detect_format(filename, head)
        bound = log.bind(project_id=project_id, filename=filename, format=fmt.value)
        bound.info("ingestion_started")

        try:
            raw_tables = read_source(path, fmt, self.settings.duplicate_columns)
        except ForjaError as exc:
            bound.warning("ingestion_rejected", error_code=exc.code, error=exc.message)
            raise

        self.workspace.ensure_project(project_id)
        taken = self.catalog.source_names(project_id)
        base_name = slugify(Path(filename).stem)
        ingested_at = utcnow()
        sources: list[Source] = []
        for raw in raw_tables:
            name = self._source_name(base_name, raw, taken)
            taken.add(name)
            source = self._land(project_id, name, filename, fmt, raw, ingested_at)
            self.catalog.add_source(source)
            self._profile(source)
            sources.append(self.catalog.get_source(source.id))
            bound.info(
                "source_ingested",
                source_id=source.id,
                source=name,
                rows=source.row_count,
                columns=source.column_count,
                warnings=len(source.warnings),
            )
        return sources

    @staticmethod
    def _source_name(base_name: str, raw: RawTable, taken: set[str]) -> str:
        name = base_name
        if raw.sheet_name is not None:
            name = f"{base_name}__{slugify(raw.sheet_name, default='sheet')}"
        return unique_name(name, taken)

    def _land(
        self,
        project_id: str,
        name: str,
        filename: str,
        fmt: SourceFormat,
        raw: RawTable,
        ingested_at: datetime,
    ) -> Source:
        source_file = filename if raw.sheet_name is None else f"{filename}#{raw.sheet_name}"
        table = add_technical_columns(raw.table, source_file, ingested_at)

        target_dir = self.workspace.bronze_source_dir(project_id, name)
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = ingested_at.strftime("%Y%m%dT%H%M%S%fZ")
        target = target_dir / f"{stamp}_{slugify(Path(filename).stem, default='data')}.parquet"
        pq.write_table(table, target, compression="zstd")

        columns = describe_parquet(target)
        return Source(
            id=uuid.uuid4().hex,
            project_id=project_id,
            name=name,
            format=fmt,
            original_filename=filename,
            sheet_name=raw.sheet_name,
            encoding=raw.encoding,
            delimiter=raw.delimiter,
            row_count=table.num_rows,
            column_count=raw.table.num_columns,
            columns=columns,
            bronze_path=self.workspace.relative(target),
            warnings=list(raw.warnings),
            ingested_at=ingested_at,
        )

    def _profile(self, source: Source) -> None:
        try:
            report = self.profiler.profile(
                source_id=source.id,
                source_name=source.name,
                parquet_path=self.workspace.resolve(source.bronze_path),
            )
        except ForjaError as exc:
            log.error("profiling_failed", source_id=source.id, error=exc.message)
            return
        self.catalog.save_profile(report)
