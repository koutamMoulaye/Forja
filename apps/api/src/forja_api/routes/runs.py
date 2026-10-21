"""Run (job) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import PlainTextResponse

from forja_api.state import StateDep
from forja_core.jobs.models import Job, RunRequest

router = APIRouter(tags=["runs"])


@router.post(
    "/projects/{project_id}/runs",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a profile, build_silver or export run",
)
def create_run(project_id: str, request: RunRequest, state: StateDep) -> Job:
    job = state.executor.create(project_id, request)
    state.runner.submit(job.id)
    return state.catalog.get_job(job.id)


@router.get("/projects/{project_id}/runs", summary="Runs of a project, most recent first")
def list_runs(project_id: str, state: StateDep) -> list[Job]:
    return state.catalog.list_jobs(project_id)


@router.get("/runs/{run_id}")
def get_run(run_id: str, state: StateDep) -> Job:
    return state.catalog.get_job(run_id)


@router.get("/runs/{run_id}/logs", response_class=PlainTextResponse)
def get_run_logs(run_id: str, state: StateDep) -> str:
    return state.catalog.job_logs(run_id)
