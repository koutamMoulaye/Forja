"""Lifecycle of Gold plans: proposal (LLM or heuristic), edition, approval, application."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from forja_core.catalog import Catalog
from forja_core.errors import GoldProposalError, PlanStateError, PlanValidationError
from forja_core.gold.context import GoldContext, build_gold_context
from forja_core.gold.explain import refresh_explanations
from forja_core.gold.heuristic import propose_heuristic
from forja_core.gold.plan import GoldModel, GoldPlan, GoldPlanPatch, ValidationIssue
from forja_core.gold.validation import link_relations, validate_model
from forja_core.jobs.scope import report
from forja_core.logging import get_logger
from forja_core.silver.plan import PlanStatus
from forja_core.utils import utcnow

log = get_logger(__name__)

LLM_ATTEMPTS = 2


@dataclass(frozen=True)
class Proposal:
    model: GoldModel
    origin: str


class GoldProposer:
    """A language-model proposer; ``feedback`` lists the issues of a previous attempt."""

    origin: str

    def propose(self, ctx: GoldContext, feedback: list[str]) -> GoldModel:
        raise NotImplementedError


def _issue_lines(issues: list[ValidationIssue]) -> list[str]:
    return [f"[{i.code}] {i.message}" for i in issues if i.severity == "error"]


class GoldPlanService:
    def __init__(self, catalog: Catalog, proposer: GoldProposer | None = None) -> None:
        self.catalog = catalog
        self.proposer = proposer

    def context(self, project_id: str) -> GoldContext:
        ctx = build_gold_context(self.catalog, project_id)
        if not ctx.sources:
            raise GoldProposalError(
                "no Silver table has been built in this project: run build_silver first"
            )
        return ctx

    def _llm_proposal(self, ctx: GoldContext, warnings: list[str]) -> Proposal | None:
        if self.proposer is None:
            return None
        feedback: list[str] = []
        for attempt in range(1, LLM_ATTEMPTS + 1):
            report(
                "llm",
                f"proposition du modèle par {self.proposer.origin} (essai {attempt})",
                20 + 30 * (attempt - 1),
            )
            try:
                model = self.proposer.propose(ctx, feedback)
            except GoldProposalError as exc:
                warnings.append(
                    f"Proposition par LLM impossible ({exc.message}) : plan heuristique."
                )
                return None
            issues = validate_model(link_relations(model, ctx), ctx)
            feedback = _issue_lines(issues)
            if not feedback:
                return Proposal(model, self.proposer.origin)
            log.info("gold_llm_proposal_invalid", attempt=attempt, errors=len(feedback))
        warnings.append(
            "La proposition du LLM restait invalide après correction "
            f"({len(feedback)} erreur(s)) : plan heuristique."
        )
        return None

    def propose(self, project_id: str, *, use_llm: bool = True) -> GoldPlan:
        """A new draft version, from the language model if configured, else heuristic."""
        report("context", "lecture des tables Silver et des relations confirmées", 5)
        ctx = self.context(project_id)
        warnings: list[str] = []
        proposal = self._llm_proposal(ctx, warnings) if use_llm else None
        report("validation", "validation et enregistrement du plan", 90)
        if proposal is None:
            model, heuristic_warnings = propose_heuristic(ctx)
            warnings.extend(heuristic_warnings)
            proposal = Proposal(model, "heuristic")
        plan = self._new_version(project_id, proposal.model, proposal.origin, ctx, warnings)
        log.info(
            "gold_plan_proposed",
            project_id=project_id,
            version=plan.version,
            origin=plan.origin,
            errors=len(plan.errors),
        )
        return plan

    def _new_version(
        self,
        project_id: str,
        model: GoldModel,
        origin: str,
        ctx: GoldContext,
        warnings: list[str],
    ) -> GoldPlan:
        previous = self.catalog.latest_gold_plan(project_id)
        now = utcnow()
        linked = link_relations(model, ctx)
        plan = GoldPlan(
            **linked.model_dump(),
            id=uuid.uuid4().hex,
            project_id=project_id,
            version=(previous.version + 1) if previous else 1,
            status=PlanStatus.DRAFT,
            origin=origin,
            created_at=now,
            updated_at=now,
            issues=validate_model(linked, ctx),
            warnings=warnings,
        )
        refresh_explanations(plan)
        self.catalog.add_gold_plan(plan)
        return plan

    def patch(self, project_id: str, patch: GoldPlanPatch) -> GoldPlan:
        current = self.catalog.get_gold_plan(project_id)
        model = current.model()
        if patch.dimensions is not None:
            model.dimensions = patch.dimensions
        if patch.facts is not None:
            model.facts = patch.facts
        if patch.date_dimension is not None:
            model.date_dimension = patch.date_dimension
        for name, scd in (patch.dimension_scd or {}).items():
            dim = next((d for d in model.dimensions if d.name == name), None)
            if dim is None:
                raise PlanValidationError(
                    f"unknown dimension '{name}'", details={"dimension": name}
                )
            dim.scd = scd
        facts = {f.name: f for f in model.facts}
        for name, measures in (patch.add_measures or {}).items():
            if name not in facts:
                raise PlanValidationError(f"unknown fact '{name}'", details={"fact": name})
            facts[name].measures.extend(measures)
        for name, removed in (patch.remove_measures or {}).items():
            if name not in facts:
                raise PlanValidationError(f"unknown fact '{name}'", details={"fact": name})
            facts[name].measures = [m for m in facts[name].measures if m.name not in removed]
        ctx = self.context(project_id)
        plan = self._new_version(project_id, model, current.origin, ctx, [])
        log.info("gold_plan_patched", project_id=project_id, version=plan.version)
        return plan

    def approve(self, project_id: str) -> GoldPlan:
        plan = self.catalog.get_gold_plan(project_id)
        if plan.status is not PlanStatus.DRAFT:
            raise PlanStateError(
                f"Gold plan version {plan.version} is already {plan.status.value}",
                details={"version": plan.version, "status": plan.status.value},
            )
        ctx = self.context(project_id)
        plan.issues = validate_model(link_relations(plan.model(), ctx), ctx)
        refresh_explanations(plan)
        if plan.errors:
            self.catalog.update_gold_plan(plan)
            raise PlanValidationError(
                f"the Gold plan has {len(plan.errors)} error(s) to fix before approval",
                details={"issues": [i.model_dump() for i in plan.errors]},
            )
        plan.status = PlanStatus.APPROVED
        plan.updated_at = utcnow()
        self.catalog.update_gold_plan(plan)
        log.info("gold_plan_approved", project_id=project_id, version=plan.version)
        return plan

    def mark_applied(self, plan: GoldPlan) -> GoldPlan:
        if plan.status is not PlanStatus.APPLIED:
            plan.status = PlanStatus.APPLIED
            plan.updated_at = utcnow()
            self.catalog.update_gold_plan(plan)
        return plan
