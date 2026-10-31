"""Transformation plan endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.silver.plan import PlanPatch, TransformationPlan
from forja_core.silver.quarantine import Quarantine
from forja_core.silver.review import PlanReview, ReviewUpdate, plan_review
from forja_core.silver.samples import PlanSamples, plan_samples
from forja_core.silver.tables import TableLayer

router = APIRouter(tags=["plans"])


@router.get("/sources/{source_id}/plan", summary="Latest plan version, or a given one")
def get_plan(
    source_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.SILVER_READ)],
    version: Annotated[int | None, Query(ge=1)] = None,
) -> TransformationPlan:
    return state.catalog.get_plan(source_id, version=version)


@router.get("/sources/{source_id}/plans", summary="All versions of the plan")
def list_plans(
    source_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.SILVER_READ)],
) -> list[TransformationPlan]:
    return state.catalog.list_plans(source_id)


@router.patch(
    "/sources/{source_id}/plan",
    summary="Edit the plan: creates a new draft version",
)
def patch_plan(
    source_id: str,
    patch: PlanPatch,
    state: StateDep,
    access: Annotated[Access, require(Action.PLAN_WRITE)],
) -> TransformationPlan:
    plan = state.plans.patch(source_id, patch)
    access.audit(
        "silver_plan.edit", object_type="silver_plan", object_id=plan.id,
        details={"source_id": source_id, "version": plan.version},
    )  # fmt: skip
    return plan


@router.post("/sources/{source_id}/plan/approve", summary="Approve the latest draft")
def approve_plan(
    source_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.PLAN_WRITE)],
    version: Annotated[
        int | None,
        Query(ge=1, description="Version shown when approving; 409 if the plan has moved since"),
    ] = None,
) -> TransformationPlan:
    plan = state.plans.approve(source_id, version)
    access.audit(
        "silver_plan.approve", object_type="silver_plan", object_id=plan.id,
        details={"source_id": source_id, "version": plan.version},
    )  # fmt: skip
    return plan


@router.get(
    "/sources/{source_id}/plan/review",
    summary="The plan as a list of rules, with the decision taken on each",
)
def get_plan_review(
    source_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.SILVER_READ)],
    version: Annotated[int | None, Query(ge=1)] = None,
) -> PlanReview:
    return plan_review(state.catalog.get_plan(source_id, version=version))


@router.post(
    "/sources/{source_id}/plan/review",
    summary="Validate or reject rules of the latest draft (no new version)",
)
def review_plan(
    source_id: str,
    update: ReviewUpdate,
    state: StateDep,
    access: Annotated[Access, require(Action.PLAN_WRITE)],
) -> PlanReview:
    plan = state.plans.review(source_id, update.decisions, update.version)
    access.audit(
        "silver_plan.review", object_type="silver_plan", object_id=plan.id,
        details={"source_id": source_id, "version": plan.version, "decisions": update.decisions},
    )  # fmt: skip
    return plan_review(plan)


@router.get(
    "/sources/{source_id}/plan/samples",
    summary="Before and after values of each column on a sample of the latest version",
)
def get_plan_samples(
    source_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.SILVER_READ)],
    version: Annotated[int | None, Query(ge=1)] = None,
) -> PlanSamples:
    """Personal values are masked for engineers, pseudonymized for other roles; in clear
    only with FORJA_ALLOW_BRONZE_PREVIEW and the right to read Bronze."""
    source = state.catalog.get_source(source_id)
    plan = state.catalog.get_plan(source_id, version=version)
    return plan_samples(
        plan,
        state.workspace.resolve(source.bronze_path),
        state.publisher.secrets.salt(source.project_id),
        unmasked=access.unmasked,
        clear_personal=state.settings.allow_bronze_preview and access.can(Action.BRONZE_PREVIEW),
    )


@router.get(
    "/sources/{source_id}/rejects",
    summary="Rows in quarantine after the Silver build, by reason",
)
def get_rejects(
    source_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.SILVER_READ)],
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
    run_id: Annotated[str | None, Query(description="Only the rows of this run")] = None,
) -> Quarantine:
    source = state.catalog.get_source(source_id)
    built = next(
        (
            t
            for t in state.catalog.list_tables(source.project_id)
            if t.layer is TableLayer.SILVER and t.source_id == source_id
        ),
        None,
    )
    plan = state.catalog.get_plan(source_id, version=built.plan_version if built else None)
    return state.publisher.quarantine(
        plan, min(limit, state.settings.preview_max_rows), strict=not access.unmasked, run_id=run_id
    )
