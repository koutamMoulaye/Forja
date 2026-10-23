"""Authenticated test clients: the bootstrap administrator, and invited users."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi.testclient import TestClient
from pydantic import SecretStr

from forja_api.main import create_app
from forja_core.config import Settings

ADMIN_EMAIL = "admin@forja.local"
BOOTSTRAP_PASSWORD = "Bootstrap-Pass-2026"
ADMIN_PASSWORD = "Admin-Passw0rd-2026"
USER_PASSWORD = "User-Passw0rd-2026"


def with_bootstrap(settings: Settings) -> Settings:
    """A known first password instead of a random one written to the logs."""
    if settings.auth_bootstrap_password is not None:
        return settings
    return settings.model_copy(update={"auth_bootstrap_password": SecretStr(BOOTSTRAP_PASSWORD)})


def bearer(client: TestClient, token: str) -> TestClient:
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def login(client: TestClient, email: str, password: str) -> dict[str, Any]:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    tokens: dict[str, Any] = response.json()
    return tokens


def login_admin(client: TestClient) -> TestClient:
    """Log in as the instance administrator, changing the initial password if needed."""
    response = client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": BOOTSTRAP_PASSWORD}
    )
    if response.status_code == 401:  # changed by an earlier client on the same catalog
        tokens = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    else:
        assert response.status_code == 200, response.text
        tokens = response.json()
        assert tokens["must_change_password"] is True
        changed = client.post(
            "/auth/password",
            json={"current_password": BOOTSTRAP_PASSWORD, "new_password": ADMIN_PASSWORD},
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert changed.status_code == 200, changed.text
        tokens = changed.json()
    return bearer(client, tokens["access_token"])


@contextmanager
def api_client(settings: Settings) -> Iterator[TestClient]:
    """A started application and a client logged in as the administrator."""
    with TestClient(create_app(with_bootstrap(settings))) as client:
        yield login_admin(client)


def invite(admin: TestClient, project_id: str, email: str, role: str) -> str | None:
    response = admin.post(
        f"/projects/{project_id}/invitations", json={"email": email, "role": role}
    )
    assert response.status_code == 201, response.text
    token: str | None = response.json()["token"]
    return token


@contextmanager
def user_client(
    app_client: TestClient, project_id: str, email: str, role: str
) -> Iterator[TestClient]:
    """Another client of the same application, for a user invited with ``role``."""
    token = invite(app_client, project_id, email, role)
    other = TestClient(app_client.app)
    if token is not None:
        registered = other.post("/auth/register", json={"token": token, "password": USER_PASSWORD})
        assert registered.status_code == 201, registered.text
        access = registered.json()["access_token"]
    else:
        access = login(other, email, USER_PASSWORD)["access_token"]
    yield bearer(other, access)
