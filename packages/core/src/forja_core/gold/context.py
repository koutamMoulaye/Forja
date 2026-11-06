"""What a Gold plan is checked and compiled against: built Silver tables and relations."""

from __future__ import annotations

from dataclasses import dataclass, field

from forja_core.catalog import Catalog
from forja_core.profiling.models import ColumnProfile, EntityAttributes
from forja_core.relations.models import Relation, RelationStatus
from forja_core.silver.plan import TransformationPlan
from forja_core.silver.tables import SilverTable, TableLayer

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

    def relation(
        self, from_source: str, from_column: str, to_source: str, to_column: str
    ) -> Relation | None:
        """The confirmed relation between these columns, if any."""
        for relation in self.confirmed:
            if (
                relation.from_source == from_source
                and relation.from_column == from_column
                and relation.to_source == to_source
                and relation.to_column == to_column
            ):
                return relation
        return None


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


def build_gold_context(catalog: Catalog, project_id: str) -> GoldContext:
    sources: dict[str, SilverSource] = {}
    reports = catalog.latest_profiles(project_id)
    for table in catalog.list_tables(project_id, TableLayer.SILVER):
        assert table.source_id is not None
        plan = catalog.get_plan(table.source_id, version=table.plan_version)
        report = reports.get(table.source_id)
        by_source = {c.name: c for c in report.columns} if report else {}
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
        )
    return GoldContext(
        project_id=project_id,
        sources=sources,
        relations=tuple(catalog.list_relations(project_id)),
    )
