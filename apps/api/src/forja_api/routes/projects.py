"""Project endpoints: projects, members, invitations and audit log."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from forja_api.security import Access, AdminDep, PrincipalDep, require
from forja_api.state import StateDep
from forja_core.auth.models import (
    Action,
    AuditPage,
    AuditQuery,
    Invitation,
    InvitationCreate,
    Membership,
    MembershipUpdate,
    Role,
)
from forja_core.models import Project, ProjectCreate
from forja_core.pagination import DEFAULT_LIMIT, MAX_LIMIT

router = APIRouter(tags=["projects"])


@router.post(
    "/projects",
    status_code=status.HTTP_201_CREATED,
    summary="Create a project (instance administrator); the creator becomes its admin",
)
def create_project(payload: ProjectCreate, admin: AdminDep, state: StateDep) -> Project:
    project = state.catalog.create_project(payload)
    state.workspace.ensure_project(project.id)
    state.catalog.set_membership(project.id, admin.id, Role.ADMIN)
    state.auth.audit(
        admin, "project.create", project_id=project.id, object_type="project", object_id=project.id
    )
    return project


@router.get("/projects", summary="Projects the caller belongs to")
def list_projects(principal: PrincipalDep, state: StateDep) -> list[Project]:
    projects = state.catalog.list_projects()
    return [p for p in projects if principal.role(p.id) is not None]


@router.get("/projects/{project_id}/members")
def list_members(
    project_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> list[Membership]:
    return state.catalog.list_memberships(project_id)


@router.put("/projects/{project_id}/members/{user_id}", summary="Set the role of a member")
def set_member_role(
    project_id: str,
    user_id: str,
    payload: MembershipUpdate,
    state: StateDep,
    access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> Membership:
    return state.auth.set_role(access.principal, project_id, user_id, payload.role)


@router.delete("/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: str,
    user_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> None:
    state.auth.remove_member(access.principal, project_id, user_id)


@router.post(
    "/projects/{project_id}/invitations",
    status_code=status.HTTP_201_CREATED,
    summary="Invite by email (multi mode): an existing user is added, otherwise a "
    "single-use registration token is returned once",
)
def invite(
    project_id: str,
    payload: InvitationCreate,
    state: StateDep,
    access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> Invitation:
    return state.auth.invite(access.principal, project_id, payload)


@router.delete(
    "/projects/{project_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a pending invitation: its registration link stops working",
)
def revoke_invitation(
    project_id: str,
    invitation_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> None:
    state.auth.revoke_invitation(access.principal, project_id, invitation_id)


@router.get("/projects/{project_id}/invitations")
def list_invitations(
    project_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.PROJECT_MANAGE)],
) -> list[Invitation]:
    return state.catalog.list_invitations(project_id)


@router.get("/projects/{project_id}/audit", summary="Who did what, when, on which object")
def project_audit(
    project_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.AUDIT_READ)],
    filters: Annotated[AuditQuery, Query()],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditPage:
    return _audit_page(state, project_id, filters, limit, offset)


@router.get("/audit", summary="Audit log of the instance (instance administrator)")
def instance_audit(
    _admin: AdminDep,
    state: StateDep,
    filters: Annotated[AuditQuery, Query()],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditPage:
    return _audit_page(state, None, filters, limit, offset)


def _audit_page(
    state: StateDep, project_id: str | None, filters: AuditQuery, limit: int, offset: int
) -> AuditPage:
    return AuditPage(
        items=state.catalog.list_audit(project_id, limit=limit, offset=offset, query=filters),
        total=state.catalog.count_audit(project_id, filters),
        offset=offset,
        limit=limit,
        facets=state.catalog.audit_facets(project_id),
    )
