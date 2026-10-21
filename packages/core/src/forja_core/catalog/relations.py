"""Persistence of relations between Silver tables."""

from __future__ import annotations

from collections.abc import Sequence

from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.jobs import JobsMixin
from forja_core.errors import RelationNotFoundError
from forja_core.relations.models import Relation, RelationStatus
from forja_core.utils import utcnow


class RelationsMixin(JobsMixin):
    def save_relation(self, relation: Relation) -> Relation:
        """Insert, or update the relation with the same columns (keeping its id)."""
        existing = self._fetchone(
            "SELECT id FROM relations WHERE project_id = ? AND from_table = ? "
            "AND from_column = ? AND to_table = ? AND to_column = ?",
            [relation.project_id, *relation.key],
        )
        if existing is not None:
            relation = relation.model_copy(update={"id": existing[0]})
            self._execute(
                "UPDATE relations SET status = ?, origin = ?, data = ?, updated_at = ? "
                "WHERE id = ?",
                [
                    relation.status.value,
                    relation.origin.value,
                    relation.model_dump_json(),
                    to_db_timestamp(relation.updated_at),
                    relation.id,
                ],
            )
            return relation
        self._execute(
            "INSERT INTO relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                relation.id,
                relation.project_id,
                *relation.key,
                relation.status.value,
                relation.origin.value,
                relation.model_dump_json(),
                to_db_timestamp(relation.created_at),
                to_db_timestamp(relation.updated_at),
            ],
        )
        return relation

    def list_relations(
        self, project_id: str, status: RelationStatus | None = None
    ) -> list[Relation]:
        self.get_project(project_id)
        sql = "SELECT data FROM relations WHERE project_id = ?"
        params: list[object] = [project_id]
        if status is not None:
            sql += " AND status = ?"
            params.append(status.value)
        rows = self._fetchall(sql + " ORDER BY from_table, from_column, to_table", params)
        return [Relation.model_validate_json(row[0]) for row in rows]

    def get_relation(self, relation_id: str) -> Relation:
        row = self._fetchone("SELECT data FROM relations WHERE id = ?", [relation_id])
        if row is None:
            raise RelationNotFoundError(f"relation '{relation_id}' not found")
        return Relation.model_validate_json(row[0])

    def sync_detected_relations(
        self, project_id: str, detected: Sequence[Relation]
    ) -> list[Relation]:
        """Store a detection: statistics are refreshed, review decisions are kept.

        Suggestions that are no longer detected are dropped; confirmed, rejected and
        manual relations are never removed by a detection.
        """
        current = {r.key: r for r in self.list_relations(project_id)}
        found = {r.key for r in detected}
        with self._transaction():
            for relation in detected:
                previous = current.get(relation.key)
                if previous is not None:
                    relation = relation.model_copy(
                        update={
                            "id": previous.id,
                            "created_at": previous.created_at,
                            "status": (
                                previous.status
                                if previous.status is not RelationStatus.SUGGESTED
                                else relation.status
                            ),
                            "origin": previous.origin,
                            "updated_at": utcnow(),
                        }
                    )
                self.save_relation(relation)
            for key, previous in current.items():
                if key not in found and previous.status is RelationStatus.SUGGESTED:
                    self._execute("DELETE FROM relations WHERE id = ?", [previous.id])
        return self.list_relations(project_id)
