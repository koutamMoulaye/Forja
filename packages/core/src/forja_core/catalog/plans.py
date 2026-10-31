"""Persistence of versioned transformation plans."""

from __future__ import annotations

from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.sources import SourcesMixin
from forja_core.errors import PlanNotFoundError
from forja_core.silver.plan import PlanStatus, TransformationPlan

_EFFECTIVE = (PlanStatus.APPROVED.value, PlanStatus.APPLIED.value)


class PlansMixin(SourcesMixin):
    def add_plan(self, plan: TransformationPlan) -> None:
        self._execute(
            "INSERT INTO plans VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                plan.id,
                plan.project_id,
                plan.source_id,
                plan.version,
                plan.status.value,
                plan.model_dump_json(),
                to_db_timestamp(plan.created_at),
                to_db_timestamp(plan.updated_at),
            ],
        )

    def update_plan(self, plan: TransformationPlan) -> None:
        """Persist a status change; the plan content of a version is otherwise immutable."""
        self._execute(
            "UPDATE plans SET status = ?, plan = ?, updated_at = ? WHERE id = ?",
            [
                plan.status.value,
                plan.model_dump_json(),
                to_db_timestamp(plan.updated_at),
                plan.id,
            ],
        )

    def latest_plan(self, source_id: str) -> TransformationPlan | None:
        row = self._fetchone(
            "SELECT plan FROM plans WHERE source_id = ? ORDER BY version DESC LIMIT 1",
            [source_id],
        )
        return None if row is None else TransformationPlan.model_validate_json(row[0])

    def latest_plans(self, project_id: str) -> dict[str, TransformationPlan]:
        """The latest plan of every source of a project, in one query."""
        rows = self._fetchall(
            "SELECT plan FROM ("
            "  SELECT plan, row_number() OVER (PARTITION BY source_id ORDER BY version DESC) AS n"
            "  FROM plans WHERE project_id = ?"
            ") WHERE n = 1",
            [project_id],
        )
        plans = [TransformationPlan.model_validate_json(row[0]) for row in rows]
        return {plan.source_id: plan for plan in plans}

    def effective_plan(self, source_id: str) -> TransformationPlan | None:
        """Most recent approved or applied version: the one the Silver build uses."""
        row = self._fetchone(
            "SELECT plan FROM plans WHERE source_id = ? AND status IN (?, ?) "
            "ORDER BY version DESC LIMIT 1",
            [source_id, *_EFFECTIVE],
        )
        return None if row is None else TransformationPlan.model_validate_json(row[0])

    def get_plan(self, source_id: str, version: int | None = None) -> TransformationPlan:
        self.get_source(source_id)
        if version is None:
            plan = self.latest_plan(source_id)
        else:
            row = self._fetchone(
                "SELECT plan FROM plans WHERE source_id = ? AND version = ?",
                [source_id, version],
            )
            plan = None if row is None else TransformationPlan.model_validate_json(row[0])
        if plan is None:
            raise PlanNotFoundError(f"no transformation plan for source '{source_id}'")
        return plan

    def list_plans(self, source_id: str) -> list[TransformationPlan]:
        self.get_source(source_id)
        rows = self._fetchall(
            "SELECT plan FROM plans WHERE source_id = ? ORDER BY version", [source_id]
        )
        return [TransformationPlan.model_validate_json(row[0]) for row in rows]

    def effective_plans(self, project_id: str) -> list[TransformationPlan]:
        rows = self._fetchall(
            "SELECT plan FROM ("
            "  SELECT plan, row_number() OVER (PARTITION BY source_id ORDER BY version DESC) AS n"
            "  FROM plans WHERE project_id = ? AND status IN (?, ?)"
            ") WHERE n = 1",
            [project_id, *_EFFECTIVE],
        )
        plans = [TransformationPlan.model_validate_json(row[0]) for row in rows]
        return sorted(plans, key=lambda p: p.source_name)
