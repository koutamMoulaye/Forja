"""What the front needs: CORS, an up-to-date French OpenAPI document with examples, and
an idempotent demonstration project."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_api.demo import ANALYST_EMAIL, ENGINEER_EMAIL, MART_QUESTIONS, build_demo, demo_settings
from forja_api.main import create_app
from forja_api.openapi import ROUTE_DOCS, document, load_examples
from forja_api.state import AppState
from forja_core.agent.models import MartStatus
from forja_core.config import Settings
from tests.auth import login

DOCS = Path(__file__).parents[1] / "docs" / "openapi.json"
# Files, or operations whose answer has no body.
NO_JSON_EXAMPLE = {"GET /tables/{table_id}/export", "POST /auth/logout", "GET /events",
                   "DELETE /projects/{project_id}/members/{user_id}",
                   "DELETE /projects/{project_id}/invitations/{invitation_id}",
                   "DELETE /connections/{connection_id}",
                   "DELETE /connections/{connection_id}/schedule",
                   "DELETE /sources/{source_id}/schedule"}  # fmt: skip


@pytest.fixture(scope="module")
def schema() -> dict[str, object]:
    return create_app(Settings(_env_file=None)).openapi()  # type: ignore[call-arg]


def test_cors_for_a_local_front(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        preflight = client.options(
            "/projects",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"
        other = client.options(
            "/projects",
            headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
        )
        assert "access-control-allow-origin" not in other.headers
    custom = settings.model_copy(update={"cors_origins": ["https://forja.example"]})
    with TestClient(create_app(custom)) as client:
        response = client.get("/health", headers={"Origin": "https://forja.example"})
        assert response.headers["access-control-allow-origin"] == "https://forja.example"


def test_openapi_document_is_up_to_date() -> None:
    expected = document(create_app(Settings(_env_file=None)))  # type: ignore[call-arg]
    assert DOCS.read_text(encoding="utf-8") == expected, "run `uv run forja openapi`"


def test_every_operation_is_documented_in_french(schema: dict[str, object]) -> None:
    paths = schema["paths"]
    assert isinstance(paths, dict)
    operations = {(m, p) for p, ops in paths.items() for m in ops}
    assert operations == set(ROUTE_DOCS), operations ^ set(ROUTE_DOCS)
    examples = load_examples()
    for path, ops in paths.items():
        for method, operation in ops.items():
            name = f"{method.upper()} {path}"
            assert operation["summary"] and operation["description"], name
            assert re.search(r"[a-zà-ÿ]", operation["summary"]), name
            assert operation["summary"].split()[0] not in {"List", "Get", "Create"}, name
            if name in NO_JSON_EXAMPLE:
                continue
            assert name in examples, f"no recorded example for {name}"
            content = next(
                (r["content"] for r in operation["responses"].values() if "content" in r), {}
            )
            assert any("example" in media for media in content.values()), name


def test_examples_hold_no_secret() -> None:
    text = str(load_examples())
    assert "eyJhbGciOiJIUzI1NiIs…" in text or "access_token" not in text
    assert not re.search(r"fja_[0-9a-f]{8}_[A-Za-z0-9-]{20,}", text)
    assert not re.search(r"frt_[A-Za-z0-9_-]{20,}", text)
    assert "jean.dupont@exemple.fr" not in text


def test_demo_is_idempotent(settings: Settings) -> None:
    state = AppState.build(demo_settings(settings))
    try:
        state.auth.bootstrap()
        first = build_demo(state)
        assert set(first.created_accounts) == {ENGINEER_EMAIL, ANALYST_EMAIL}
        assert len(first.marts) == len(MART_QUESTIONS) == 2
        requests = state.catalog.list_mart_requests(first.project.id)
        assert all(r.status is MartStatus.PUBLISHED for r in requests)
        layer = state.catalog.get_semantic_layer(first.project.id)

        second = build_demo(state)
        assert second.project.id == first.project.id
        assert second.created_accounts == {} and second.steps == []
        assert second.marts == first.marts
        assert len(state.catalog.list_mart_requests(first.project.id)) == 2
        assert state.catalog.get_semantic_layer(first.project.id).version == layer.version
        assert len([p for p in state.catalog.list_projects() if p.name == first.project.name]) == 1
        passwords = dict(first.created_accounts)
    finally:
        state.close()

    with TestClient(create_app(settings)) as client:
        analyst = login(client, ANALYST_EMAIL, passwords[ANALYST_EMAIL])
        assert analyst["must_change_password"] is False
        client.headers["Authorization"] = f"Bearer {analyst['access_token']}"
        tables = client.get(f"/projects/{first.project.id}/tables").json()
        assert {t["name"] for t in tables if t["layer"] == "mart"} == set(first.marts)
