"""Profiling of Bronze Parquet tables with DuckDB."""

from __future__ import annotations

import time
from itertools import combinations
from pathlib import Path
from typing import Any

import duckdb

from forja_core import duck
from forja_core.config import Settings
from forja_core.errors import ProfilingError
from forja_core.logging import get_logger
from forja_core.models import TECHNICAL_COLUMNS
from forja_core.profiling.models import (
    CandidateKey,
    ColumnProfile,
    DuplicateStats,
    InferredType,
    PiiDetection,
    ProfileReport,
    TopValue,
    TypeInference,
)
from forja_core.profiling.pii import detect_pii
from forja_core.profiling.quality import compute_quality
from forja_core.profiling.types import (
    ValueCounts,
    infer_text_type,
    inferred_from_physical,
    typed_expression,
)
from forja_core.utils import quote_ident, sql_literal, utcnow

log = get_logger(__name__)

_NUMERIC = frozenset({InferredType.INTEGER, InferredType.DECIMAL})
_TEMPORAL = frozenset({InferredType.DATE, InferredType.DATETIME})
_KEY_ELIGIBLE = frozenset(
    {InferredType.INTEGER, InferredType.STRING, InferredType.DATE, InferredType.DATETIME}
)
_MAX_COMPOSITE_KEYS = 10


def _pct(part: int, total: int) -> float:
    return round(100 * part / total, 2) if total else 0.0


def _number(value: Any) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    return round(float(value), 6)


