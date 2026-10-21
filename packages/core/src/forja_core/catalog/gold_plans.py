"""Persistence of versioned Gold plans (one sequence per project)."""

from __future__ import annotations

from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.llm_calls import LLMCallsMixin
from forja_core.errors import GoldPlanNotFoundError
from forja_core.gold.plan import GoldPlan
from forja_core.silver.plan import PlanStatus

_EFFECTIVE = (PlanStatus.APPROVED.value, PlanStatus.APPLIED.value)


class GoldPlansMixin(LLMCallsMixin):
    def add_gold_plan(self, plan: GoldPlan) -> None:
        self._execute(
            "INSERT INTO gold_plans VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                plan.id,
                plan.project_id,
                plan.version,
                plan.status.value,
                plan.model_dump_json(),
                to_db_timestamp(plan.created_at),
                to_db_timestamp(plan.updated_at),
            ],
        )

    def update_gold_plan(self, plan: GoldPlan) -> None:
        self._execute(
            "UPDATE gold_plans SET status = ?, plan = ?, updated_at = ? WHERE id = ?",
            [plan.status.value, plan.model_dump_json(), to_db_timestamp(plan.updated_at), plan.id],
        )

    def latest_gold_plan(self, project_id: str) -> GoldPlan | None:
        row = self._fetchone(
            "SELECT plan FROM gold_plans WHERE project_id = ? ORDER BY version DESC LIMIT 1",
            [project_id],
        )
        return None if row is None else GoldPlan.model_validate_json(row[0])

    def effective_gold_plan(self, project_id: str) -> GoldPlan | None:
        row = self._fetchone(
            "SELECT plan FROM gold_plans WHERE project_id = ? AND status IN (?, ?) "
            "ORDER BY version DESC LIMIT 1",
            [project_id, *_EFFECTIVE],
        )
        return None if row is None else GoldPlan.model_validate_json(row[0])

    def get_gold_plan(self, project_id: str, version: int | None = None) -> GoldPlan:
        self.get_project(project_id)
        if version is None:
            plan = self.latest_gold_plan(project_id)
        else:
            row = self._fetchone(
                "SELECT plan FROM gold_plans WHERE project_id = ? AND version = ?",
                [project_id, version],
            )
            plan = None if row is None else GoldPlan.model_validate_json(row[0])
        if plan is None:
            raise GoldPlanNotFoundError(f"no Gold plan for project '{project_id}'")
        return plan

    def list_gold_plans(self, project_id: str) -> list[GoldPlan]:
        self.get_project(project_id)
        rows = self._fetchall(
            "SELECT plan FROM gold_plans WHERE project_id = ? ORDER BY version", [project_id]
        )
        return [GoldPlan.model_validate_json(row[0]) for row in rows]
