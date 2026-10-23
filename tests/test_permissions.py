"""Permission matrix: every route, every role.

The shop is built with the email of clients left in clear by its Silver plan
(treatment ``none``): an engineer then sees it, an analyst never does.
"""

from __future__ import annotations

import io
import re
from collections.abc import Iterator
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.auth.models import ACTION_DESCRIPTIONS, ROLE_ACTIONS, Action, Role
from forja_core.jobs.models import JobType, RunRequest
from forja_core.models import ProjectCreate
from forja_core.silver.plan import ColumnPatch, PiiTreatment, PlanPatch
from tests.auth import api_client, user_client
from tests.fixtures import ecommerce as ec
from tests.shop import SOURCES, run, shop_settings

ROLES = ("analyst", "engineer", "admin")
DOCS = Path(__file__).parents[1] / "docs" / "security.md"


@dataclass
class World:
    clients: dict[str, TestClient]
    ids: dict[str, str]


@pytest.fixture(scope="module")
def world(tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path) -> Iterator[World]:
    settings = shop_settings(
        tmp_path_factory.mktemp("permissions"),
        auth_mode="multi",
        allow_bronze_preview=True,
    )
    state = AppState.build(settings)
    project = state.catalog.create_project(ProjectCreate(name="Boutique"))
    sources = {}
    for name in SOURCES:
        [source] = state.ingestion.ingest_file(project.id, ecommerce_dir / name, name)
        sources[name] = source
    clients_source = sources[ec.CLIENTS]
    state.plans.patch(
        clients_source.id,
        PlanPatch(columns={"email": ColumnPatch(pii_treatment=PiiTreatment.NONE)}),
    )
    state.plans.approve(clients_source.id)
    run(state, project, RunRequest(type=JobType.BUILD_SILVER))
    for relation in state.catalog.list_relations(project.id):
        state.relations.confirm(relation.id)
    state.gold.propose(project.id, use_llm=False)
    state.gold.approve(project.id)
    run(state, project, RunRequest(type=JobType.BUILD_GOLD))
    tables = {t.name: t.id for t in state.catalog.list_tables(project.id)}
    relation_id = state.catalog.list_relations(project.id)[0].id
    state.close()

    with ExitStack() as stack:
        admin = stack.enter_context(api_client(settings))
        engineer = stack.enter_context(
            user_client(admin, project.id, "ingenieur@exemple.fr", "engineer")
        )
        analyst = stack.enter_context(
            user_client(admin, project.id, "analyste@exemple.fr", "analyst")
        )
        victim = stack.enter_context(user_client(admin, project.id, "membre@exemple.fr", "analyst"))
        victim_id = victim.get("/auth/me").json()["user"]["id"]
        asked = analyst.post(
            f"/projects/{project.id}/mart-requests", json={"question": "CA par mois"}
        ).json()
        run_id = admin.get(f"/projects/{project.id}/runs").json()[-1]["id"]
        ids = {
            "project_id": project.id,
            "source_id": clients_source.id,
            "relation_id": relation_id,
            "silver_table": tables["stg_clients"],
            "gold_table": tables["dim_clients"],
            "fact_table": tables["fct_ventes"],
            "run_id": run_id,
            "mart_id": asked["mart_request"]["id"],
            "agent_run": asked["run"]["id"],
            "victim_id": victim_id,
        }
        for _ in range(3):
            proposal = analyst.post(
                f"/projects/{project.id}/semantic-layer/synonym-proposals",
                json={"target": "attribute:client.ville", "synonym": "cité"},
            ).json()
            ids.setdefault("proposal_id", proposal["id"])
        yield World({"analyst": analyst, "engineer": engineer, "admin": admin}, ids)


def admin_id(client: TestClient) -> str:
    user_id: str = client.get("/auth/me").json()["user"]["id"]
    return user_id


