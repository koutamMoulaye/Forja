"""Lifecycle of Gold plans: proposal (LLM or heuristic), edition, approval, application."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from forja_core.catalog import Catalog
from forja_core.errors import GoldProposalError, PlanStateError, PlanValidationError
from forja_core.gold.context import GoldContext, build_gold_context
from forja_core.gold.dates import complete_dates
from forja_core.gold.explain import refresh_explanations
from forja_core.gold.heuristic import propose_heuristic
from forja_core.gold.naming import process_label
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

    def context_tokens(self, ctx: GoldContext, *, compact: bool | None = None) -> int:
        """Tokens sent for a proposal (``compact=False``: the full context)."""
        return 0


class LLMEstimate(BaseModel):
    """What « Améliorer avec l'IA » would cost, said before it is launched."""

    available: bool
    origin: str | None = None
    context_tokens: int = Field(default=0, description="Tokens sent (compact context)")
    full_context_tokens: int = Field(default=0, description="Tokens of the full context")
    tokens_per_second: float | None = Field(
        default=None, description="Throughput measured on this model's previous calls"
    )
    measured_calls: int = 0
    estimated_seconds: int | None = Field(
        default=None, description="(context + expected answer) / throughput; None unmeasured"
    )


class Alternative(BaseModel):
    """A language model's proposal, kept beside the current plan to be compared."""

    model: GoldModel
    origin: str
    based_on: int | None = Field(default=None, description="Version it is compared with")
    issues: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# Tokens a Gold proposal answers with, before any has been measured.
EXPECTED_ANSWER_TOKENS = 2500
# Recent calls of a model used to measure its throughput.
THROUGHPUT_CALLS = 20
# Validation errors a person resolves, not the language model.
_PERSON_CODES = frozenset({"unconfirmed_relation"})


def _complete(model: GoldModel, ctx: GoldContext) -> GoldModel:
    """Main dates and date roles a proposal left out, decided as the heuristic does."""
    facts = []
    for fact in model.facts:
        source = ctx.sources.get(fact.source)
        process = process_label(fact.source, source.columns if source else [])
        facts.append(complete_dates(fact, source, process))
    return model.model_copy(update={"facts": facts})


_SOURCE_FIELDS = frozenset({"source", "from_source"})


def normalize_sources(model: GoldModel, ctx: GoldContext) -> GoldModel:
    """A proposal naming a source by its Silver table (« stg_<source> ») or with another
    case: the reference is mapped to the source name, as Forja would have written it. A
    language model often reads the table name in the context; refusing the whole
    proposal for that alone sent it back to the heuristic."""
    aliases: dict[str, str] = {}
    for name, source in ctx.sources.items():
        for alias in (name, source.model, source.model.removeprefix("stg_")):
            aliases.setdefault(alias.lower(), name)

    def fix(value: object) -> object:
        if isinstance(value, dict):
            return {
                k: (
                    aliases.get(v.lower(), v)
                    if k in _SOURCE_FIELDS and isinstance(v, str) and v not in ctx.sources
                    else fix(v)
                )
                for k, v in value.items()
            }
        if isinstance(value, list):
            return [fix(v) for v in value]
        return value

    return GoldModel.model_validate(fix(model.model_dump()))


def _issue_lines(issues: list[ValidationIssue]) -> list[str]:
    """Errors the language model can correct (a relation to confirm is a person's)."""
    return [
        f"[{i.code}] {i.message}"
        for i in issues
        if i.severity == "error" and i.code not in _PERSON_CODES
    ]


