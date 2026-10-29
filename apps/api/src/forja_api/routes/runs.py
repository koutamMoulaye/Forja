"""Run (job) endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from fastapi.responses import PlainTextResponse

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.errors import ForbiddenError, PlanValidationError
from forja_core.jobs.models import Job, JobType, RunPage, RunRequest
from forja_core.pagination import DEFAULT_LIMIT, MAX_LIMIT

router = APIRouter(tags=["runs"])

# Agent runs are created by the data mart endpoints, which keep their lifecycle.
_MART_RUNS = frozenset({JobType.MART_REQUEST, JobType.PUBLISH_MART})

ProjectAccess = Annotated[Access, require(Action.PROJECT_READ)]


def _visible(access: Access, job: Job) -> bool:
    """Engineers see every run; analysts only the runs they started (agent requests)."""
    return access.can(Action.RUN_READ) or job.created_by == access.principal.id


def _own_run(access: Access, run_id: str, state: StateDep) -> Job:
    job = state.catalog.get_job(run_id)
    if not _visible(access, job):
        access.require(Action.RUN_READ)
    return job


@router.post(
    "/projects/{project_id}/runs",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a profile, build_silver, build_gold, export or gold_proposal run",
)
def create_run(
    project_id: str,
    request: RunRequest,
    state: StateDep,
    access: Annotated[Access, require(Action.RUN_WRITE)],
) -> Job:
    if request.type in _MART_RUNS:
        raise PlanValidationError(
            f"{request.type.value} runs are created through /projects/{{id}}/mart-requests"
        )
    job = state.executor.create(project_id, request, created_by=access.principal.id)
    state.runner.submit(job.id)
    access.audit(f"run.{request.type.value}", object_type="run", object_id=job.id)
    return state.catalog.get_job(job.id)


@router.get("/projects/{project_id}/runs", summary="Runs of a project, most recent first")
def list_runs(
    project_id: str,
    state: StateDep,
    access: ProjectAccess,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunPage:
    # Analysts see the runs they started only (their agent requests).
    mine = None if access.can(Action.RUN_READ) else access.principal.id
    return RunPage(
        items=state.catalog.list_jobs(project_id, created_by=mine, limit=limit, offset=offset),
        total=state.catalog.count_jobs(project_id, created_by=mine),
        offset=offset,
        limit=limit,
    )


@router.get("/runs/{run_id}")
def get_run(run_id: str, state: StateDep, access: ProjectAccess) -> Job:
    return _own_run(access, run_id, state)


@router.post(
    "/runs/{run_id}/cancel",
    summary="Cancel a queued run, or a running LLM run (Gold proposal, agent request)",
)
def cancel_run(run_id: str, state: StateDep, access: ProjectAccess) -> Job:
    job = _own_run(access, run_id, state)
    if job.created_by != access.principal.id and not access.can(Action.RUN_WRITE):
        raise ForbiddenError("only the author of a run or an engineer can cancel it")
    cancelled = state.executor.cancel(run_id)
    access.audit("run.cancel", object_type="run", object_id=run_id)
    return cancelled


@router.get("/runs/{run_id}/logs", response_class=PlainTextResponse)
def get_run_logs(run_id: str, state: StateDep, access: ProjectAccess) -> str:
    _own_run(access, run_id, state)
    return state.catalog.job_logs(run_id)