# (method, path, body, roles allowed). Bodies that would fail validation are fine for
# allowed roles as long as the answer is not 401/403.
MATRIX: list[tuple[str, str, Any, set[str]]] = [
    ("GET", "/projects", None, set(ROLES)),
    ("POST", "/projects", {"name": "Autre"}, {"admin"}),
    ("GET", "/projects/{project_id}/members", None, {"admin"}),
    ("PUT", "/projects/{project_id}/members/{victim_id}", {"role": "analyst"}, {"admin"}),
    ("DELETE", "/projects/{project_id}/members/{victim_id}", None, {"admin"}),
    (
        "POST",
        "/projects/{project_id}/invitations",
        {"email": "x@exemple.fr", "role": "analyst"},
        {"admin"},
    ),
    ("GET", "/projects/{project_id}/invitations", None, {"admin"}),
    ("GET", "/projects/{project_id}/audit", None, {"admin"}),
    ("GET", "/audit", None, {"admin"}),
    ("GET", "/auth/users", None, {"admin"}),
    ("POST", "/projects/{project_id}/sources", "upload", {"engineer", "admin"}),
    ("GET", "/projects/{project_id}/sources", None, {"engineer", "admin"}),
    ("GET", "/sources/{source_id}", None, {"engineer", "admin"}),
    ("POST", "/sources/{source_id}/versions", "upload", {"engineer", "admin"}),
    ("GET", "/sources/{source_id}/versions", None, {"engineer", "admin"}),
    ("GET", "/sources/{source_id}/profile", None, {"engineer", "admin"}),
    ("GET", "/sources/{source_id}/preview", None, {"admin"}),
    ("GET", "/sources/{source_id}/plan", None, {"engineer", "admin"}),
    ("GET", "/sources/{source_id}/plans", None, {"engineer", "admin"}),
    ("PATCH", "/sources/{source_id}/plan", {"columns": {}}, {"engineer", "admin"}),
    ("POST", "/sources/{source_id}/plan/approve", None, {"engineer", "admin"}),
    ("GET", "/projects/{project_id}/relations", None, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/relations/detect", None, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/relations", {"from_source": "x"}, {"engineer", "admin"}),
    ("GET", "/relations/{relation_id}", None, {"engineer", "admin"}),
    ("POST", "/relations/{relation_id}/confirm", None, {"engineer", "admin"}),
    ("POST", "/relations/{relation_id}/reject", None, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/gold-plan/propose", {"use_llm": False}, {"engineer", "admin"}),
    ("GET", "/projects/{project_id}/gold-plan", None, {"engineer", "admin"}),
    ("GET", "/projects/{project_id}/gold-plans", None, {"engineer", "admin"}),
    ("PATCH", "/projects/{project_id}/gold-plan", {"unknown": 1}, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/gold-plan/approve", None, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/runs", {"type": "profile"}, {"engineer", "admin"}),
    ("GET", "/projects/{project_id}/runs", None, set(ROLES)),
    ("GET", "/runs/{run_id}", None, {"engineer", "admin"}),
    ("GET", "/runs/{run_id}/logs", None, {"engineer", "admin"}),
    ("POST", "/runs/{run_id}/cancel", None, {"engineer", "admin"}),
    ("GET", "/runs/{agent_run}", None, set(ROLES)),  # the analyst's own run
    ("GET", "/projects/{project_id}/tables", None, set(ROLES)),
    ("GET", "/tables/{silver_table}", None, {"engineer", "admin"}),
    ("GET", "/tables/{gold_table}", None, set(ROLES)),
    ("PATCH", "/tables/{fact_table}", {"publish": True}, {"engineer", "admin"}),
    ("GET", "/tables/{silver_table}/preview", None, {"engineer", "admin"}),
    ("GET", "/tables/{gold_table}/preview", None, set(ROLES)),
    ("GET", "/tables/{silver_table}/export", None, {"engineer", "admin"}),
    ("GET", "/tables/{gold_table}/export", None, set(ROLES)),
    ("GET", "/projects/{project_id}/semantic-layer", None, set(ROLES)),
    ("GET", "/projects/{project_id}/semantic-layer/versions", None, set(ROLES)),
    ("POST", "/projects/{project_id}/semantic-layer/regenerate", None, {"engineer", "admin"}),
    (
        "PATCH",
        "/projects/{project_id}/semantic-layer",
        {"overrides": [{"target": "metric:montant", "add_synonyms": ["recette"]}]},
        {"engineer", "admin"},
    ),
    (
        "POST",
        "/projects/{project_id}/semantic-layer/synonym-proposals",
        {"target": "metric:montant", "synonym": "recettes"},
        set(ROLES),
    ),
    ("GET", "/projects/{project_id}/semantic-layer/synonym-proposals", None, set(ROLES)),
    ("POST", "/synonym-proposals/{proposal_id}/accept", None, {"engineer", "admin"}),
    ("POST", "/synonym-proposals/{proposal_id}/reject", None, {"engineer", "admin"}),
    ("POST", "/projects/{project_id}/mart-requests", {"question": "CA par ville"}, set(ROLES)),
    ("GET", "/projects/{project_id}/mart-requests", None, set(ROLES)),
    ("GET", "/mart-requests/{mart_id}", None, set(ROLES)),
    ("POST", "/mart-requests/{mart_id}/approve", None, {"engineer", "admin"}),
]

# Routes acting on the caller's own request: allowed to its author only (analyst here).
OWN_ROUTES = {
    ("POST", "/mart-requests/{mart_id}/answer"),
    ("POST", "/mart-requests/{mart_id}/refine"),
    ("POST", "/mart-requests/{mart_id}/validate"),
    ("POST", "/mart-requests/{mart_id}/reject"),
}
PUBLIC = {("GET", "/health"), ("POST", "/auth/login"), ("POST", "/auth/refresh"),
          ("POST", "/auth/register")}  # fmt: skip
ACCOUNT = {
    ("POST", "/auth/logout"), ("POST", "/auth/password"), ("GET", "/auth/me"),
    ("GET", "/auth/api-keys"), ("POST", "/auth/api-keys"), ("DELETE", "/auth/api-keys/{key_id}"),
}  # fmt: skip


def _call(client: TestClient, method: str, path: str, body: Any) -> int:
    if body == "upload":
        files = {"file": ("autre.csv", b"code;valeur\nA;1\nB;2\n")}
        return client.request(method, path, files=files).status_code
    return client.request(method, path, json=body).status_code


@pytest.mark.parametrize(
    ("method", "template", "body", "allowed"), MATRIX, ids=lambda v: str(v)[:60]
)
def test_matrix(world: World, method: str, template: str, body: Any, allowed: set[str]) -> None:
    path = template.format(**world.ids)
    for role in ROLES:  # analyst first: forbidden calls never change anything
        status = _call(world.clients[role], method, path, body)
        if role in allowed:
            assert status not in (401, 403), f"{role} {method} {path} -> {status}"
        else:
            assert status == 403, f"{role} {method} {path} -> {status}"


def test_every_route_is_in_the_matrix(world: World) -> None:
    app = world.clients["admin"].app
    routes = {
        (method, route.path)
        for route in app.routes  # type: ignore[attr-defined]
        if isinstance(route, APIRoute)
        for method in route.methods
    }
    covered = {
        (m, re.sub(r"\{(silver|gold|fact)_table\}", "{table_id}", p)) for m, p, _, _ in MATRIX
    }
    covered = {
        (m, p.replace("{victim_id}", "{user_id}").replace("{agent_run}", "{run_id}"))
        for m, p in covered
    }
    missing = routes - covered - OWN_ROUTES - PUBLIC - ACCOUNT
    assert missing == set()


def test_unauthenticated_requests_are_refused(world: World) -> None:
    anonymous = TestClient(world.clients["admin"].app)
    for method, template, body, _ in MATRIX:
        path = template.format(**world.ids)
        assert _call(anonymous, method, path, body) == 401, path


def test_own_routes_belong_to_the_author(world: World) -> None:
    analyst, engineer = world.clients["analyst"], world.clients["engineer"]
    mart = world.ids["mart_id"]
    assert (
        engineer.post(
            f"/mart-requests/{mart}/refine", json={"instruction": "par ville"}
        ).status_code
        == 403
    )
    assert engineer.post(f"/mart-requests/{mart}/validate").status_code == 403
    refined = analyst.post(f"/mart-requests/{mart}/refine", json={"instruction": "par ville"})
    assert refined.status_code == 202


def test_analyst_never_sees_personal_data_in_clear(world: World) -> None:
    analyst, engineer = world.clients["analyst"], world.clients["engineer"]
    gold = world.ids["gold_table"]
    clear = "jean.dupont@exemple.fr"
    # The plan leaves the email in clear: the engineer sees it...
    assert clear in str(engineer.get(f"/tables/{gold}/preview").json())
    # ...the analyst gets pseudonyms everywhere.
    preview = analyst.get(f"/tables/{gold}/preview").json()
    assert clear not in str(preview)
    assert all(
        re.fullmatch(r"[0-9a-f]{64}", r["email"])
        for r in preview["rows"]
        if r["email"] and r["email"] != "Inconnu"
    )
    csv = analyst.get(f"/tables/{gold}/export", params={"format": "csv"})
    assert csv.status_code == 200 and clear not in csv.text
    parquet = analyst.get(f"/tables/{gold}/export", params={"format": "parquet"})
    emails = pq.read_table(io.BytesIO(parquet.content)).column("email").to_pylist()
    assert clear not in emails
    # Agent previews of the analyst are pseudonymized too.
    project = world.ids["project_id"]
    asked = analyst.post(
        f"/projects/{project}/mart-requests", json={"question": "CA par email"}
    ).json()
    rows = analyst.get(f"/mart-requests/{asked['mart_request']['id']}").json()["iterations"][-1][
        "preview"
    ]["rows"]
    assert rows and clear not in str(rows)


def test_analyst_sees_neither_bronze_nor_silver(world: World) -> None:
    analyst = world.clients["analyst"]
    project = world.ids["project_id"]
    layers = {t["layer"] for t in analyst.get(f"/projects/{project}/tables").json()}
    assert "silver" not in layers and "gold" in layers
    assert analyst.get(f"/sources/{world.ids['source_id']}/preview").status_code == 403
    assert analyst.get(f"/tables/{world.ids['silver_table']}/preview").status_code == 403
    runs = analyst.get(f"/projects/{project}/runs").json()
    assert runs and all(r["type"] == "mart_request" for r in runs)  # only their own


def test_documented_matrix_matches_the_code() -> None:
    text = DOCS.read_text(encoding="utf-8")
    for action in Action:
        line = next(
            (row for row in text.splitlines() if row.startswith(f"| `{action.value}`")), None
        )
        assert line is not None, f"{action.value} missing from docs/security.md"
        cells = [c.strip() for c in line.strip("|").split("|")]
        assert cells[1] == ACTION_DESCRIPTIONS[action]
        documented = {
            role
            for role, cell in zip(("admin", "engineer", "analyst"), cells[2:5], strict=True)
            if cell == "✓"
        }
        assert documented == {r.value for r in Role if action in ROLE_ACTIONS[r]}, action.value