class GoldPlanService:
    def __init__(
        self,
        catalog: Catalog,
        proposer: GoldProposer | None = None,
        data_dir: Path | None = None,
    ) -> None:
        self.catalog = catalog
        self.proposer = proposer
        self.data_dir = data_dir

    def context(self, project_id: str, *, history: bool = False) -> GoldContext:
        """``history``: measure the keys that changed between versions of each source
        (read from Bronze), which decides SCD2 in a proposal."""
        ctx = build_gold_context(self.catalog, project_id, self.data_dir if history else None)
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
            # Validated as it would be saved: source names normalized, main dates and
            # date roles completed as the heuristic does.
            model = normalize_sources(model, ctx)
            issues = validate_model(link_relations(_complete(model, ctx), ctx), ctx)
            feedback = _issue_lines(issues)
            if not feedback:
                return Proposal(model, self.proposer.origin)
            log.info(
                "gold_llm_proposal_invalid", attempt=attempt, errors=len(feedback), issues=feedback
            )
        shown = " ; ".join(feedback[:3]) + (" ; …" if len(feedback) > 3 else "")
        warnings.append(
            "La proposition du LLM restait invalide après correction "
            f"({len(feedback)} erreur(s) : {shown}) : plan heuristique."
        )
        return None

    def propose_alternative(self, project_id: str) -> Alternative:
        """The language model's proposal, validated, not saved as a version: it is shown
        beside the current plan and adopted, or not, by a person."""
        if self.proposer is None:
            raise GoldProposalError("no language model is configured")
        report("context", "lecture des tables Silver et des relations", 5)
        ctx = self.context(project_id, history=True)
        warnings: list[str] = []
        proposal = self._llm_proposal(ctx, warnings)
        if proposal is None:
            raise GoldProposalError(warnings[-1] if warnings else "no proposal")
        report("validation", "validation de la proposition", 90)
        linked = link_relations(_complete(proposal.model, ctx), ctx)
        previous = self.catalog.latest_gold_plan(project_id)
        return Alternative(
            model=linked,
            origin=proposal.origin,
            based_on=previous.version if previous else None,
            issues=validate_model(linked, ctx),
            warnings=warnings,
        )

    def adopt(self, project_id: str, alternative: Alternative) -> GoldPlan:
        """A new draft version from an alternative proposal."""
        ctx = self.context(project_id)
        plan = self._new_version(
            project_id, alternative.model, alternative.origin, ctx, alternative.warnings
        )
        log.info("gold_plan_adopted", project_id=project_id, version=plan.version)
        return plan

    def llm_estimate(self, project_id: str) -> LLMEstimate:
        """Context size and expected duration of a proposal by the language model, from
        the throughput measured on its previous calls."""
        if self.proposer is None:
            return LLMEstimate(available=False)
        ctx = self.context(project_id)
        tokens = self.proposer.context_tokens(ctx)
        full = self.proposer.context_tokens(ctx, compact=False)
        provider, _, model = self.proposer.origin.removeprefix("llm:").partition("/")
        calls = [
            c
            for c in self.catalog.list_llm_calls()
            if c.provider == provider
            and c.model == model
            and c.status == "succeeded"
            and c.duration_ms > 0
            and c.input_tokens + c.output_tokens > 0
        ][-THROUGHPUT_CALLS:]
        rate = None
        if calls:
            seconds = sum(c.duration_ms for c in calls) / 1000
            rate = round(sum(c.input_tokens + c.output_tokens for c in calls) / seconds, 1)
        answers = sorted(c.output_tokens for c in calls if c.purpose == "gold_plan")
        expected = answers[len(answers) // 2] if answers else EXPECTED_ANSWER_TOKENS
        return LLMEstimate(
            available=True,
            origin=self.proposer.origin,
            context_tokens=tokens,
            full_context_tokens=full,
            tokens_per_second=rate,
            measured_calls=len(calls),
            estimated_seconds=round((tokens + expected) / rate) if rate else None,
        )

    def propose(self, project_id: str, *, use_llm: bool = True) -> GoldPlan:
        """A new draft version, from the language model if configured, else heuristic."""
        report("context", "lecture des tables Silver et des relations", 5)
        ctx = self.context(project_id, history=True)
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
        linked = link_relations(_complete(model, ctx), ctx)
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

    def issues(self, project_id: str) -> list[ValidationIssue]:
        """Validation of the latest plan against the current relations and tables.

        Stored issues date from the plan's creation; confirming a relation since then
        may have resolved some of them.
        """
        plan = self.catalog.get_gold_plan(project_id)
        ctx = self.context(project_id)
        return validate_model(link_relations(plan.model(), ctx), ctx)

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
