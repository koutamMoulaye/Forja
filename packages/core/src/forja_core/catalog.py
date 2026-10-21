"""Metadata catalog persisted in a DuckDB database (``forja_meta.duckdb``)."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb

from forja_core.errors import (
    ConflictError,
    ProfileNotFoundError,
    ProjectNotFoundError,
    SourceNotFoundError,
)
from forja_core.logging import get_logger
from forja_core.models import ColumnSchema, Project, ProjectCreate, Source
from forja_core.profiling.models import ProfileReport
from forja_core.utils import utcnow

log = get_logger(__name__)

SCHEMA_VERSION = 1

_DDL = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description VARCHAR,
    architecture VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    format VARCHAR NOT NULL,
    original_filename VARCHAR NOT NULL,
    sheet_name VARCHAR,
    encoding VARCHAR,
    delimiter VARCHAR,
    row_count BIGINT NOT NULL,
    column_count INTEGER NOT NULL,
    columns JSON NOT NULL,
    bronze_path VARCHAR NOT NULL,
    warnings JSON NOT NULL,
    ingested_at TIMESTAMP NOT NULL,
    UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS profiles (
    source_id VARCHAR PRIMARY KEY,
    quality_score DOUBLE NOT NULL,
    report JSON NOT NULL,
    profiled_at TIMESTAMP NOT NULL
);
"""

_SOURCE_COLUMNS = (
    "s.id, s.project_id, s.name, s.format, s.original_filename, s.sheet_name, s.encoding, "
    "s.delimiter, s.row_count, s.column_count, s.columns, s.bronze_path, s.warnings, "
    "s.ingested_at, p.quality_score"
)


def _to_db_timestamp(value: datetime) -> datetime:
    """Store timestamps as naive UTC."""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _from_db_timestamp(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


class Catalog:
    """Thread-safe access to the metadata catalog.

    DuckDB allows a single writer process, so the API process owns one connection
    and serializes access to it.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._con = duckdb.connect(str(path))
        self._migrate()

    def close(self) -> None:
        with self._lock:
            self._con.close()

    def __enter__(self) -> Catalog:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _migrate(self) -> None:
        with self._lock:
            self._con.execute(_DDL)
            row = self._con.execute("SELECT max(version) FROM schema_version").fetchone()
            if row is None or row[0] is None:
                self._con.execute("INSERT INTO schema_version VALUES (?)", [SCHEMA_VERSION])
        log.debug("catalog_ready", path=str(self.path), schema_version=SCHEMA_VERSION)

    def create_project(self, payload: ProjectCreate) -> Project:
        project = Project(
            id=uuid.uuid4().hex,
            name=payload.name,
            description=payload.description,
            architecture=payload.architecture,
            created_at=utcnow(),
        )
        with self._lock:
            existing = self._con.execute(
                "SELECT id FROM projects WHERE lower(name) = lower(?)", [project.name]
            ).fetchone()
            if existing is not None:
                raise ConflictError(
                    f"a project named '{project.name}' already exists",
                    details={"project_id": existing[0]},
                )
            self._con.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                [
                    project.id,
                    project.name,
                    project.description,
                    project.architecture.value,
                    _to_db_timestamp(project.created_at),
                ],
            )
        log.info("project_created", project_id=project.id, name=project.name)
        return project

    def list_projects(self) -> list[Project]:
        with self._lock:
            rows = self._con.execute(
                "SELECT id, name, description, architecture, created_at FROM projects "
                "ORDER BY created_at, name"
            ).fetchall()
        return [self._project_from_row(row) for row in rows]

    def get_project(self, project_id: str) -> Project:
        with self._lock:
            row = self._con.execute(
                "SELECT id, name, description, architecture, created_at FROM projects WHERE id = ?",
                [project_id],
            ).fetchone()
        if row is None:
            raise ProjectNotFoundError(f"project '{project_id}' not found")
        return self._project_from_row(row)

    @staticmethod
    def _project_from_row(row: tuple[Any, ...]) -> Project:
        return Project(
            id=row[0],
            name=row[1],
            description=row[2],
            architecture=row[3],
            created_at=_from_db_timestamp(row[4]),
        )

    def add_source(self, source: Source) -> None:
        with self._lock:
            try:
                self._con.execute(
                    "INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        source.id,
                        source.project_id,
                        source.name,
                        source.format.value,
                        source.original_filename,
                        source.sheet_name,
                        source.encoding,
                        source.delimiter,
                        source.row_count,
                        source.column_count,
                        json.dumps([c.model_dump() for c in source.columns]),
                        source.bronze_path,
                        json.dumps(source.warnings, ensure_ascii=False),
                        _to_db_timestamp(source.ingested_at),
                    ],
                )
            except duckdb.ConstraintException as exc:
                raise ConflictError(
                    f"source '{source.name}' already exists in project '{source.project_id}'"
                ) from exc

    def source_names(self, project_id: str) -> set[str]:
        with self._lock:
            rows = self._con.execute(
                "SELECT name FROM sources WHERE project_id = ?", [project_id]
            ).fetchall()
        return {row[0] for row in rows}

    def list_sources(self, project_id: str) -> list[Source]:
        self.get_project(project_id)
        with self._lock:
            rows = self._con.execute(
                f"SELECT {_SOURCE_COLUMNS} FROM sources s "
                "LEFT JOIN profiles p ON p.source_id = s.id "
                "WHERE s.project_id = ? ORDER BY s.ingested_at, s.name",
                [project_id],
            ).fetchall()
        return [self._source_from_row(row) for row in rows]

    def get_source(self, source_id: str) -> Source:
        with self._lock:
            row = self._con.execute(
                f"SELECT {_SOURCE_COLUMNS} FROM sources s "
                "LEFT JOIN profiles p ON p.source_id = s.id WHERE s.id = ?",
                [source_id],
            ).fetchone()
        if row is None:
            raise SourceNotFoundError(f"source '{source_id}' not found")
        return self._source_from_row(row)

    @staticmethod
    def _source_from_row(row: tuple[Any, ...]) -> Source:
        return Source(
            id=row[0],
            project_id=row[1],
            name=row[2],
            format=row[3],
            original_filename=row[4],
            sheet_name=row[5],
            encoding=row[6],
            delimiter=row[7],
            row_count=row[8],
            column_count=row[9],
            columns=[ColumnSchema.model_validate(c) for c in json.loads(row[10])],
            bronze_path=row[11],
            warnings=json.loads(row[12]),
            ingested_at=_from_db_timestamp(row[13]),
            quality_score=row[14],
        )

    def save_profile(self, report: ProfileReport) -> None:
        with self._lock:
            self._con.execute(
                "INSERT OR REPLACE INTO profiles VALUES (?, ?, ?, ?)",
                [
                    report.source_id,
                    report.quality.score,
                    report.model_dump_json(),
                    _to_db_timestamp(report.profiled_at),
                ],
            )

    def get_profile(self, source_id: str) -> ProfileReport:
        self.get_source(source_id)
        with self._lock:
            row = self._con.execute(
                "SELECT report FROM profiles WHERE source_id = ?", [source_id]
            ).fetchone()
        if row is None:
            raise ProfileNotFoundError(f"no profile available for source '{source_id}'")
        return ProfileReport.model_validate_json(row[0])
