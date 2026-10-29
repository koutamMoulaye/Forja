"""Authentication: bootstrap administrator, tokens, API keys, invitations and audit."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from forja_api.main import create_app
from forja_core.config import Settings
from tests.auth import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    BOOTSTRAP_PASSWORD,
    USER_PASSWORD,
    api_client,
    bearer,
    login,
    user_client,
    with_bootstrap,
)


@pytest.fixture
def multi(settings: Settings) -> Iterator[TestClient]:
    with api_client(settings.model_copy(update={"auth_mode": "multi"})) as client:
        yield client


def _project(client: TestClient, name: str = "Ventes") -> str:
    response = client.post("/projects", json={"name": name})
    assert response.status_code == 201, response.text
    project_id: str = response.json()["id"]
    return project_id


def test_routes_require_authentication(settings: Settings) -> None:
    with TestClient(create_app(with_bootstrap(settings))) as client:
        assert client.get("/health").status_code == 200  # public
        response = client.get("/projects")
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.json()["error"]["code"] == "unauthorized"
        assert client.get("/projects", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get("/sources/x/profile").status_code == 401


def test_bootstrap_admin_must_change_password(settings: Settings) -> None:
    with TestClient(create_app(with_bootstrap(settings))) as client:
        tokens = login(client, ADMIN_EMAIL, BOOTSTRAP_PASSWORD)
        assert tokens["must_change_password"] is True
        bearer(client, tokens["access_token"])
        blocked = client.get("/projects")
        assert blocked.status_code == 403
        assert blocked.json()["error"]["code"] == "password_change_required"
        assert client.get("/auth/me").json()["user"]["must_change_password"] is True

        weak = client.post(
            "/auth/password",
            json={"current_password": BOOTSTRAP_PASSWORD, "new_password": "short"},
        )
        assert weak.status_code == 422 and "trop faible" in weak.json()["error"]["message"]
        changed = client.post(
            "/auth/password",
            json={"current_password": BOOTSTRAP_PASSWORD, "new_password": ADMIN_PASSWORD},
        )
        assert changed.status_code == 200
        # The session of the initial password is revoked; the new pair works.
        assert client.get("/projects").status_code == 401
        bearer(client, changed.json()["access_token"])
        assert client.get("/projects").status_code == 200
        assert (
            client.post(
                "/auth/login", json={"email": ADMIN_EMAIL, "password": BOOTSTRAP_PASSWORD}
            ).status_code
            == 401
        )


def test_random_bootstrap_password_is_logged_once(
    settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    logged = settings.model_copy(update={"log_level": "WARNING", "log_format": "json"})
    with TestClient(create_app(logged)):
        pass
    first = capsys.readouterr().err
    assert "bootstrap_admin_created" in first and '"password"' in first
    with TestClient(create_app(logged)):
        pass
    assert "bootstrap_admin_created" not in capsys.readouterr().err


def test_refresh_rotation_and_reuse_detection(client: TestClient) -> None:
    tokens = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    first = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    rotated = first.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]

    # Replaying the used refresh token revokes the whole session.
    replay = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401
    assert (
        client.post("/auth/refresh", json={"refresh_token": rotated["refresh_token"]}).status_code
        == 401
    )
    response = client.get(
        "/projects", headers={"Authorization": f"Bearer {rotated['access_token']}"}
    )
    assert response.status_code == 401


def test_logout_revokes_the_session(client: TestClient) -> None:
    tokens = login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/projects", headers=headers).status_code == 401
    assert (
        client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )


def test_expired_access_token(settings: Settings) -> None:
    import jwt

    with api_client(settings) as client:
        state = client.app.state.forja  # type: ignore[attr-defined]
        token = client.headers["Authorization"].removeprefix("Bearer ")
        claims = jwt.decode(token, options={"verify_signature": False})
        claims["exp"] = claims["iat"] - 1
        expired = jwt.encode(claims, state.auth._key, algorithm="HS256")
        response = client.get("/projects", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401 and "expired" in response.json()["error"]["message"]


def test_api_keys(client: TestClient) -> None:
    created = client.post("/auth/api-keys", json={"name": "Power BI"})
    assert created.status_code == 201
    key = created.json()
    assert key["key"].startswith(f"fja_{key['prefix']}_")
    listed = client.get("/auth/api-keys").json()
    assert [k["prefix"] for k in listed] == [key["prefix"]]
    assert "key" not in listed[0]

    other = TestClient(client.app)
    assert other.get("/projects", headers={"X-API-Key": key["key"]}).status_code == 200
    assert (
        other.get("/projects", headers={"Authorization": f"Bearer {key['key']}"}).status_code == 200
    )
    tampered = key["key"][:-2] + "zz"
    assert other.get("/projects", headers={"X-API-Key": tampered}).status_code == 401

    assert client.delete(f"/auth/api-keys/{key['id']}").json()["revoked_at"] is not None
    assert other.get("/projects", headers={"X-API-Key": key["key"]}).status_code == 401
    state = client.app.state.forja  # type: ignore[attr-defined]
    stored = state.catalog._fetchall("SELECT key_hash FROM api_keys")
    assert all(key["key"] not in str(row) for row in stored)  # only a digest is stored


def test_invitations_need_multi_mode(client: TestClient) -> None:
    project_id = _project(client)
    response = client.post(
        f"/projects/{project_id}/invitations", json={"email": "a@exemple.fr", "role": "analyst"}
    )
    assert response.status_code == 403
    assert "FORJA_AUTH_MODE=multi" in response.json()["error"]["message"]


def test_invitation_registration_and_roles(multi: TestClient) -> None:
    project_id = _project(multi)
    other_project = _project(multi, "Finance")
    with user_client(multi, project_id, "Lea.Analyste@Exemple.fr", "analyst") as analyst:
        me = analyst.get("/auth/me").json()
        assert me["user"]["email"] == "lea.analyste@exemple.fr"
        assert me["roles"] == {project_id: "analyst"}
        assert [p["id"] for p in analyst.get("/projects").json()] == [project_id]
        assert analyst.post("/projects", json={"name": "X"}).status_code == 403
        assert analyst.get(f"/projects/{other_project}/tables").status_code == 403
        assert analyst.get(f"/projects/{project_id}/sources").status_code == 403
        assert analyst.get(f"/projects/{project_id}/members").status_code == 403

        # Inviting an existing user adds them at once, without a token.
        assert (
            multi.post(
                f"/projects/{other_project}/invitations",
                json={"email": "lea.analyste@exemple.fr", "role": "engineer"},
            ).json()["token"]
            is None
        )
        assert analyst.get(f"/projects/{other_project}/sources").status_code == 200

    members = multi.get(f"/projects/{project_id}/members").json()
    assert {(m["email"], m["role"]) for m in members} == {
        (ADMIN_EMAIL, "admin"),
        ("lea.analyste@exemple.fr", "analyst"),
    }
    user_id = next(m["user_id"] for m in members if m["role"] == "analyst")
    assert (
        multi.put(f"/projects/{project_id}/members/{user_id}", json={"role": "engineer"}).json()[
            "role"
        ]
        == "engineer"
    )
    assert multi.delete(f"/projects/{project_id}/members/{user_id}").status_code == 204


def test_invitation_tokens_are_single_use(multi: TestClient) -> None:
    project_id = _project(multi)
    token = multi.post(
        f"/projects/{project_id}/invitations", json={"email": "b@exemple.fr", "role": "analyst"}
    ).json()["token"]
    fresh = TestClient(multi.app)
    weak = fresh.post("/auth/register", json={"token": token, "password": "123"})
    assert weak.status_code == 422
    assert (
        fresh.post("/auth/register", json={"token": token, "password": USER_PASSWORD}).status_code
        == 201
    )
    assert (
        fresh.post("/auth/register", json={"token": token, "password": USER_PASSWORD}).status_code
        == 401
    )
    assert (
        fresh.post(
            "/auth/register", json={"token": "forged", "password": USER_PASSWORD}
        ).status_code
        == 401
    )


def test_revoked_invitation_cannot_register(multi: TestClient) -> None:
    project_id = _project(multi)
    invitation = multi.post(
        f"/projects/{project_id}/invitations", json={"email": "c@exemple.fr", "role": "analyst"}
    ).json()
    revoked = multi.delete(f"/projects/{project_id}/invitations/{invitation['id']}")
    assert revoked.status_code == 204
    assert multi.get(f"/projects/{project_id}/invitations").json() == []
    assert multi.delete(f"/projects/{project_id}/invitations/{invitation['id']}").status_code == 404
    fresh = TestClient(multi.app)
    registered = fresh.post(
        "/auth/register", json={"token": invitation["token"], "password": USER_PASSWORD}
    )
    assert registered.status_code == 401
    actions = [e["action"] for e in multi.get(f"/projects/{project_id}/audit").json()["items"]]
    assert "member.invitation_revoke" in actions


def test_audit_log(multi: TestClient) -> None:
    project_id = _project(multi)
    multi.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    with user_client(multi, project_id, "c@exemple.fr", "analyst") as analyst:
        assert analyst.get(f"/projects/{project_id}/audit").status_code == 403
    entries = multi.get(f"/projects/{project_id}/audit").json()["items"]
    actions = {e["action"] for e in entries}
    assert {"project.create", "member.invite", "member.register"} <= actions
    invite = next(e for e in entries if e["action"] == "member.invite")
    assert invite["user_email"] == ADMIN_EMAIL and invite["details"]["role"] == "analyst"
    instance = {e["action"] for e in multi.get("/audit").json()["items"]}
    assert {"auth.login", "auth.login_failed", "user.bootstrap"} <= instance


def test_invitation_link_says_what_it_leads_to(multi: TestClient) -> None:
    project_id = _project(multi, "Démo")
    invite = multi.post(
        f"/projects/{project_id}/invitations", json={"email": "d@exemple.fr", "role": "analyst"}
    ).json()
    fresh = TestClient(multi.app)
    lookup = fresh.post("/auth/invitations/lookup", json={"token": invite["token"]}).json()
    assert lookup["status"] == "valid" and lookup["email"] == "d@exemple.fr"
    assert lookup["role"] == "analyst" and lookup["project_name"] == "Démo"

    registered = fresh.post(
        "/auth/register",
        json={"token": invite["token"], "password": USER_PASSWORD, "name": "  Claire Martin "},
    )
    assert registered.status_code == 201, registered.text
    me = bearer(fresh, registered.json()["access_token"]).get("/auth/me").json()
    assert me["user"]["name"] == "Claire Martin" and me["roles"] == {project_id: "analyst"}
    used = fresh.post("/auth/invitations/lookup", json={"token": invite["token"]}).json()
    assert used["status"] == "used" and used["email"] is None

    revoked = multi.post(
        f"/projects/{project_id}/invitations", json={"email": "e@exemple.fr", "role": "analyst"}
    ).json()
    multi.delete(f"/projects/{project_id}/invitations/{revoked['id']}")
    status = TestClient(multi.app).post(
        "/auth/invitations/lookup", json={"token": revoked["token"]}
    )
    assert status.json()["status"] == "revoked"
    refused = TestClient(multi.app).post(
        "/auth/register", json={"token": revoked["token"], "password": USER_PASSWORD}
    )
    assert refused.status_code == 401 and "revoked" in refused.json()["error"]["message"]

    expired = multi.post(
        f"/projects/{project_id}/invitations", json={"email": "f@exemple.fr", "role": "engineer"}
    ).json()
    catalog = multi.app.state.forja.catalog
    catalog._execute(
        "UPDATE invitations SET expires_at = TIMESTAMP '2020-01-01' WHERE id = ?", [expired["id"]]
    )
    status = TestClient(multi.app).post(
        "/auth/invitations/lookup", json={"token": expired["token"]}
    )
    assert status.json()["status"] == "expired" and status.json()["project_name"] == "Démo"
    unknown = TestClient(multi.app).post("/auth/invitations/lookup", json={"token": "forged"})
    assert unknown.json() == {
        "status": "unknown", "email": None, "role": None, "project_name": None, "expires_at": None,
    }  # fmt: skip
