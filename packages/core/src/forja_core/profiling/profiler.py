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
from forja_core.profiling.grain import key_rank
from forja_core.profiling.models import (
    CandidateKey,
    ColumnProfile,
    Composition,
    DuplicateStats,
    EntityAttributes,
    InferredType,
    KeyConflicts,
    PiiDetection,
    ProfileReport,
    TopValue,
    TypeInference,
)
from forja_core.profiling.naming import is_identifier_name, is_period_name
from forja_core.profiling.pii import detect_pii
from forja_core.profiling.quality import compute_quality
from forja_core.profiling.types import (
    SENTINEL_VALUES,
    ValueCounts,
    infer_text_type,
    inferred_from_physical,
    typed_expression,
)
from forja_core.utils import quote_ident, sql_literal, utcnow

# Words naming a column that adds up others (total = payant + gratuit).
_TOTALS = frozenset({"total", "totaux", "totale", "ensemble", "tot"})
_MAX_PARTS = 8
_MAX_COMBINATIONS = 84
# The parts are those of the total when the sum matches on most rows.
_COMPOSITION_MIN_SHARE = 0.9

log = get_logger(__name__)

_NUMERIC = frozenset({InferredType.INTEGER, InferredType.DECIMAL})
_TEMPORAL = frozenset({InferredType.DATE, InferredType.DATETIME})
_KEY_ELIGIBLE = frozenset(
    {InferredType.INTEGER, InferredType.STRING, InferredType.DATE, InferredType.DATETIME}
)
_MAX_COMPOSITE_KEYS = 10
# A near key: an identifier with at most 5 % blanks, unique with its partner on 99 % of
# the rows.
QUASI_KEY_MAX_NULLS = 0.05
QUASI_KEY_MIN_UNIQUENESS = 0.99
# An entity key repeats (each value on several rows: at most half as many values as
# rows); an attribute may disagree on 2 % of the entities (typing noise in exports).
ENTITY_MAX_SHARE = 0.5
ENTITY_MAX_CONFLICTS = 0.02
ENTITY_MAX_KEYS = 3


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
        entities = self._entities(con, columns, row_count, keys, stats)
        conflicts = self._key_conflicts(con, columns, keys, row_count)
        compositions = self._compositions(con, columns)
        quality = compute_quality(columns, duplicates, keys, pii)
        report = ProfileReport(
            source_id=source_id,
            source_name=source_name,
            profiled_at=utcnow(),
            row_count=row_count,
            column_count=len(columns),
            columns=columns,
            candidate_keys=keys,
            entities=entities,
            duplicates=duplicates,
            key_conflicts=conflicts,
            compositions=compositions,
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
            if len(values) >= self.settings.profiling_sample_size:
                # Many distinct values: a rare placeholder may be past the limit.
                seen = {v for v, _ in values}
                markers = ", ".join(sql_literal(m) for m in sorted(SENTINEL_VALUES))
                values += [
                    (str(v), int(c))
                    for v, c in con.execute(
                        f"SELECT {value_sql} AS v, count(*) AS c FROM {stats} "
                        f"WHERE NOT {null_cond} AND lower(replace({value_sql}, ' ', '')) "
                        f"IN ({markers}) GROUP BY 1"
                    ).fetchall()
                    if str(v) not in seen
                ]
            inference = infer_text_type(values, self.settings.profiling_type_threshold, name=name)
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
        by_name = {c.name: c for c in columns}
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
        # An identifier with a few blanks still makes an entity x period grain with a
        # period column (one row per entity and year): it is tried as a near key.
        nearly = [
            c
            for c in columns
            if 0 < c.null_count <= QUASI_KEY_MAX_NULLS * row_count
            and c.inferred.inferred_type in _KEY_ELIGIBLE
            and is_identifier_name(c.name)
            and c not in pool
        ]
        pool += nearly
        pairs = [
            (a, b)
            for a, b in combinations(pool, 2)
            if a.distinct_count * b.distinct_count >= distinct_rows * QUASI_KEY_MIN_UNIQUENESS
        ]
        if not pairs:
            return keys
        expressions = ", ".join(
            f"count(DISTINCT row({quote_ident(a.name)}, {quote_ident(b.name)}))" for a, b in pairs
        )
        row = con.execute(f"SELECT {expressions} FROM src").fetchone() or ()
        exact: list[CandidateKey] = []
        near: list[CandidateKey] = []
        for (a, b), distinct in zip(pairs, row, strict=True):
            share = int(distinct) / distinct_rows
            if int(distinct) == distinct_rows and not a.null_count and not b.null_count:
                exact.append(CandidateKey(columns=[a.name, b.name], kind="composite"))
            elif share >= QUASI_KEY_MIN_UNIQUENESS and (
                is_identifier_name(a.name) or is_identifier_name(b.name)
            ):
                near.append(
                    CandidateKey(
                        columns=[a.name, b.name],
                        kind="composite",
                        uniqueness=round(min(share, 0.9999), 4),
                    )
                )
        ranked = sorted(exact, key=lambda k: key_rank(k.columns, by_name))
        ranked += sorted(near, key=lambda k: (key_rank(k.columns, by_name), -k.uniqueness))
        return keys + ranked[:_MAX_COMPOSITE_KEYS]

    def _key_conflicts(
        self,
        con: duckdb.DuckDBPyConnection,
        columns: list[ColumnProfile],
        keys: list[CandidateKey],
        row_count: int,
    ) -> list[KeyConflicts]:
        """For each near key, the distinct rows sharing a key value, split between
        near-identical (they only differ by blanks or placeholders) and divergent."""
        near = [k for k in keys if k.uniqueness < 1]
        # An identifier unique but for a few repeated values is a near key too.
        near += [
            CandidateKey(columns=[c.name], kind="simple", uniqueness=0.99)
            for c in columns
            if not c.is_unique
            and c.distinct_count > 1
            and is_identifier_name(c.name)
            and c.distinct_count >= 0.95 * max(1, row_count - c.null_count)
        ]
        found: list[KeyConflicts] = []
        names = [c.name for c in columns]
        markers = ", ".join(sql_literal(m) for m in sorted(SENTINEL_VALUES))

        def cell(name: str) -> str:
            text = f"nullif(trim(CAST({quote_ident(name)} AS VARCHAR)), '')"
            blank = f"lower(replace({text}, ' ', '')) IN ({markers})"
            return f"CASE WHEN {blank} THEN NULL ELSE {text} END"

        for key in near[:2]:
            others = [n for n in names if n not in key.columns]
            group = ", ".join(quote_ident(c) for c in key.columns)
            agree = " AND ".join(f"count(DISTINCT {cell(n)}) <= 1" for n in others) or "true"
            period = next((c for c in key.columns if is_period_name(c)), None)
            period_select = f", any_value({quote_ident(period)}) AS p" if period else ", NULL AS p"
            not_null = " AND ".join(f"{quote_ident(c)} IS NOT NULL" for c in key.columns)
            rows = con.execute(
                f"SELECT count(*) AS n, {agree} AS same{period_select} "
                f"FROM (SELECT DISTINCT {', '.join(quote_ident(n) for n in names)} FROM src) "
                f"WHERE {not_null} GROUP BY {group} HAVING count(*) > 1"
            ).fetchall()
            if not rows:
                continue
            conflict = KeyConflicts(columns=list(key.columns), keys=len(rows), rows=0)
            for n, same, value in rows:
                conflict.rows += int(n)
                if same:
                    conflict.near_identical_keys += 1
                    conflict.near_identical_rows += int(n)
                else:
                    conflict.divergent_keys += 1
                    conflict.divergent_rows += int(n)
                if value is not None:
                    label = str(value)
                    conflict.by_period[label] = conflict.by_period.get(label, 0) + 1
            found.append(conflict)
        return found

    def _compositions(
        self, con: duckdb.DuckDBPyConnection, columns: list[ColumnProfile]
    ) -> list[Composition]:
        """A column named total next to numeric columns: the smallest set of them it is
        the sum of on most rows, and the gap where it is not."""
        numeric = [
            c
            for c in columns
            if c.inferred.inferred_type in (InferredType.INTEGER, InferredType.DECIMAL)
            and not is_identifier_name(c.name)
            and not is_period_name(c.name)
        ]
        totals = [c for c in numeric if set(c.name.lower().replace("-", "_").split("_")) & _TOTALS]
        found: list[Composition] = []
        # The period of the rows: the best-filled integer column named like a period.
        periods = [
            c
            for c in columns
            if is_period_name(c.name) and c.inferred.inferred_type is InferredType.INTEGER
        ]
        period = min(periods, key=lambda c: c.null_count).name if periods else None
        for total in totals[:2]:
            parts = [c for c in numeric if c is not total][:_MAX_PARTS]
            candidates = [list(combo) for size in (2, 3) for combo in combinations(parts, size)][
                :_MAX_COMBINATIONS
            ]
            if not candidates:
                continue

            def value(name: str) -> str:
                text = f"replace(CAST({quote_ident(name)} AS VARCHAR), ',', '.')"
                return f"TRY_CAST({text} AS DOUBLE)"

            t = value(total.name)
            shares = ", ".join(
                f"avg(CASE WHEN abs({t} - ({' + '.join(value(p.name) for p in combo)})) < 0.5 "
                "THEN 1.0 ELSE 0.0 END) FILTER (WHERE "
                + " AND ".join(f"{value(n.name)} IS NOT NULL" for n in [total, *combo])
                + ")"
                for combo in candidates
            )
            row = con.execute(f"SELECT {shares} FROM src").fetchone() or ()
            scored = [
                (float(share), combo)
                for share, combo in zip(row, candidates, strict=True)
                if share is not None and float(share) >= _COMPOSITION_MIN_SHARE
            ]
            if not scored:
                continue
            best = max(scored, key=lambda item: (item[0], -len(item[1])))[1]
            summed = " + ".join(value(p.name) for p in best)
            filled = " AND ".join(f"{value(n.name)} IS NOT NULL" for n in [total, *best])
            group = f", {quote_ident(period)} AS p" if period else ", NULL AS p"
            rows = con.execute(
                f"SELECT count(*), count(*) FILTER (WHERE abs({t} - ({summed})) >= 0.5), "
                f"sum({t} - ({summed})){group} FROM src WHERE {filled}"
                + (f" GROUP BY {quote_ident(period)}" if period else "")
            ).fetchall()
            composition = Composition(
                total=total.name,
                parts=[p.name for p in best],
                rows=0,
                mismatched_rows=0,
                gap=0.0,
                period_column=period,
            )
            for count, mismatched, gap, label in rows:
                composition.rows += int(count)
                composition.mismatched_rows += int(mismatched or 0)
                composition.gap += float(gap or 0)
                if label is not None and gap:
                    composition.by_period[str(label)] = float(gap)
            found.append(composition)
        return found

    def _entities(
        self,
        con: duckdb.DuckDBPyConnection,
        columns: list[ColumnProfile],
        row_count: int,
        keys: list[CandidateKey],
        stats: str,
    ) -> list[EntityAttributes]:
        """For each repeated identifier, the columns holding one value per identifier.

        Placeholders (« Inconnu ») and blanks are not values: a closure year empty for
        the early years and filled afterwards still depends on the entity.
        """
        if row_count < 2:
            return []
        in_keys = {name for k in keys if k.kind == "composite" for name in k.columns}
        determinants = [
            c
            for c in columns
            if 1 < c.distinct_count <= row_count * ENTITY_MAX_SHARE
            and c.null_count <= QUASI_KEY_MAX_NULLS * row_count
            and c.inferred.inferred_type in _KEY_ELIGIBLE
            and (is_identifier_name(c.name) or c.name in in_keys)
            and not is_period_name(c.name)
            and c.inferred.inferred_type not in _TEMPORAL
        ][:ENTITY_MAX_KEYS]
        markers = ", ".join(sql_literal(m) for m in sorted(SENTINEL_VALUES))
        found: list[EntityAttributes] = []
        for key in determinants:
            others = [c for c in columns if c.name != key.name and c.distinct_count > 0]
            if not others:
                continue
            values = []
            for other in others:
                ident = quote_ident(other.name)
                text = f"nullif(trim(CAST({ident} AS VARCHAR)), '')"
                values.append(
                    f"count(DISTINCT CASE WHEN lower(replace({text}, ' ', '')) IN ({markers}) "
                    f"THEN NULL ELSE {text} END) AS {quote_ident('n_' + other.name)}"
                )
            conflicts = ", ".join(
                f"count(*) FILTER (WHERE {quote_ident('n_' + o.name)} > 1)" for o in others
            )
            row = con.execute(
                f"SELECT count(*), {conflicts} FROM (SELECT {', '.join(values)} FROM {stats} "
                f"WHERE {quote_ident(key.name)} IS NOT NULL GROUP BY {quote_ident(key.name)})"
            ).fetchone()
            if not row or not row[0]:
                continue
            entities = int(row[0])
            attributes: list[str] = []
            tolerated: dict[str, int] = {}
            for other, count in zip(others, row[1:], strict=True):
                if int(count) <= entities * ENTITY_MAX_CONFLICTS and other.distinct_count > 1:
                    attributes.append(other.name)
                    if count:
                        tolerated[other.name] = int(count)
            if attributes:
                found.append(
                    EntityAttributes(
                        key=key.name,
                        entities=entities,
                        attributes=attributes,
                        conflicts=tolerated,
                    )
                )
        return found
