"""Detection of foreign keys between the Silver tables of a project.

For every pair (column A of a table, key B of another table) the detector measures,
on the warehouse and without sending anything anywhere:

- the inclusion ratio: share of distinct non-null values of A found among the values
  of B, on a deterministic sample of at most ``FORJA_RELATION_SAMPLE_SIZE`` values;
- type compatibility, name similarity and cardinality (1-1 when A is unique).

Integer columns are only compared when their names are similar: small integers such
as quantities would otherwise be "included" in any identifier range.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass

import duckdb

from forja_core import duck
from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ProfileNotFoundError
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.relations.models import Cardinality, Relation, RelationOrigin, RelationStatus
from forja_core.relations.naming import EXACT, SAME_ENTITY, SYNONYM, entity, name_similarity
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.plan import SilverType, TransformationPlan
from forja_core.silver.tables import SilverTable, TableLayer
from forja_core.utils import quote_ident, utcnow

log = get_logger(__name__)

KEY_TYPES = frozenset({SilverType.BIGINT, SilverType.VARCHAR})
SIMILAR_NAMES = 0.5
VALUE_ONLY_MIN_INCLUSION = 0.95

WEIGHT_INCLUSION = 0.6
WEIGHT_NAME = 0.3
WEIGHT_TYPE = 0.1


@dataclass(frozen=True)
class _Column:
    table: SilverTable
    plan: TransformationPlan
    name: str
    type: SilverType

    @property
    def source(self) -> str:
        return self.plan.source_name


@dataclass(frozen=True)
class _Overlap:
    distinct: int
    sample: int
    matched: int
    unique: bool

    @property
    def ratio(self) -> float:
        return self.matched / self.sample if self.sample else 0.0


def _percent(ratio: float) -> str:
    return f"{round(ratio * 100)} %"


def _name_sentence(similarity: float, a: _Column, b: _Column) -> str:
    if similarity >= EXACT:
        return "noms identiques"
    if similarity >= SAME_ENTITY:
        shared = sorted(entity(a.name, a.table.name) & entity(b.name, b.table.name))
        return f"même entité ({', '.join(shared)})" if shared else "même entité"
    if similarity >= SYNONYM:
        return "noms synonymes"
    if similarity >= SIMILAR_NAMES:
        return "noms proches"
    return "noms différents, relation déduite des seules valeurs"


def explain(a: _Column, b: _Column, overlap: _Overlap, similarity: float) -> str:
    parts = [
        f"{_percent(overlap.ratio)} des valeurs de {a.source}.{a.name} existent dans "
        f"{b.source}.{b.name}"
        + (
            f" (échantillon de {overlap.sample} valeurs distinctes sur {overlap.distinct})"
            if overlap.sample < overlap.distinct
            else ""
        ),
        _name_sentence(similarity, a, b),
    ]
    if a.type is not b.type:
        parts.append(f"types différents ({a.type.value} / {b.type.value}), comparés en texte")
    if overlap.unique:
        parts.append(f"relation 1-1 : chaque {b.source}.{b.name} apparaît au plus une fois")
    else:
        parts.append(f"relation N-1 : plusieurs lignes de {a.source} pour une ligne de {b.source}")
    return " ; ".join(parts) + "."


class RelationDetector:
    def __init__(
        self,
        catalog: Catalog,
        settings: Settings,
        generator: DbtProjectGenerator,
        locks: WarehouseLocks,
    ) -> None:
        self.catalog = catalog
        self.settings = settings
        self.generator = generator
        self.locks = locks

    def _columns(self, project_id: str) -> tuple[list[_Column], list[_Column]]:
        """Candidate referencing columns and candidate referenced keys."""
        columns: list[_Column] = []
        keys: list[_Column] = []
        for table in self.catalog.list_tables(project_id, TableLayer.SILVER):
            assert table.source_id is not None
            plan = self.catalog.get_plan(table.source_id, version=table.plan_version)
            present = {c.name for c in table.columns}
            key_names = self._key_columns(plan)
            for column in plan.included_columns():
                if column.target_column not in present or column.target_type not in KEY_TYPES:
                    continue
                candidate = _Column(table, plan, column.target_column, column.target_type)
                columns.append(candidate)
                if column.target_column in key_names:
                    keys.append(candidate)
        return columns, keys

    def _key_columns(self, plan: TransformationPlan) -> set[str]:
        """Single-column primary key and strict candidate keys, by Silver name."""
        names: set[str] = set()
        if plan.primary_key is not None and len(plan.primary_key.columns) == 1:
            names.add(plan.key_columns()[0].target_column)
        try:
            profile = self.catalog.get_profile(plan.source_id)
        except ProfileNotFoundError:
            return names
        by_source = {c.source_column: c for c in plan.included_columns()}
        for key in profile.candidate_keys:
            if key.kind == "simple" and key.columns[0] in by_source:
                column = by_source[key.columns[0]]
                if column.pii_type is None:
                    names.add(column.target_column)
        return names

    def _overlap(self, con: duckdb.DuckDBPyConnection, a: _Column, b: _Column) -> _Overlap:
        a_table, a_col = quote_ident(a.table.name), quote_ident(a.name)
        b_table, b_col = quote_ident(b.table.name), quote_ident(b.name)
        limit = int(self.settings.relation_sample_size)
        [(distinct, sample, matched)] = con.execute(
            f"""
            WITH a AS (
                SELECT DISTINCT CAST({a_col} AS VARCHAR) AS v FROM {a_table}
                WHERE {a_col} IS NOT NULL
            ),
            sampled AS (SELECT v FROM a ORDER BY md5(v) LIMIT {limit}),
            b AS (
                SELECT DISTINCT CAST({b_col} AS VARCHAR) AS v FROM {b_table}
                WHERE {b_col} IS NOT NULL
            )
            SELECT (SELECT count(*) FROM a), count(*), count(b.v)
            FROM sampled LEFT JOIN b USING (v)
            """
        ).fetchall()
        [(non_null, distinct_rows)] = con.execute(
            f"SELECT count({a_col}), count(DISTINCT {a_col}) FROM {a_table}"
        ).fetchall()
        return _Overlap(
            distinct=int(distinct),
            sample=int(sample),
            matched=int(matched),
            unique=int(non_null) == int(distinct_rows),
        )

    def _candidate(self, con: duckdb.DuckDBPyConnection, a: _Column, b: _Column) -> Relation | None:
        similarity = name_similarity(a.name, a.table.name, b.name, b.table.name)
        text = a.type is SilverType.VARCHAR and b.type is SilverType.VARCHAR
        if similarity < SIMILAR_NAMES and not text:
            return None
        overlap = self._overlap(con, a, b)
        if overlap.sample == 0:
            return None
        ratio = overlap.ratio
        if ratio < self.settings.relation_min_inclusion:
            return None
        if similarity < SIMILAR_NAMES and (
            ratio < VALUE_ONLY_MIN_INCLUSION
            or overlap.distinct < self.settings.relation_min_distinct
        ):
            return None
        compatible = a.type is b.type
        confidence = round(
            WEIGHT_INCLUSION * ratio + WEIGHT_NAME * similarity + WEIGHT_TYPE * compatible, 3
        )
        if confidence < self.settings.relation_min_confidence:
            return None
        cardinality: Cardinality = "1-1" if overlap.unique else "N-1"
        now = utcnow()
        auto = (
            self.settings.auto_confirm_relations
            and confidence >= self.settings.relation_auto_confirm_confidence
        )
        return Relation(
            id=uuid.uuid4().hex,
            project_id=a.table.project_id,
            from_source_id=a.plan.source_id,
            from_source=a.source,
            from_table=a.table.name,
            from_column=a.name,
            to_source_id=b.plan.source_id,
            to_source=b.source,
            to_table=b.table.name,
            to_column=b.name,
            inclusion_ratio=round(ratio, 4),
            name_similarity=similarity,
            type_compatible=compatible,
            cardinality=cardinality,
            confidence=confidence,
            from_distinct=overlap.distinct,
            sample_size=overlap.sample,
            explanation=explain(a, b, overlap, similarity),
            status=RelationStatus.CONFIRMED if auto else RelationStatus.SUGGESTED,
            origin=RelationOrigin.DETECTED,
            created_at=now,
            updated_at=now,
        )

    def detect(
        self, project_id: str, log_line: Callable[[str], None] | None = None
    ) -> list[Relation]:
        """Detect relations and store them; confirmed and rejected ones are kept as decided."""
        self.catalog.get_project(project_id)
        columns, keys = self._columns(project_id)
        warehouse = self.generator.warehouse_path(project_id)
        detected: list[Relation] = []
        if keys and warehouse.exists():
            with (
                self.locks.hold(project_id, timeout=self.settings.export_lock_timeout_seconds),
                duck.connect(str(warehouse), read_only=True) as con,
            ):
                for b in keys:
                    for a in columns:
                        if a.table.id == b.table.id:
                            continue
                        relation = self._candidate(con, a, b)
                        if relation is not None:
                            detected.append(relation)
        detected = _one_direction(detected)
        relations = self.catalog.sync_detected_relations(project_id, detected)
        log.info("relations_detected", project_id=project_id, count=len(detected))
        if log_line is not None:
            for relation in detected:
                log_line(
                    f"relation {relation.from_source}.{relation.from_column} -> "
                    f"{relation.to_source}.{relation.to_column}: confidence "
                    f"{relation.confidence}, {relation.status.value}"
                )
        return relations


def _one_direction(relations: list[Relation]) -> list[Relation]:
    """Between two keys referencing each other (1-1), keep the most included direction."""
    by_key = {r.key: r for r in relations}
    kept: list[Relation] = []
    for relation in relations:
        reverse = by_key.get(
            (relation.to_table, relation.to_column, relation.from_table, relation.from_column)
        )
        if reverse is not None and (reverse.inclusion_ratio, relation.from_table) > (
            relation.inclusion_ratio,
            reverse.from_table,
        ):
            continue
        kept.append(relation)
    return sorted(kept, key=lambda r: r.key)
