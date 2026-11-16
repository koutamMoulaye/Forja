"""What a Gold plan is checked and compiled against: built Silver tables and relations."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from forja_core import duck
from forja_core.catalog import Catalog
from forja_core.logging import get_logger
from forja_core.profiling.models import ColumnProfile, Composition, EntityAttributes
from forja_core.relations.models import Relation, RelationStatus
from forja_core.silver.plan import TransformationPlan
from forja_core.silver.tables import SilverTable, TableLayer

log = get_logger(__name__)

# A suggested relation is used by a proposal (and flagged « to confirm ») from this
# confidence on; below, it waits for review.
STRONG_SUGGESTION = 0.9

_NUMERIC_PREFIXES = (
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "UTINYINT", "USMALLINT",
    "UINTEGER", "UBIGINT", "FLOAT", "DOUBLE", "REAL", "DECIMAL",
)  # fmt: skip


def is_numeric(column_type: str) -> bool:
    return column_type.upper().startswith(_NUMERIC_PREFIXES)


def is_integer(column_type: str) -> bool:
    return is_numeric(column_type) and "INT" in column_type.upper()


def is_temporal(column_type: str) -> bool:
    upper = column_type.upper()
    return upper == "DATE" or upper.startswith("TIMESTAMP")


@dataclass(frozen=True)
class SilverSource:
    name: str
    table: SilverTable
    plan: TransformationPlan
    columns: dict[str, str] = field(default_factory=dict)
    key: tuple[str, ...] = ()
    # Profile of the source column behind each Silver column (statistics, never values
    # beyond what the profile keeps); empty when the source was never profiled.
    profiles: dict[str, ColumnProfile] = field(default_factory=dict)
    # Attributes repeated for each value of an identifier, in Silver names.
    entities: tuple[EntityAttributes, ...] = ()
    row_count: int = 0
    # A total column and the columns it adds up, in Silver names, with the gap measured.
    compositions: tuple[Composition, ...] = ()
    # Ingested versions, and keys whose attributes differ between two of them (None when
    # not measured): a dimension is historized only when its source did change.
    versions: int = 1
    changed_keys: int | None = None

    @property
    def model(self) -> str:
        return self.table.name

    def fill_rate(self, column: str) -> float:
        """Share of rows with a value (placeholders such as « Inconnu » count as empty)."""
        profile = self.profiles.get(column)
        if profile is None or not self.row_count:
            return 1.0
        empty = profile.null_count + profile.inferred.sentinel_count
        return max(0.0, 1 - empty / self.row_count)


@dataclass(frozen=True)
class GoldContext:
    project_id: str
    sources: dict[str, SilverSource]
    relations: tuple[Relation, ...] = ()

    @property
    def confirmed(self) -> list[Relation]:
        return [r for r in self.relations if r.status is RelationStatus.CONFIRMED]

    @property
    def strong_suggestions(self) -> list[Relation]:
        return [
            r
            for r in self.relations
            if r.status is RelationStatus.SUGGESTED and r.confidence >= STRONG_SUGGESTION
        ]

    def _find(
        self,
        relations: list[Relation],
        from_source: str,
        from_column: str,
        to_source: str,
        to_column: str,
    ) -> Relation | None:
        for relation in relations:
            if (
                relation.from_source == from_source
                and relation.from_column == from_column
                and relation.to_source == to_source
                and relation.to_column == to_column
            ):
                return relation
        # A one-to-one relation between two keys reads both ways: each value appears once
        # on each side.
        for relation in relations:
            origin = self.sources.get(relation.from_source)
            if (
                relation.cardinality == "1-1"
                and origin is not None
                and origin.key == (relation.from_column,)
                and relation.from_source == to_source
                and relation.from_column == to_column
                and relation.to_source == from_source
                and relation.to_column == from_column
            ):
                return relation
        return None

    def relation(
        self, from_source: str, from_column: str, to_source: str, to_column: str
    ) -> Relation | None:
        """The confirmed relation between these columns, if any (a 1-1 relation stored
        the other way round counts too)."""
        return self._find(self.confirmed, from_source, from_column, to_source, to_column)

    def suggestion(
        self, from_source: str, from_column: str, to_source: str, to_column: str
    ) -> Relation | None:
        """The relation still waiting for review between these columns, if any."""
        suggested = [r for r in self.relations if r.status is RelationStatus.SUGGESTED]
        return self._find(suggested, from_source, from_column, to_source, to_column)


def _entities(plan: TransformationPlan, report: object) -> tuple[EntityAttributes, ...]:
    names = {c.source_column: c.target_column for c in plan.columns if c.included}
    found: list[EntityAttributes] = []
    for entity in getattr(report, "entities", []) or []:
        if entity.key not in names:
            continue
        attributes = [names[a] for a in entity.attributes if a in names]
        if attributes:
            found.append(
                EntityAttributes(
                    key=names[entity.key],
                    entities=entity.entities,
                    attributes=attributes,
                    conflicts={names[a]: n for a, n in entity.conflicts.items() if a in names},
                )
            )
    return tuple(found)


def _compositions(plan: TransformationPlan, report: object) -> tuple[Composition, ...]:
    names = {c.source_column: c.target_column for c in plan.columns if c.included}
    found: list[Composition] = []
    for composition in getattr(report, "compositions", []) or []:
        if composition.total in names and all(p in names for p in composition.parts):
            found.append(
                composition.model_copy(
                    update={
                        "total": names[composition.total],
                        "parts": [names[p] for p in composition.parts],
                    }
                )
            )
    return tuple(found)


def _changed_keys(data_dir: Path, plan: TransformationPlan, paths: list[str]) -> int | None:
    """Keys present in two versions of a source with different contents (Bronze rows,
    compared by their hash; nothing leaves the warehouse)."""
    keys = [c.source_column for c in plan.key_columns()]
    if not keys or len(paths) < 2:
        return None
    files = ", ".join("'" + (data_dir / p).as_posix().replace("'", "''") + "'" for p in paths)
    columns = ", ".join('"' + k.replace('"', '""') + '"' for k in keys)
    try:
        with duck.connect() as con:
            [(count,)] = con.execute(
                f"SELECT count(*) FROM (SELECT {columns} FROM read_parquet([{files}], "
                "union_by_name = true) GROUP BY ALL "
                "HAVING count(DISTINCT _batch_id) > 1 AND count(DISTINCT _row_hash) > 1)"
            ).fetchall()
    except Exception as exc:  # a missing or unreadable file: not measured
        log.warning("gold_changed_keys_unavailable", source=plan.source_name, error=str(exc))
        return None
    return int(count)


def build_gold_context(
    catalog: Catalog, project_id: str, data_dir: Path | None = None
) -> GoldContext:
    """The Silver sources and relations of a project. With ``data_dir``, the keys that
    changed between versions of each source are measured too (for the proposal)."""
    sources: dict[str, SilverSource] = {}
    reports = catalog.latest_profiles(project_id)
    for table in catalog.list_tables(project_id, TableLayer.SILVER):
        assert table.source_id is not None
        plan = catalog.get_plan(table.source_id, version=table.plan_version)
        report = reports.get(table.source_id)
        by_source = {c.name: c for c in report.columns} if report else {}
        versions = catalog.list_versions(table.source_id) if data_dir is not None else []
        sources[plan.source_name] = SilverSource(
            name=plan.source_name,
            table=table,
            plan=plan,
            columns={c.name: c.type for c in table.columns if not c.name.startswith("_")},
            key=tuple(c.target_column for c in plan.key_columns()),
            profiles={
                c.target_column: by_source[c.source_column]
                for c in plan.columns
                if c.source_column in by_source
            },
            entities=_entities(plan, report),
            row_count=report.row_count if report else 0,
            compositions=_compositions(plan, report),
            versions=max(1, len(versions)),
            changed_keys=(
                _changed_keys(data_dir, plan, [v.bronze_path for v in versions])
                if data_dir is not None and len(versions) > 1
                else None
            ),
        )
    return GoldContext(
        project_id=project_id,
        sources=sources,
        relations=tuple(catalog.list_relations(project_id)),
    )
