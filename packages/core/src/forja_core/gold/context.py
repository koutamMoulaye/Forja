"""What a Gold plan is checked and compiled against: built Silver tables and relations."""

from __future__ import annotations

from dataclasses import dataclass, field

from forja_core.catalog import Catalog
from forja_core.relations.models import Relation, RelationStatus
from forja_core.silver.plan import PiiTreatment, TransformationPlan
from forja_core.silver.tables import SilverTable

_NUMERIC_PREFIXES = (
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "UTINYINT", "USMALLINT",
    "UINTEGER", "UBIGINT", "FLOAT", "DOUBLE", "REAL", "DECIMAL",
)  # fmt: skip


def is_numeric(column_type: str) -> bool:
    return column_type.upper().startswith(_NUMERIC_PREFIXES)


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

    @property
    def model(self) -> str:
        return self.table.name

    def pii_treatment(self, column: str) -> PiiTreatment:
        for plan_column in self.plan.columns:
            if plan_column.target_column == column:
                return plan_column.pii_treatment
        return PiiTreatment.NONE


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


def build_gold_context(catalog: Catalog, project_id: str) -> GoldContext:
    sources: dict[str, SilverSource] = {}
    for table in catalog.list_tables(project_id):
        if not table.name.startswith("stg_"):
            continue
        plan = catalog.get_plan(table.source_id, version=table.plan_version)
        sources[plan.source_name] = SilverSource(
            name=plan.source_name,
            table=table,
            plan=plan,
            columns={c.name: c.type for c in table.columns if not c.name.startswith("_")},
            key=tuple(c.target_column for c in plan.key_columns()),
        )
    return GoldContext(
        project_id=project_id,
        sources=sources,
        relations=tuple(catalog.list_relations(project_id)),
    )
