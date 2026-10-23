"""Business agent endpoints: requests in French, clarifications, refinements, verification
preview, validation, approval and publication of data marts."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, status
from pydantic import BaseModel

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.agent.models import (
    ClarificationAnswer,
    MartQuestion,
    MartRefinement,
    MartRejection,
    MartRequest,
)
from forja_core.auth.models import Action
from forja_core.errors import ForbiddenError
from forja_core.jobs.models import Job

router = APIRouter(tags=["agent"])

AgentAccess = Annotated[Access, require(Action.MART_REQUEST)]


class MartRequestRun(BaseModel):
    """The request, and the run working on it (follow it with GET /runs/{id})."""

    mart_request: MartRequest
    run: Job | None = None


def _readable(access: Access, request: MartRequest) -> MartRequest:
    if request.owner_id != access.principal.id and not access.can(Action.MART_READ_ALL):
        raise ForbiddenError("this data mart request belongs to another user")
    return request


@router.post(
    "/projects/{project_id}/mart-requests",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ask for a data mart in French; the agent answers in a run",
)
def create_mart_request(
    project_id: str, payload: MartQuestion, state: StateDep, access: AgentAccess
) -> MartRequestRun:
    request, job = state.marts.create(project_id, access.principal, payload.question)
    return MartRequestRun(mart_request=state.catalog.get_mart_request(request.id), run=job)


@router.get(
    "/projects/{project_id}/mart-requests",
    summary="Requests of the caller (all of them for engineers)",
)
def list_mart_requests(project_id: str, state: StateDep, access: AgentAccess) -> list[MartRequest]:
    owner = None if access.can(Action.MART_READ_ALL) else access.principal.id
    return state.catalog.list_mart_requests(project_id, owner_id=owner)


@router.get("/mart-requests/{mart_id}")
def get_mart_request(mart_id: str, state: StateDep, access: AgentAccess) -> MartRequest:
    return _readable(access, state.catalog.get_mart_request(mart_id))


@router.post(
    "/mart-requests/{mart_id}/answer",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Answer the agent's question (option index or free text): a new version",
)
def answer_mart_request(
    mart_id: str, payload: ClarificationAnswer, state: StateDep, access: AgentAccess
) -> MartRequestRun:
    request, job = state.marts.answer(mart_id, access.principal, payload)
    return MartRequestRun(mart_request=request, run=job)


@router.post(
    "/mart-requests/{mart_id}/refine",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Refine the mart (« ajoute la marge », « seulement le T1 »): a new version",
)
def refine_mart_request(
    mart_id: str, payload: MartRefinement, state: StateDep, access: AgentAccess
) -> MartRequestRun:
    request, job = state.marts.refine(mart_id, access.principal, payload.instruction)
    return MartRequestRun(mart_request=request, run=job)


@router.post(
    "/mart-requests/{mart_id}/validate",
    summary="Validate the preview; publishes, or waits for an engineer's approval",
)
def validate_mart_request(mart_id: str, state: StateDep, access: AgentAccess) -> MartRequestRun:
    request, job = state.marts.validate(mart_id, access.principal)
    return MartRequestRun(mart_request=request, run=job)


@router.post(
    "/mart-requests/{mart_id}/approve",
    summary="Approve a validated request (FORJA_MART_REQUIRE_APPROVAL=true) and publish it",
)
def approve_mart_request(
    mart_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.MART_APPROVE)],
) -> MartRequestRun:
    request, job = state.marts.approve(mart_id, access.principal)
    return MartRequestRun(mart_request=request, run=job)


@router.post("/mart-requests/{mart_id}/reject", summary="Reject a request (author or engineer)")
def reject_mart_request(
    mart_id: str, payload: MartRejection, state: StateDep, access: AgentAccess
) -> MartRequest:
    request = state.catalog.get_mart_request(mart_id)
    if request.owner_id != access.principal.id:
        access.require(Action.MART_APPROVE)
    return state.marts.reject(mart_id, access.principal, payload.reason)
