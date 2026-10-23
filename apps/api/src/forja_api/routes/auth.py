"""Authentication endpoints: login, token refresh, logout, password, API keys, registration."""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel

from forja_api.security import AdminDep, AnyPrincipalDep, PrincipalDep
from forja_api.state import StateDep
from forja_core.auth.models import (
    ApiKey,
    ApiKeyCreate,
    CreatedApiKey,
    LoginRequest,
    PasswordChange,
    RefreshRequest,
    Registration,
    Role,
    TokenPair,
    User,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class Me(BaseModel):
    user: User
    via: str
    roles: dict[str, Role]
    auth_mode: str


@router.post("/login", summary="Email and password: an access token and a refresh token")
def login(payload: LoginRequest, state: StateDep) -> TokenPair:
    return state.auth.login(payload.email, payload.password)


@router.post("/refresh", summary="Exchange a refresh token (single use) for a new pair")
def refresh(payload: RefreshRequest, state: StateDep) -> TokenPair:
    return state.auth.refresh(payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke the session")
def logout(principal: AnyPrincipalDep, state: StateDep) -> None:
    state.auth.logout(principal)


@router.post(
    "/password",
    summary="Change the password; required after the first login. Returns a new pair",
)
def change_password(
    payload: PasswordChange, principal: AnyPrincipalDep, state: StateDep
) -> TokenPair:
    return state.auth.change_password(principal, payload.current_password, payload.new_password)


@router.get("/me", summary="The authenticated user and their role in each project")
def me(principal: AnyPrincipalDep, state: StateDep) -> Me:
    return Me(
        user=principal.user,
        via=principal.via,
        roles=principal.roles,
        auth_mode=state.settings.auth_mode,
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Create an account from an invitation token (FORJA_AUTH_MODE=multi)",
)
def register(payload: Registration, state: StateDep) -> TokenPair:
    return state.auth.register(payload.token, payload.password)


@router.get("/api-keys", summary="Personal API keys (prefixes only)")
def list_api_keys(principal: PrincipalDep, state: StateDep) -> list[ApiKey]:
    return state.catalog.list_api_keys(principal.id)


@router.post(
    "/api-keys",
    status_code=status.HTTP_201_CREATED,
    summary="Create a personal API key; the key is shown once",
)
def create_api_key(
    payload: ApiKeyCreate, principal: PrincipalDep, state: StateDep
) -> CreatedApiKey:
    return state.auth.create_api_key(principal, payload.name)


@router.delete("/api-keys/{key_id}", summary="Revoke a personal API key")
def revoke_api_key(key_id: str, principal: PrincipalDep, state: StateDep) -> ApiKey:
    return state.auth.revoke_api_key(principal, key_id)


@router.get("/users", summary="All users (instance administrator)")
def list_users(_admin: AdminDep, state: StateDep) -> list[User]:
    return state.catalog.list_users()
