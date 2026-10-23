"""Authentication and permission dependencies of the routes.

Every route but ``/health`` and the login endpoints declares the :class:`Action` it
performs with :func:`require`. The project is resolved from the path (a project,
source, relation, table, run, mart request or synonym proposal id), then the role
of the caller in that project is checked against the permission matrix.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request

from forja_api.state import AppState, StateDep
from forja_core.auth.models import ROLE_ACTIONS, Action, Principal, Role
from forja_core.catalog import Catalog
from forja_core.errors import ForbiddenError, PasswordChangeRequiredError, UnauthorizedError


def _credential(request: Request) -> str | None:
    api_key = request.headers.get("x-api-key")
    if api_key:
        return api_key.strip()
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return None


def get_principal(request: Request, state: StateDep) -> Principal:
    """The caller, even if their password must still be changed."""
    credential = _credential(request)
    if credential is None:
        raise UnauthorizedError(
            "authentication required: send 'Authorization: Bearer <token>' or 'X-API-Key'"
        )
    principal = state.auth.authenticate(credential)
    request.state.principal = principal
    return principal


def get_active_principal(
    principal: Annotated[Principal, Depends(get_principal)],
) -> Principal:
    if principal.user.must_change_password:
        raise PasswordChangeRequiredError("change the initial password first (POST /auth/password)")
    return principal


AnyPrincipalDep = Annotated[Principal, Depends(get_principal)]
PrincipalDep = Annotated[Principal, Depends(get_active_principal)]


def _resolvers(catalog: Catalog) -> dict[str, Callable[[str], str]]:
    return {
        "project_id": lambda v: catalog.get_project(v).id,
        "source_id": lambda v: catalog.get_source(v).project_id,
        "relation_id": lambda v: catalog.get_relation(v).project_id,
        "table_id": lambda v: catalog.get_table(v).project_id,
        "run_id": lambda v: catalog.get_job(v).project_id,
        "proposal_id": lambda v: catalog.get_synonym_proposal(v).project_id,
    }


def resolve_project(path_params: dict[str, Any], catalog: Catalog) -> str:
    for name, resolver in _resolvers(catalog).items():
        if name in path_params:
            return resolver(str(path_params[name]))
    raise ForbiddenError("this route is not bound to a project")


def roles_allowed(action: Action) -> list[str]:
    return [role.value for role in Role if action in ROLE_ACTIONS[role]]


@dataclass(frozen=True)
class Access:
    """A caller authorized for one action on one project."""

    principal: Principal
    project_id: str
    role: Role
    state: AppState

    def can(self, action: Action) -> bool:
        return action in ROLE_ACTIONS[self.role]

    def require(self, action: Action) -> None:
        if not self.can(action):
            raise ForbiddenError(
                f"'{action.value}' requires the role {' or '.join(roles_allowed(action))} "
                f"(you are {self.role.value})",
                details={"action": action.value, "role": self.role.value},
            )

    @property
    def unmasked(self) -> bool:
        """Data as the plans treat it; otherwise every personal column is pseudonymized."""
        return self.can(Action.DATA_UNMASKED)

    def audit(
        self,
        action: str,
        *,
        object_type: str | None = None,
        object_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.state.auth.audit(
            self.principal,
            action,
            project_id=self.project_id,
            object_type=object_type,
            object_id=object_id,
            details=details,
        )


def require(action: Action) -> Any:
    """Dependency: the caller must be allowed ``action`` on the project of the path."""

    def dependency(request: Request, state: StateDep, principal: PrincipalDep) -> Access:
        project_id = resolve_project(dict(request.path_params), state.catalog)
        role = principal.role(project_id)
        if role is None:
            raise ForbiddenError(
                "you are not a member of this project", details={"project_id": project_id}
            )
        access = Access(principal, project_id, role, state)
        access.require(action)
        return access

    return Depends(dependency)


def require_instance_admin(principal: PrincipalDep) -> Principal:
    if not principal.user.is_admin:
        raise ForbiddenError("reserved to the instance administrator")
    return principal


AdminDep = Annotated[Principal, Depends(require_instance_admin)]
