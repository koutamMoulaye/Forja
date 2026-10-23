"""Transformation plan endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.silver.plan import PlanPatch, TransformationPlan

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
) -> TransformationPlan:
    plan = state.plans.approve(source_id)
    access.audit(
        "silver_plan.approve", object_type="silver_plan", object_id=plan.id,
        details={"source_id": source_id, "version": plan.version},
    )  # fmt: skip
    return plan
