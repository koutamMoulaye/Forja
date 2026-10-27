"""Gold plan endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.gold.plan import GoldPlan, GoldPlanPatch, ValidationIssue
from forja_core.jobs.models import Job, JobType, RunRequest

router = APIRouter(tags=["gold"])

ReadAccess = Annotated[Access, require(Action.GOLD_PLAN_READ)]
WriteAccess = Annotated[Access, require(Action.GOLD_PLAN_WRITE)]


class ProposeRequest(BaseModel):
    use_llm: bool = True


@router.post(
    "/projects/{project_id}/gold-plan/propose",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a star schema proposal (LLM if configured, else rules); returns the run",
)
def propose_gold_plan(
    project_id: str, state: StateDep, access: WriteAccess, request: ProposeRequest | None = None
) -> Job:
    """A local model can take minutes: follow the run, then read the Gold plan it wrote
    (``result.gold_plan_version``)."""
    use_llm = request.use_llm if request is not None else True
    job = state.executor.create(
        project_id,
        RunRequest(type=JobType.GOLD_PROPOSAL, use_llm=use_llm),
        created_by=access.principal.id,
    )
    state.runner.submit(job.id)
    access.audit("gold_plan.propose", object_type="run", object_id=job.id)
    return state.catalog.get_job(job.id)


@router.get("/projects/{project_id}/gold-plan", summary="Latest Gold plan, or a given version")
def get_gold_plan(
    project_id: str,
    state: StateDep,
    _access: ReadAccess,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> GoldPlan:
    return state.catalog.get_gold_plan(project_id, version=version)


@router.get(
    "/projects/{project_id}/gold-plan/issues",
    summary="Validation of the latest plan, recomputed with the current relations",
)
def get_gold_plan_issues(
    project_id: str, state: StateDep, _access: ReadAccess
) -> list[ValidationIssue]:
    return state.gold.issues(project_id)


@router.get("/projects/{project_id}/gold-plans", summary="All versions of the Gold plan")
def list_gold_plans(project_id: str, state: StateDep, _access: ReadAccess) -> list[GoldPlan]:
    return state.catalog.list_gold_plans(project_id)


@router.patch("/projects/{project_id}/gold-plan", summary="Edit: creates a new draft version")
def patch_gold_plan(
    project_id: str, patch: GoldPlanPatch, state: StateDep, access: WriteAccess
) -> GoldPlan:
    plan = state.gold.patch(project_id, patch)
    access.audit(
        "gold_plan.edit", object_type="gold_plan", object_id=plan.id,
        details={"version": plan.version},
    )  # fmt: skip
    return plan


@router.post(
    "/projects/{project_id}/gold-plan/approve",
    summary="Approve the latest draft; refused while validation reports errors",
)
def approve_gold_plan(project_id: str, state: StateDep, access: WriteAccess) -> GoldPlan:
    plan = state.gold.approve(project_id)
    access.audit(
        "gold_plan.approve", object_type="gold_plan", object_id=plan.id,
        details={"version": plan.version},
    )  # fmt: skip
    return plan
