"""Lifecycle of transformation plans: draft -> approved -> applied."""

from __future__ import annotations

import uuid

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import PlanStateError, PlanValidationError
from forja_core.ingestion.service import IngestedVersion
from forja_core.logging import get_logger
from forja_core.silver.plan import PlanPatch, PlanStatus, TransformationPlan
from forja_core.silver.planner import apply_patch, build_plan, plan_signature, refresh_plan
from forja_core.silver.review import ReviewDecision, rejection_patch, review_rules
from forja_core.utils import utcnow

log = get_logger(__name__)


class PlanService:
    def __init__(self, catalog: Catalog, settings: Settings) -> None:
        self.catalog = catalog
        self.settings = settings

    def on_version_ingested(self, ingested: IngestedVersion) -> None:
        """Create or refresh the plan of a source after a new Bronze version."""
        if ingested.profile is None:
            log.warning("plan_skipped_without_profile", source_id=ingested.source.id)
            return
        previous = self.catalog.latest_plan(ingested.source.id)
        now = utcnow()
        if previous is None:
            plan = build_plan(
                ingested.source,
                ingested.profile,
                self.settings,
                plan_id=uuid.uuid4().hex,
                version=1,
                now=now,
            )
        else:
            plan = refresh_plan(
                previous,
                ingested.source,
                ingested.profile,
                self.settings,
                plan_id=uuid.uuid4().hex,
                now=now,
            )
            if plan_signature(plan) == plan_signature(previous):
                return
        self.catalog.add_plan(plan)
        log.info(
            "plan_generated",
            source_id=plan.source_id,
            version=plan.version,
            status=plan.status.value,
            warnings=len(plan.warnings),
        )

    def patch(self, source_id: str, patch: PlanPatch) -> TransformationPlan:
        current = self.catalog.get_plan(source_id)
        plan = apply_patch(current, patch, plan_id=uuid.uuid4().hex, now=utcnow())
        if plan_signature(plan) == plan_signature(current):
            return current
        plan.warnings = []
        plan.reviews = _untouched_reviews(current, patch)
        self.catalog.add_plan(plan)
        log.info("plan_patched", source_id=source_id, version=plan.version)
        return plan

    def review(
        self, source_id: str, decisions: dict[str, ReviewDecision | None]
    ) -> TransformationPlan:
        """Record decisions on the rules of the latest draft, in place (no new version)."""
        plan = self._draft(source_id)
        rules = {rule.id: rule for rule in review_rules(plan)}
        for rule_id, decision in decisions.items():
            rule = rules.get(rule_id)
            if rule is None:
                raise PlanValidationError(
                    f"unknown rule '{rule_id}' in plan version {plan.version}",
                    details={"rule": rule_id, "version": plan.version},
                )
            if decision == "rejected" and not rule.rejectable:
                raise PlanValidationError(
                    f"rule '{rule_id}' cannot be rejected: change its treatment instead",
                    details={"rule": rule_id},
                )
            if decision is None:
                plan.reviews.pop(rule_id, None)
            else:
                plan.reviews[rule_id] = decision
        plan.updated_at = utcnow()
        self.catalog.update_plan(plan)
        log.info("plan_reviewed", source_id=source_id, version=plan.version)
        return plan

    def _draft(self, source_id: str) -> TransformationPlan:
        plan = self.catalog.get_plan(source_id)
        if plan.status is not PlanStatus.DRAFT:
            raise PlanStateError(
                f"plan version {plan.version} is already {plan.status.value}",
                details={"version": plan.version, "status": plan.status.value},
            )
        return plan

    def approve(self, source_id: str) -> TransformationPlan:
        """Approve the latest draft; rejected rules are undone first, in a new version."""
        plan = self._draft(source_id)
        undo = rejection_patch(plan)
        if undo is not None:
            reviewed = apply_patch(plan, undo, plan_id=uuid.uuid4().hex, now=utcnow())
            reviewed.reviews = {k: v for k, v in plan.reviews.items() if v == "validated"}
            self.catalog.add_plan(reviewed)
            plan = reviewed
        plan.status = PlanStatus.APPROVED
        plan.updated_at = utcnow()
        self.catalog.update_plan(plan)
        log.info("plan_approved", source_id=source_id, version=plan.version)
        return plan

    def mark_applied(self, plan: TransformationPlan) -> TransformationPlan:
        if plan.status is PlanStatus.APPLIED:
            return plan
        plan.status = PlanStatus.APPLIED
        plan.updated_at = utcnow()
        self.catalog.update_plan(plan)
        return plan


def _untouched_reviews(plan: TransformationPlan, patch: PlanPatch) -> dict[str, ReviewDecision]:
    """Decisions on the rules a patch does not change; edited rules go back to review."""
    changed = set(patch.columns)
    rules = {rule.id: rule for rule in review_rules(plan)}
    kept: dict[str, ReviewDecision] = {}
    for rule_id, decision in plan.reviews.items():
        rule = rules.get(rule_id)
        if rule is None or changed & set(rule.columns):
            continue
        if rule_id == "primary_key" and patch.primary_key is not None:
            continue
        if rule_id == "deduplicate" and patch.deduplicate is not None:
            continue
        kept[rule_id] = decision
    return kept