class Profiler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def profile(
        self,
        *,
        source_id: str,
        source_name: str,
        parquet_path: Path,
        version_id: str | None = None,
        version: int | None = None,
    ) -> ProfileReport:
        con = duck.connect()
        try:
            report = self._profile(con, source_id, source_name, parquet_path)
            return report.model_copy(update={"version_id": version_id, "version": version})
        except duckdb.Error as exc:
            raise ProfilingError(f"profiling failed for '{source_name}': {exc}") from exc
        finally:
            con.close()

    def _profile(
        self,
        con: duckdb.DuckDBPyConnection,
        source_id: str,
        source_name: str,
        parquet_path: Path,
    ) -> ProfileReport:
        con.execute(
            f"CREATE VIEW src AS SELECT * FROM read_parquet({sql_literal(str(parquet_path))})"
        )
        schema = [
            (str(row[0]), str(row[1]))
            for row in con.execute("DESCRIBE src").fetchall()
            if row[0] not in TECHNICAL_COLUMNS
        ]
        started = time.perf_counter()
        row_count = self._scalar(con, "SELECT count(*) FROM src")
        # Large tables: exact counts on the whole table, finer statistics on a sample.
        sample_rows: int | None = None
        stats = "src"
        if row_count > self.settings.profiling_full_scan_rows:
            sample_rows = min(row_count, self.settings.profiling_sample_rows)
            con.execute(
                "CREATE TEMP TABLE sample AS SELECT * FROM src "
                f"USING SAMPLE reservoir({sample_rows} ROWS) REPEATABLE (42)"
            )
            stats = "sample"
        exact = self._exact_counts(con, schema)

        columns: list[ColumnProfile] = []
        pii: list[PiiDetection] = []
        for name, physical_type in schema:
            column, values = self._profile_column(
                con, name, physical_type, row_count, exact[name], stats, sample_rows
            )
            if column.inferred.inferred_type is InferredType.STRING and column.inferred.from_text:
                detection = detect_pii(name, values)
                if detection is not None:
                    column.pii = detection
                    pii.append(detection)
            columns.append(column)

        duplicates = self._duplicates(con, row_count)
        keys = self._candidate_keys(con, columns, row_count, duplicates)
        quality = compute_quality(columns, duplicates, keys, pii)
        report = ProfileReport(
            source_id=source_id,
            source_name=source_name,
            profiled_at=utcnow(),
            row_count=row_count,
            column_count=len(columns),
            columns=columns,
            candidate_keys=keys,
            duplicates=duplicates,
            pii=pii,
            quality=quality,
            sampled=sample_rows is not None,
            sample_rows=sample_rows,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        log.info(
            "source_profiled",
            source_id=source_id,
            rows=row_count,
            columns=len(columns),
            quality_score=quality.score,
            pii_columns=len(pii),
            sampled=report.sampled,
            duration_ms=report.duration_ms,
        )
        return report

    @staticmethod
    def _null_condition(name: str, physical_type: str) -> tuple[str, str]:
        ident = quote_ident(name)
        if physical_type.upper() == "VARCHAR":
            return f"trim({ident})", f"({ident} IS NULL OR trim({ident}) = '')"
        return ident, f"({ident} IS NULL)"

    def _exact_counts(
        self, con: duckdb.DuckDBPyConnection, schema: list[tuple[str, str]]
    ) -> dict[str, tuple[int, int]]:
        """Null and distinct counts of every column, in one scan of the whole table."""
        if not schema:
            return {}
        expressions: list[str] = []
        for name, physical_type in schema:
            value_sql, null_cond = self._null_condition(name, physical_type)
            expressions.append(f"count(*) FILTER (WHERE {null_cond})")
            expressions.append(f"count(DISTINCT CASE WHEN NOT {null_cond} THEN {value_sql} END)")
        row = con.execute(f"SELECT {', '.join(expressions)} FROM src").fetchone() or ()
        return {name: (int(row[2 * i]), int(row[2 * i + 1])) for i, (name, _) in enumerate(schema)}

    @staticmethod
    def _scalar(con: duckdb.DuckDBPyConnection, sql: str) -> int:
        row = con.execute(sql).fetchone()
        return int(row[0]) if row and row[0] is not None else 0

    def _profile_column(
        self,
        con: duckdb.DuckDBPyConnection,
        name: str,
        physical_type: str,
        row_count: int,
        exact: tuple[int, int],
        stats: str,
        sample_rows: int | None,
    ) -> tuple[ColumnProfile, ValueCounts]:
        ident = quote_ident(name)
        is_text = physical_type.upper() == "VARCHAR"
        value_sql, null_cond = self._null_condition(name, physical_type)

        values: list[tuple[str, int]] = []
        if is_text:
            values = [
                (str(v), int(c))
                for v, c in con.execute(
                    f"SELECT {value_sql} AS v, count(*) AS c FROM {stats} WHERE NOT {null_cond} "
                    f"GROUP BY 1 ORDER BY c DESC, v LIMIT {self.settings.profiling_sample_size}"
                ).fetchall()
            ]
            inference = infer_text_type(values, self.settings.profiling_type_threshold)
        else:
            inference = TypeInference(
                inferred_type=inferred_from_physical(physical_type),
                physical_type=physical_type,
                from_text=False,
                match_ratio=1.0,
            )
        inference.physical_type = physical_type

        null_count, distinct_count = exact
        non_null = row_count - null_count
        if non_null == 0:
            inference.inferred_type = InferredType.EMPTY

        profile = ColumnProfile(
            name=name,
            physical_type=physical_type,
            inferred=inference,
            null_count=null_count,
            null_pct=_pct(null_count, row_count),
            distinct_count=distinct_count,
            uniqueness=round(distinct_count / non_null, 4) if non_null else 0.0,
            is_unique=null_count == 0 and distinct_count == row_count and row_count > 0,
            is_constant=distinct_count == 1,
            top_values=self._top_values(con, value_sql, null_cond, row_count, stats, sample_rows),
        )
        self._add_statistics(con, profile, ident, null_cond, stats)
        if not inference.from_text and inference.inferred_type is InferredType.DECIMAL:
            inference.max_decimals = self._native_decimals(con, ident, null_cond, stats)
        return profile, values

    @staticmethod
    def _native_decimals(
        con: duckdb.DuckDBPyConnection, ident: str, null_cond: str, stats: str
    ) -> int:
        """Fractional digits of a native floating or decimal column, on its text form."""
        rows = con.execute(
            f"SELECT max(length(split_part(CAST({ident} AS VARCHAR), '.', 2))) "
            f"FROM {stats} WHERE NOT {null_cond} AND CAST({ident} AS VARCHAR) LIKE '%.%'"
        ).fetchall()
        value = rows[0][0] if rows else None
        return int(value or 0)

    def _top_values(
        self,
        con: duckdb.DuckDBPyConnection,
        value_sql: str,
        null_cond: str,
        row_count: int,
        stats: str,
        sample_rows: int | None,
    ) -> list[TopValue]:
        limit = self.settings.profiling_top_values
        if limit == 0:
            return []
        rows = con.execute(
            f"SELECT CAST({value_sql} AS VARCHAR) AS v, count(*) AS c FROM {stats} "
            f"WHERE NOT {null_cond} GROUP BY 1 ORDER BY c DESC, v LIMIT {limit}"
        ).fetchall()
        # On a sample, counts are estimated for the whole table.
        scale = row_count / sample_rows if sample_rows else 1
        return [
            TopValue(
                value=str(v),
                count=round(int(c) * scale),
                pct=_pct(round(int(c) * scale), row_count),
            )
            for v, c in rows
        ]

    @staticmethod
    def _add_statistics(
        con: duckdb.DuckDBPyConnection,
        profile: ColumnProfile,
        ident: str,
        null_cond: str,
        stats: str,
    ) -> None:
        inferred = profile.inferred.inferred_type
        typed = typed_expression(ident, profile.inferred)
        if inferred in _NUMERIC:
            row = con.execute(
                f"SELECT min(t), max(t), avg(t), stddev_samp(t) "
                f"FROM (SELECT {typed} AS t FROM {stats} WHERE NOT {null_cond})"
            ).fetchone()
            if row:
                profile.min, profile.max = _number(row[0]), _number(row[1])
                profile.mean = None if row[2] is None else round(float(row[2]), 6)
                profile.stddev = None if row[3] is None else round(float(row[3]), 6)
        elif inferred in _TEMPORAL:
            row = con.execute(
                f"SELECT CAST(min(t) AS VARCHAR), CAST(max(t) AS VARCHAR) "
                f"FROM (SELECT {typed} AS t FROM {stats} WHERE NOT {null_cond})"
            ).fetchone()
            if row:
                profile.min, profile.max = row[0], row[1]
        elif inferred is InferredType.STRING:
            row = con.execute(
                f"SELECT min(length(trim({ident}))), max(length(trim({ident}))) "
                f"FROM {stats} WHERE NOT {null_cond}"
            ).fetchone()
            if row:
                profile.min_length = None if row[0] is None else int(row[0])
                profile.max_length = None if row[1] is None else int(row[1])

    def _duplicates(self, con: duckdb.DuckDBPyConnection, row_count: int) -> DuplicateStats:
        distinct = self._scalar(con, "SELECT count(DISTINCT _row_hash) FROM src")
        groups = self._scalar(
            con,
            "SELECT count(*) FROM (SELECT _row_hash FROM src GROUP BY 1 HAVING count(*) > 1)",
        )
        duplicate_rows = row_count - distinct
        return DuplicateStats(
            duplicate_rows=duplicate_rows,
            duplicate_pct=_pct(duplicate_rows, row_count),
            duplicate_groups=groups,
        )

    def _candidate_keys(
        self,
        con: duckdb.DuckDBPyConnection,
        columns: list[ColumnProfile],
        row_count: int,
        duplicates: DuplicateStats,
    ) -> list[CandidateKey]:
        # Keys are evaluated on distinct rows: exact duplicates are removed in Silver anyway.
        distinct_rows = row_count - duplicates.duplicate_rows
        if distinct_rows < 2:
            return []
        eligible = [
            c for c in columns if c.null_count == 0 and c.inferred.inferred_type in _KEY_ELIGIBLE
        ]
        keys = [
            CandidateKey(columns=[c.name], kind="simple")
            for c in eligible
            if c.distinct_count == distinct_rows
        ]
        simple = {k.columns[0] for k in keys}

        pool = sorted(
            (c for c in eligible if c.name not in simple and c.distinct_count > 1),
            key=lambda c: c.distinct_count,
            reverse=True,
        )[: self.settings.profiling_max_key_columns]
        pairs = [
            (a, b)
            for a, b in combinations(pool, 2)
            if a.distinct_count * b.distinct_count >= distinct_rows
        ]
        if not pairs:
            return keys
        expressions = ", ".join(
            f"count(DISTINCT row({quote_ident(a.name)}, {quote_ident(b.name)}))" for a, b in pairs
        )
        row = con.execute(f"SELECT {expressions} FROM src").fetchone() or ()
        composite = [
            CandidateKey(columns=[a.name, b.name], kind="composite")
            for (a, b), distinct in zip(pairs, row, strict=True)
            if int(distinct) == distinct_rows
        ]
        return keys + composite[:_MAX_COMPOSITE_KEYS]
