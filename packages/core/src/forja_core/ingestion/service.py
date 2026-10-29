"""Ingestion pipeline: read a file, land it in Bronze as a new version, register and profile it."""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from pathlib import Path

import pyarrow as pa

from forja_core import duck
from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ForjaError, IngestionError, SourceNotFoundError
from forja_core.ingestion.detection import detect_format
from forja_core.ingestion.drift import compute_drift
from forja_core.ingestion.landing import (
    Landed,
    Lander,
    Technical,
    guard,
    land_csv,
    land_json,
    land_parquet,
    land_table,
)
from forja_core.ingestion.readers import RawTable, read_source
from forja_core.logging import get_logger
from forja_core.models import (
    TECHNICAL_COLUMNS,
    ColumnSchema,
    IngestMode,
    Source,
    SourceFormat,
    SourceVersion,
)
from forja_core.profiling.models import ProfileReport
from forja_core.profiling.profiler import Profiler
from forja_core.storage import Workspace
from forja_core.utils import slugify, sql_literal, unique_name, utcnow

log = get_logger(__name__)

_HEAD_BYTES = 8


@dataclass(frozen=True)
class IngestedVersion:
    source: Source
    version: SourceVersion
    profile: ProfileReport | None


VersionListener = Callable[[IngestedVersion], None]


@dataclass(frozen=True)
class PendingTable:
    """A table of an uploaded file, landed when its source version is created."""

    sheet_name: str | None
    land: Lander


def _raw_lander(raw: RawTable) -> Lander:
    def land(target: Path, technical: Technical) -> Landed:
        rows = land_table(raw.table, target, technical)
        return Landed(
            row_count=rows,
            column_count=raw.table.num_columns,
            encoding=raw.encoding,
            delimiter=raw.delimiter,
            warnings=list(raw.warnings),
        )

    return land


