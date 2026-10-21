"""Gold plan endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from forja_api.state import StateDep
from forja_core.gold.plan import GoldPlan, GoldPlanPatch

router = APIRouter(tags=["gold"])


class ProposeRequest(BaseModel):
    use_llm: bool = True


@router.post(
    "/projects/{project_id}/gold-plan/propose",
    status_code=status.HTTP_201_CREATED,
    summary="Propose a star schema: by the configured LLM, else by deterministic rules",
)
def propose_gold_plan(
    project_id: str, state: StateDep, request: ProposeRequest | None = None
) -> GoldPlan:
    use_llm = request.use_llm if request is not None else True
    return state.gold.propose(project_id, use_llm=use_llm)


@router.get("/projects/{project_id}/gold-plan", summary="Latest Gold plan, or a given version")
def get_gold_plan(
    project_id: str,
    state: StateDep,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> GoldPlan:
    return state.catalog.get_gold_plan(project_id, version=version)


@router.get("/projects/{project_id}/gold-plans", summary="All versions of the Gold plan")
def list_gold_plans(project_id: str, state: StateDep) -> list[GoldPlan]:
    return state.catalog.list_gold_plans(project_id)


@router.patch("/projects/{project_id}/gold-plan", summary="Edit: creates a new draft version")
def patch_gold_plan(project_id: str, patch: GoldPlanPatch, state: StateDep) -> GoldPlan:
    return state.gold.patch(project_id, patch)


@router.post(
    "/projects/{project_id}/gold-plan/approve",
    summary="Approve the latest draft; refused while validation reports errors",
)
def approve_gold_plan(project_id: str, state: StateDep) -> GoldPlan:
    return state.gold.approve(project_id)
