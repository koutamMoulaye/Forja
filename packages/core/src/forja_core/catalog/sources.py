"""Persistence of sources, their versions and their profiles."""

from __future__ import annotations

import json
from typing import Any

import duckdb

from forja_core.catalog.base import from_db_timestamp_required, to_db_timestamp
from forja_core.catalog.projects import ProjectsMixin
from forja_core.errors import (
    ConflictError,
    ProfileNotFoundError,
    SourceNotFoundError,
)
from forja_core.models import ColumnSchema, SchemaDrift, Source, SourceVersion
from forja_core.profiling.models import ProfileReport

_SOURCE_COLUMNS = (
    "s.id, s.project_id, s.name, s.format, s.original_filename, s.sheet_name, s.encoding, "
    "s.delimiter, s.row_count, s.column_count, s.columns, s.bronze_path, s.warnings, "
    "s.ingested_at, s.current_version, s.latest_version_id, v.schema_drift, p.quality_score"
)
_SOURCE_FROM = (
    "FROM sources s "
    "LEFT JOIN source_versions v ON v.id = s.latest_version_id "
    "LEFT JOIN profiles p ON p.version_id = s.latest_version_id"
)
_VERSION_COLUMNS = (
    "id, source_id, version, format, original_filename, sheet_name, encoding, delimiter, "
    "row_count, new_row_count, columns, bronze_path, warnings, schema_drift, ingested_at"
)


def _columns_json(columns: list[ColumnSchema]) -> str:
    return json.dumps([c.model_dump() for c in columns], ensure_ascii=False)


def _drift(value: str | None) -> SchemaDrift | None:
    return None if value is None else SchemaDrift.model_validate_json(value)


def _source(row: tuple[Any, ...]) -> Source:
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
        ingested_at=from_db_timestamp_required(row[13]),
        version=row[14] or 1,
        latest_version_id=row[15],
        schema_drift=_drift(row[16]),
        quality_score=row[17],
    )


def _version(row: tuple[Any, ...]) -> SourceVersion:
    return SourceVersion(
        id=row[0],
        source_id=row[1],
        version=row[2],
        format=row[3],
        original_filename=row[4],
        sheet_name=row[5],
        encoding=row[6],
        delimiter=row[7],
        row_count=row[8],
        new_row_count=row[9],
        columns=[ColumnSchema.model_validate(c) for c in json.loads(row[10])],
        bronze_path=row[11],
        warnings=json.loads(row[12]),
        schema_drift=_drift(row[13]),
        ingested_at=from_db_timestamp_required(row[14]),
    )


class SourcesMixin(ProjectsMixin):
    def add_source(self, source: Source, version: SourceVersion) -> None:
        """Register a new logical source together with its first version."""
        try:
            with self._transaction():
                self._execute(
                    "INSERT INTO sources (id, project_id, name, format, original_filename, "
                    "sheet_name, encoding, delimiter, row_count, column_count, columns, "
                    "bronze_path, warnings, ingested_at, current_version, latest_version_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        source.id,
                        source.project_id,
                        source.name,
                        version.format.value,
                        version.original_filename,
                        version.sheet_name,
                        version.encoding,
                        version.delimiter,
                        version.row_count,
                        source.column_count,
                        _columns_json(version.columns),
                        version.bronze_path,
                        json.dumps(version.warnings, ensure_ascii=False),
                        to_db_timestamp(version.ingested_at),
                        version.version,
                        version.id,
                    ],
                )
                self._insert_version(version)
        except duckdb.ConstraintException as exc:
            raise ConflictError(
                f"source '{source.name}' already exists in project '{source.project_id}'"
            ) from exc

    def add_version(self, version: SourceVersion, column_count: int) -> None:
        """Register a new version of an existing source and make it the latest one."""
        with self._transaction():
            self._insert_version(version)
            self._execute(
                "UPDATE sources SET format = ?, original_filename = ?, sheet_name = ?, "
                "encoding = ?, delimiter = ?, row_count = ?, column_count = ?, columns = ?, "
                "bronze_path = ?, warnings = ?, ingested_at = ?, current_version = ?, "
                "latest_version_id = ? WHERE id = ?",
                [
                    version.format.value,
                    version.original_filename,
                    version.sheet_name,
                    version.encoding,
                    version.delimiter,
                    version.row_count,
                    column_count,
                    _columns_json(version.columns),
                    version.bronze_path,
                    json.dumps(version.warnings, ensure_ascii=False),
                    to_db_timestamp(version.ingested_at),
                    version.version,
                    version.id,
                    version.source_id,
                ],
            )

    def _insert_version(self, version: SourceVersion) -> None:
        self._execute(
            f"INSERT INTO source_versions ({_VERSION_COLUMNS}) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                version.id,
                version.source_id,
                version.version,
                version.format.value,
                version.original_filename,
                version.sheet_name,
                version.encoding,
                version.delimiter,
                version.row_count,
                version.new_row_count,
                _columns_json(version.columns),
                version.bronze_path,
                json.dumps(version.warnings, ensure_ascii=False),
                None if version.schema_drift is None else version.schema_drift.model_dump_json(),
                to_db_timestamp(version.ingested_at),
            ],
        )

    def source_names(self, project_id: str) -> set[str]:
        rows = self._fetchall("SELECT name FROM sources WHERE project_id = ?", [project_id])
        return {row[0] for row in rows}

    def find_source_by_name(self, project_id: str, name: str) -> Source | None:
        row = self._fetchone(
            f"SELECT {_SOURCE_COLUMNS} {_SOURCE_FROM} "
            "WHERE s.project_id = ? AND lower(s.name) = lower(?)",
            [project_id, name],
        )
        return None if row is None else _source(row)

    def list_sources(self, project_id: str) -> list[Source]:
        self.get_project(project_id)
        rows = self._fetchall(
            f"SELECT {_SOURCE_COLUMNS} {_SOURCE_FROM} WHERE s.project_id = ? ORDER BY s.name",
            [project_id],
        )
        return [_source(row) for row in rows]

    def get_source(self, source_id: str) -> Source:
        row = self._fetchone(f"SELECT {_SOURCE_COLUMNS} {_SOURCE_FROM} WHERE s.id = ?", [source_id])
        if row is None:
            raise SourceNotFoundError(f"source '{source_id}' not found")
        return _source(row)

    def list_versions(self, source_id: str) -> list[SourceVersion]:
        self.get_source(source_id)
        rows = self._fetchall(
            f"SELECT {_VERSION_COLUMNS} FROM source_versions WHERE source_id = ? ORDER BY version",
            [source_id],
        )
        return [_version(row) for row in rows]

    def save_profile(self, report: ProfileReport) -> None:
        self._execute(
            "INSERT OR REPLACE INTO profiles VALUES (?, ?, ?, ?, ?)",
            [
                report.version_id or report.source_id,
                report.source_id,
                report.quality.score,
                report.model_dump_json(),
                to_db_timestamp(report.profiled_at),
            ],
        )

    def get_profile(self, source_id: str, version: int | None = None) -> ProfileReport:
        """Profile of the given version, by default of the latest one."""
        source = self.get_source(source_id)
        if version is None:
            row = self._fetchone(
                "SELECT report FROM profiles WHERE version_id = ?", [source.latest_version_id]
            )
        else:
            row = self._fetchone(
                "SELECT p.report FROM profiles p "
                "JOIN source_versions v ON v.id = p.version_id "
                "WHERE v.source_id = ? AND v.version = ?",
                [source_id, version],
            )
        if row is None:
            raise ProfileNotFoundError(f"no profile available for source '{source_id}'")
        return ProfileReport.model_validate_json(row[0])