def row_hashes(table: pa.Table) -> list[str]:
    """SHA-256 of each row's values, in column order, serialized as canonical JSON."""
    columns = [column.to_pylist() for column in table.columns]
    return [
        hashlib.sha256(
            json.dumps(list(row), default=str, ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest()
        for row in zip(*columns, strict=True)
    ]


def describe_parquet(path: Path) -> list[ColumnSchema]:
    with duck.connect() as con:
        rows = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet({sql_literal(str(path))})"
        ).fetchall()
    return [
        ColumnSchema(name=str(r[0]), type=str(r[1]), technical=r[0] in TECHNICAL_COLUMNS)
        for r in rows
    ]


def count_new_rows(current: Path, previous: list[Path]) -> int:
    """Rows of ``current`` whose hash does not appear in any earlier version."""
    with duck.connect() as con:
        if not previous:
            [(count,)] = con.execute(
                f"SELECT count(*) FROM read_parquet({sql_literal(str(current))})"
            ).fetchall()
            return int(count)
        known = ", ".join(sql_literal(str(p)) for p in previous)
        [(count,)] = con.execute(
            f"SELECT count(*) FROM read_parquet({sql_literal(str(current))}) "
            f"WHERE _row_hash NOT IN (SELECT _row_hash FROM read_parquet([{known}]))"
        ).fetchall()
    return int(count)


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
        self._listeners: list[VersionListener] = []

    def subscribe(self, listener: VersionListener) -> None:
        """Call ``listener`` after each ingested version (used to refresh Silver plans)."""
        self._listeners.append(listener)

    def ingest_file(
        self,
        project_id: str,
        path: Path,
        original_filename: str,
        *,
        mode: IngestMode = IngestMode.AUTO,
        target_source_id: str | None = None,
    ) -> list[Source]:
        """Ingest one uploaded file.

        ``auto`` adds a version to the source with the same logical name, or creates it.
        ``new_source`` always creates a source. ``new_version`` requires an existing source,
        either ``target_source_id`` or the one with the same logical name.
        Excel workbooks produce one table per non-empty sheet.
        """
        self.catalog.get_project(project_id)
        target = self.catalog.get_source(target_source_id) if target_source_id else None
        if target is not None and target.project_id != project_id:
            raise SourceNotFoundError(f"source '{target.id}' not found in project '{project_id}'")
        if target is not None:
            mode = IngestMode.NEW_VERSION

        filename = Path(original_filename).name or "upload"
        with path.open("rb") as handle:
            head = handle.read(_HEAD_BYTES)
        fmt = detect_format(filename, head)
        bound = log.bind(project_id=project_id, filename=filename, format=fmt.value, mode=mode)
        bound.info("ingestion_started")

        try:
            pending = self._pending_tables(path, fmt)
        except ForjaError as exc:
            bound.warning("ingestion_rejected", error_code=exc.code, error=exc.message)
            raise

        base_name = slugify(Path(filename).stem)
        named = [(self._logical_name(base_name, table), table) for table in pending]
        if target is not None:
            named = [self._pick_table_for(target, named)]

        sources: list[Source] = []
        for logical_name, table in named:
            existing = target or self.catalog.find_source_by_name(project_id, logical_name)
            if mode is IngestMode.NEW_VERSION and existing is None:
                raise SourceNotFoundError(
                    f"no source named '{logical_name}' to add a version to",
                    details={"name": logical_name},
                )
            try:
                source = self.ingest(
                    project_id,
                    table.land,
                    name=logical_name,
                    filename=filename,
                    fmt=fmt,
                    sheet_name=table.sheet_name,
                    existing=None if mode is IngestMode.NEW_SOURCE else existing,
                )
            except ForjaError as exc:
                bound.warning("ingestion_rejected", error_code=exc.code, error=exc.message)
                raise
            sources.append(source)
        return sources

    def ingest(
        self,
        project_id: str,
        land: Lander,
        *,
        name: str,
        filename: str,
        fmt: SourceFormat,
        sheet_name: str | None = None,
        existing: Source | None = None,
        source_id: str | None = None,
    ) -> Source:
        """Land one table as the first version of a new source (named after ``name``,
        with id ``source_id`` if given) or as a new version of ``existing``, profile it and
        notify the listeners.
        """
        self.workspace.ensure_project(project_id)
        ingested_at = utcnow()
        if existing is None:
            unique = unique_name(name, self.catalog.source_names(project_id))
            ingested = self._create_source(
                project_id, unique, filename, fmt, sheet_name, land, ingested_at, source_id
            )
        else:
            ingested = self._add_version(existing, filename, fmt, sheet_name, land, ingested_at)
        for listener in self._listeners:
            listener(ingested)
        source = self.catalog.get_source(ingested.source.id)
        log.info(
            "source_ingested",
            project_id=project_id,
            source_id=source.id,
            source=source.name,
            format=fmt.value,
            version=source.version,
            rows=ingested.version.row_count,
            new_rows=ingested.version.new_row_count,
            schema_drift=bool(source.schema_drift and source.schema_drift.has_drift),
        )
        return source

    def _pending_tables(self, path: Path, fmt: SourceFormat) -> list[PendingTable]:
        policy = self.settings.duplicate_columns
        match fmt:
            case SourceFormat.CSV:
                lander: Lander = partial(land_csv, path, policy)
            case SourceFormat.PARQUET:
                lander = partial(land_parquet, path, policy)
            case SourceFormat.JSON:
                lander = partial(land_json, path, policy)
            case SourceFormat.EXCEL:
                return [
                    PendingTable(raw.sheet_name, guard(_raw_lander(raw), fmt.value))
                    for raw in read_source(path, fmt, policy)
                ]
            case _:
                raise IngestionError(f"{fmt.value} sources are not files")
        return [PendingTable(None, guard(lander, fmt.value))]

    @staticmethod
    def _logical_name(base_name: str, table: PendingTable) -> str:
        if table.sheet_name is None:
            return base_name
        return f"{base_name}__{slugify(table.sheet_name, default='sheet')}"

    @staticmethod
    def _pick_table_for(
        target: Source, named: list[tuple[str, PendingTable]]
    ) -> tuple[str, PendingTable]:
        if len(named) == 1:
            return named[0]
        for candidate in named:
            if candidate[0].lower() == target.name.lower() or (
                target.sheet_name is not None and candidate[1].sheet_name == target.sheet_name
            ):
                return candidate
        raise IngestionError(
            f"the workbook has {len(named)} sheets and none matches source '{target.name}'",
            details={"sheets": [table.sheet_name for _, table in named]},
        )

    def _create_source(
        self,
        project_id: str,
        name: str,
        filename: str,
        fmt: SourceFormat,
        sheet_name: str | None,
        land: Lander,
        ingested_at: datetime,
        source_id: str | None = None,
    ) -> IngestedVersion:
        source_id = source_id or uuid.uuid4().hex
        version, column_count = self._land(
            project_id,
            source_id,
            name,
            1,
            filename,
            fmt,
            sheet_name,
            land,
            ingested_at,
            previous=[],
        )
        profile = self._profile(source_id, name, version)
        source = Source(
            id=source_id,
            project_id=project_id,
            name=name,
            format=fmt,
            original_filename=filename,
            sheet_name=sheet_name,
            encoding=version.encoding,
            delimiter=version.delimiter,
            row_count=version.row_count,
            column_count=column_count,
            columns=version.columns,
            bronze_path=version.bronze_path,
            warnings=version.warnings,
            ingested_at=ingested_at,
            version=1,
            latest_version_id=version.id,
        )
        self.catalog.add_source(source, version)
        if profile is not None:
            self.catalog.save_profile(profile)
        return IngestedVersion(source=source, version=version, profile=profile)

    def _add_version(
        self,
        source: Source,
        filename: str,
        fmt: SourceFormat,
        sheet_name: str | None,
        land: Lander,
        ingested_at: datetime,
    ) -> IngestedVersion:
        history = self.catalog.list_versions(source.id)
        previous = history[-1]
        version, column_count = self._land(
            source.project_id,
            source.id,
            source.name,
            previous.version + 1,
            filename,
            fmt,
            sheet_name,
            land,
            ingested_at,
            previous=[self.workspace.resolve(v.bronze_path) for v in history],
        )
        profile = self._profile(source.id, source.name, version)
        previous_profile = self._previous_profile(source.id, previous.version)
        version.schema_drift = compute_drift(
            previous_version=previous.version,
            previous_columns=previous.columns,
            current_columns=version.columns,
            previous_profile=previous_profile,
            current_profile=profile,
        )
        if version.schema_drift.has_drift:
            log.warning(
                "schema_drift_detected",
                source_id=source.id,
                version=version.version,
                added=version.schema_drift.added,
                removed=version.schema_drift.removed,
                type_changed=[c.column for c in version.schema_drift.type_changed],
            )
        self.catalog.add_version(version, column_count)
        if profile is not None:
            self.catalog.save_profile(profile)
        return IngestedVersion(
            source=self.catalog.get_source(source.id), version=version, profile=profile
        )

    def _previous_profile(self, source_id: str, version: int) -> ProfileReport | None:
        try:
            return self.catalog.get_profile(source_id, version=version)
        except ForjaError:
            return None

    def _land(
        self,
        project_id: str,
        source_id: str,
        name: str,
        version_number: int,
        filename: str,
        fmt: SourceFormat,
        sheet_name: str | None,
        land: Lander,
        ingested_at: datetime,
        *,
        previous: list[Path],
    ) -> tuple[SourceVersion, int]:
        batch_id = uuid.uuid4().hex
        source_file = filename if sheet_name is None else f"{filename}#{sheet_name}"
        target_dir = self.workspace.bronze_source_dir(project_id, name)
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = ingested_at.strftime("%Y%m%dT%H%M%S%fZ")
        stem = slugify(Path(filename).stem, default="data")
        target = target_dir / f"{stamp}_v{version_number:04d}_{stem}.parquet"
        landed = land(target, Technical(batch_id, ingested_at, source_file))

        version = SourceVersion(
            id=batch_id,
            source_id=source_id,
            version=version_number,
            format=fmt,
            original_filename=filename,
            sheet_name=sheet_name,
            encoding=landed.encoding,
            delimiter=landed.delimiter,
            row_count=landed.row_count,
            new_row_count=count_new_rows(target, previous),
            columns=describe_parquet(target),
            bronze_path=self.workspace.relative(target),
            warnings=list(landed.warnings),
            ingested_at=ingested_at,
        )
        return version, landed.column_count

    def _profile(self, source_id: str, name: str, version: SourceVersion) -> ProfileReport | None:
        try:
            return self.profiler.profile(
                source_id=source_id,
                source_name=name,
                parquet_path=self.workspace.resolve(version.bronze_path),
                version_id=version.id,
                version=version.version,
            )
        except ForjaError as exc:
            log.error("profiling_failed", source_id=source_id, error=exc.message)
            return None
