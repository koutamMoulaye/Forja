"""Review of relations: confirm, reject, add manually."""

from __future__ import annotations

import uuid

import duckdb

from forja_core.catalog import Catalog
from forja_core.errors import RelationValidationError
from forja_core.logging import get_logger
from forja_core.relations.detector import RelationDetector, _Column, explain
from forja_core.relations.models import Relation, RelationCreate, RelationOrigin, RelationStatus
from forja_core.relations.naming import name_similarity
from forja_core.utils import utcnow

log = get_logger(__name__)


class RelationService:
    def __init__(self, catalog: Catalog, detector: RelationDetector) -> None:
        self.catalog = catalog
        self.detector = detector

    def _set_status(self, relation_id: str, status: RelationStatus) -> Relation:
        relation = self.catalog.get_relation(relation_id)
        updated = relation.model_copy(update={"status": status, "updated_at": utcnow()})
        log.info("relation_reviewed", relation_id=relation_id, status=status.value)
        return self.catalog.save_relation(updated)

    def confirm(self, relation_id: str) -> Relation:
        return self._set_status(relation_id, RelationStatus.CONFIRMED)

    def reject(self, relation_id: str) -> Relation:
        return self._set_status(relation_id, RelationStatus.REJECTED)

    def _column(self, project_id: str, source_id: str, name: str) -> _Column:
        source = self.catalog.get_source(source_id)
        if source.project_id != project_id:
            raise RelationValidationError(f"source '{source_id}' is not in this project")
        table = self.catalog.find_table(project_id, f"stg_{source.name}")
        if table is None:
            raise RelationValidationError(
                f"source '{source.name}' has no Silver table yet: run build_silver first"
            )
        plan = self.catalog.get_plan(source_id, version=table.plan_version)
        column = next((c for c in plan.included_columns() if c.target_column == name), None)
        if column is None or name not in {c.name for c in table.columns}:
            raise RelationValidationError(
                f"column '{name}' does not exist in {table.name}",
                details={"table": table.name, "column": name},
            )
        return _Column(table, plan, name, column.target_type)

    def add(self, project_id: str, payload: RelationCreate) -> Relation:
        """A relation declared by a person: measured like a detected one, then confirmed."""
        a = self._column(project_id, payload.from_source_id, payload.from_column)
        b = self._column(project_id, payload.to_source_id, payload.to_column)
        if a.table.id == b.table.id:
            raise RelationValidationError("a relation links two different tables")
        warehouse = self.detector.generator.warehouse_path(project_id)
        with (
            self.detector.locks.hold(
                project_id, timeout=self.detector.settings.export_lock_timeout_seconds
            ),
            duckdb.connect(str(warehouse), read_only=True) as con,
        ):
            overlap = self.detector._overlap(con, a, b)
            [(non_null, distinct)] = con.execute(
                f'SELECT count("{b.name}"), count(DISTINCT "{b.name}") FROM "{b.table.name}"'
            ).fetchall()
        if int(non_null) != int(distinct):
            raise RelationValidationError(
                f"{b.source}.{b.name} is not unique: it cannot be referenced as a key",
                details={"table": b.table.name, "column": b.name},
            )
        similarity = name_similarity(a.name, a.table.name, b.name, b.table.name)
        now = utcnow()
        relation = Relation(
            id=uuid.uuid4().hex,
            project_id=project_id,
            from_source_id=a.plan.source_id,
            from_source=a.source,
            from_table=a.table.name,
            from_column=a.name,
            to_source_id=b.plan.source_id,
            to_source=b.source,
            to_table=b.table.name,
            to_column=b.name,
            inclusion_ratio=round(overlap.ratio, 4),
            name_similarity=similarity,
            type_compatible=a.type is b.type,
            cardinality="1-1" if overlap.unique else "N-1",
            confidence=1.0,
            from_distinct=overlap.distinct,
            sample_size=overlap.sample,
            explanation="Ajoutée manuellement. " + explain(a, b, overlap, similarity),
            status=RelationStatus.CONFIRMED,
            origin=RelationOrigin.MANUAL,
            created_at=now,
            updated_at=now,
        )
        return self.catalog.save_relation(relation)
