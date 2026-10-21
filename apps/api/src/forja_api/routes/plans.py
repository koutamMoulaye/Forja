"""Transformation plan endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from forja_api.state import StateDep
from forja_core.silver.plan import PlanPatch, TransformationPlan

router = APIRouter(tags=["plans"])


@router.get("/sources/{source_id}/plan", summary="Latest plan version, or a given one")
def get_plan(
    source_id: str,
    state: StateDep,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> TransformationPlan:
    return state.catalog.get_plan(source_id, version=version)


@router.get("/sources/{source_id}/plans", summary="All versions of the plan")
def list_plans(source_id: str, state: StateDep) -> list[TransformationPlan]:
    return state.catalog.list_plans(source_id)


@router.patch(
    "/sources/{source_id}/plan",
    summary="Edit the plan: creates a new draft version",
)
def patch_plan(source_id: str, patch: PlanPatch, state: StateDep) -> TransformationPlan:
    return state.plans.patch(source_id, patch)


@router.post("/sources/{source_id}/plan/approve", summary="Approve the latest draft")
def approve_plan(source_id: str, state: StateDep) -> TransformationPlan:
    return state.plans.approve(source_id)
