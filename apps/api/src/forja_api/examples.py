"""Recording of the response examples of the OpenAPI document.

The demonstration project is built in a temporary directory, then every operation is
called once with a role allowed to perform it; each answer is shortened (two items
per list, long texts cut) and secrets are replaced by placeholders.
"""

from __future__ import annotations

import json
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pydantic import SecretStr

from forja_api.demo import ANALYST_EMAIL, ENGINEER_EMAIL, build_demo, demo_settings
from forja_api.main import create_app
from forja_api.openapi import EXAMPLES_FILE
from forja_core.config import Settings
from forja_core.demo import ecommerce
from forja_core.jobs.models import JobType, RunRequest

_BOOTSTRAP = "Exemple-Bootstrap-2026"
_ADMIN = "Exemple-Admin-2026"
_SECRET_FIELDS = {"access_token", "refresh_token", "key", "token"}


def _shorten(value: Any, depth: int = 0) -> Any:
    if isinstance(value, dict):
        return {
            k: (
                _placeholder(k, v)
                if k in _SECRET_FIELDS and isinstance(v, str)
                else _shorten(v, depth + 1)
            )
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_shorten(v, depth + 1) for v in value[:2]]
    if isinstance(value, str) and len(value) > 400:
        return value[:400] + "…"
    return value


def _placeholder(name: str, value: str) -> str:
    if name == "key":
        return value[: value.index("_", 4) + 1] + "…" if value.startswith("fja_") else "…"
    return {"access_token": "eyJhbGciOiJIUzI1NiIs…", "refresh_token": "frt_…"}.get(name, "…")


_PERSONAL_COLUMNS = {"email", "nom", "prénom", "prenom", "telephone", "iban"}


def _without_personal_values(body: dict[str, Any]) -> dict[str, Any]:
    """Bronze rows are raw: the example shows their shape, not the people."""
    rows = [
        {k: ("***" if k in _PERSONAL_COLUMNS and v else v) for k, v in row.items()}
        for row in body.get("rows", [])
    ]
    return {**body, "rows": rows}


class _Recorder:
    def __init__(self) -> None:
        self.examples: dict[str, Any] = {}

    def call(self, client: TestClient, method: str, template: str, path: str, **kwargs: Any) -> Any:
        response = client.request(method, path, **kwargs)
        if response.status_code >= 400:
            raise RuntimeError(f"{method} {path}: {response.status_code} {response.text[:300]}")
        content_type = response.headers.get("content-type", "")
        body: Any
        if not response.content:
            body = None
        elif "application/json" in content_type:
            body = response.json()
        elif content_type.startswith("text/plain"):
            body = response.text
        else:
            body = None  # files: no example body
        if template == "/sources/{source_id}/preview" and isinstance(body, dict):
            body = _without_personal_values(body)
        if body is not None or response.status_code == 204:
            self.examples[f"{method} {template}"] = {
                "status": response.status_code,
                "body": _shorten(body) if body is not None else None,
            }
        return body


def record(root: Path) -> dict[str, Any]:
    settings = Settings(
        data_dir=root / "data",
        secrets_dir=root / "secrets",
        log_level="WARNING",
        log_format="console",
        auth_mode="multi",
        auth_bootstrap_password=SecretStr(_BOOTSTRAP),
        agent_today="2025-01-15",
        allow_bronze_preview=True,
    )
    app = create_app(demo_settings(settings))
    rec = _Recorder()
    with TestClient(app) as admin:
        state = app.state.forja
        rec.call(admin, "GET", "/health", "/health")
        first = rec.call(
            admin,
            "POST",
            "/auth/login",
            "/auth/login",
            json={"email": settings.auth_bootstrap_email, "password": _BOOTSTRAP},
        )
        admin.headers["Authorization"] = f"Bearer {first['access_token']}"
        tokens = rec.call(
            admin,
            "POST",
            "/auth/password",
            "/auth/password",
            json={"current_password": _BOOTSTRAP, "new_password": _ADMIN},
        )
        admin.headers["Authorization"] = f"Bearer {tokens['access_token']}"
        refreshed = rec.call(
            TestClient(app),
            "POST",
            "/auth/refresh",
            "/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        )
        admin.headers["Authorization"] = f"Bearer {refreshed['access_token']}"

        demo = build_demo(state)
        project = demo.project.id
        engineer, analyst = TestClient(app), TestClient(app)
        for client, email in ((engineer, ENGINEER_EMAIL), (analyst, ANALYST_EMAIL)):
            body = client.post(
                "/auth/login", json={"email": email, "password": demo.created_accounts[email]}
            ).json()
            client.headers["Authorization"] = f"Bearer {body['access_token']}"

        def p(template: str, **ids: str) -> str:
            return template.format(project_id=project, **ids)

        def get(client: TestClient, template: str, **ids: str) -> Any:
            return rec.call(client, "GET", template, p(template, **ids))

        def post(client: TestClient, template: str, body: Any = None, **ids: str) -> Any:
            return rec.call(client, "POST", template, p(template, **ids), json=body)

        get(admin, "/auth/me")
        key = post(admin, "/auth/api-keys", {"name": "Power BI"})
        get(admin, "/auth/api-keys")
        rec.call(admin, "DELETE", "/auth/api-keys/{key_id}", f"/auth/api-keys/{key['id']}")
        get(admin, "/auth/users")
        rec.call(admin, "POST", "/projects", "/projects", json={"name": "Finance"})
        get(admin, "/projects")
        get(admin, "/projects/{project_id}/members")
        invitation = post(
            admin,
            "/projects/{project_id}/invitations",
            {"email": "nouveau@exemple.fr", "role": "analyst"},
        )
        get(admin, "/projects/{project_id}/invitations")
        registered = rec.call(
            TestClient(app),
            "POST",
            "/auth/register",
            "/auth/register",
            json={"token": invitation["token"], "password": "Nouveau-Passw0rd-26"},
        )
        newcomer = TestClient(app)
        newcomer.headers["Authorization"] = f"Bearer {registered['access_token']}"
        newcomer_id = newcomer.get("/auth/me").json()["user"]["id"]
        rec.call(
            admin,
            "PUT",
            "/projects/{project_id}/members/{user_id}",
            p("/projects/{project_id}/members/{user_id}", user_id=newcomer_id),
            json={"role": "engineer"},
        )
        rec.call(
            admin,
            "DELETE",
            "/projects/{project_id}/members/{user_id}",
            p("/projects/{project_id}/members/{user_id}", user_id=newcomer_id),
        )
        rec.call(newcomer, "POST", "/auth/logout", "/auth/logout")

        # Sources and plans
        sources = get(engineer, "/projects/{project_id}/sources")
        clients = next(s for s in sources if s["name"] == "clients")
        with tempfile.TemporaryDirectory() as directory:
            ecommerce.generate(Path(directory))
            with (Path(directory) / ecommerce.CLIENTS_V2).open("rb") as handle:
                rec.call(
                    engineer,
                    "POST",
                    "/sources/{source_id}/versions",
                    f"/sources/{clients['id']}/versions",
                    files={"file": ("clients.csv", handle)},
                )
            with (Path(directory) / ecommerce.PRODUITS).open("rb") as handle:
                rec.call(
                    engineer,
                    "POST",
                    "/projects/{project_id}/sources",
                    p("/projects/{project_id}/sources"),
                    params={"mode": "new_source"},
                    files={"file": ("catalogue.csv", handle)},
                )
        source_ids = {"source_id": clients["id"]}
        for template in (
            "/sources/{source_id}",
            "/sources/{source_id}/versions",
            "/sources/{source_id}/profile",
            "/sources/{source_id}/plan",
            "/sources/{source_id}/plans",
        ):
            get(engineer, template, **source_ids)
        rec.call(
            admin,
            "GET",
            "/sources/{source_id}/preview",
            p("/sources/{source_id}/preview", **source_ids),
            params={"limit": 2},
        )
        rec.call(
            engineer,
            "PATCH",
            "/sources/{source_id}/plan",
            p("/sources/{source_id}/plan", **source_ids),
            json={"columns": {"email": {"pii_treatment": "mask"}}},
        )
        post(engineer, "/sources/{source_id}/plan/approve", **source_ids)

        # Relations
        relations = get(engineer, "/projects/{project_id}/relations")
        relation = {"relation_id": relations[0]["id"]}
        get(engineer, "/relations/{relation_id}", **relation)
        post(engineer, "/relations/{relation_id}/reject", **relation)
        post(engineer, "/relations/{relation_id}/confirm", **relation)
        by_name = {s["name"]: s["id"] for s in sources}
        post(
            engineer,
            "/projects/{project_id}/relations",
            {
                "from_source_id": by_name["commandes"],
                "from_column": "id_client",
                "to_source_id": by_name["clients"],
                "to_column": "id_client",
            },
        )
        post(engineer, "/projects/{project_id}/relations/detect")

        # Gold
        get(engineer, "/projects/{project_id}/gold-plan")
        get(engineer, "/projects/{project_id}/gold-plans")
        post(engineer, "/projects/{project_id}/gold-plan/propose", {"use_llm": False})
        rec.call(
            engineer,
            "PATCH",
            "/projects/{project_id}/gold-plan",
            p("/projects/{project_id}/gold-plan"),
            json={"dimension_scd": {"dim_produits": "scd1"}},
        )
        post(engineer, "/projects/{project_id}/gold-plan/approve")

        # Runs and tables
        run = post(engineer, "/projects/{project_id}/runs", {"type": "profile"})
        run_ids = {"run_id": run["id"]}
        get(engineer, "/projects/{project_id}/runs")
        get(engineer, "/projects/{project_id}/graph")
        get(engineer, "/runs/{run_id}", **run_ids)
        get(engineer, "/runs/{run_id}/logs", **run_ids)
        queued = state.executor.create(project, RunRequest(type=JobType.EXPORT))
        post(engineer, "/runs/{run_id}/cancel", run_id=queued.id)
        tables = {t["name"]: t for t in get(analyst, "/projects/{project_id}/tables")}
        table = {"table_id": tables["fct_ventes"]["id"]}
        get(analyst, "/tables/{table_id}", **table)
        rec.call(
            analyst,
            "GET",
            "/tables/{table_id}/preview",
            p("/tables/{table_id}/preview", **table),
            params={"limit": 2},
        )
        rec.call(
            engineer,
            "PATCH",
            "/tables/{table_id}",
            p("/tables/{table_id}", **table),
            json={"publish": True},
        )
        rec.call(
            engineer, "GET", "/tables/{table_id}/export", p("/tables/{table_id}/export", **table)
        )

        # Semantic layer
        get(analyst, "/projects/{project_id}/semantic-layer")
        get(analyst, "/projects/{project_id}/semantic-layer/versions")
        post(engineer, "/projects/{project_id}/semantic-layer/regenerate")
        rec.call(
            engineer,
            "PATCH",
            "/projects/{project_id}/semantic-layer",
            p("/projects/{project_id}/semantic-layer"),
            json={"overrides": [{"target": "metric:montant", "add_synonyms": ["recettes"]}]},
        )
        proposal = post(
            analyst,
            "/projects/{project_id}/semantic-layer/synonym-proposals",
            {"target": "metric:montant", "synonym": "encaissements"},
        )
        get(analyst, "/projects/{project_id}/semantic-layer/synonym-proposals")
        post(engineer, "/synonym-proposals/{proposal_id}/accept", proposal_id=proposal["id"])
        other = post(
            analyst,
            "/projects/{project_id}/semantic-layer/synonym-proposals",
            {"target": "attribute:client.ville", "synonym": "cité"},
        )
        post(engineer, "/synonym-proposals/{proposal_id}/reject", proposal_id=other["id"])

        # Agent
        asked = post(
            analyst,
            "/projects/{project_id}/mart-requests",
            {"question": "Les ventes par produit en 2024"},
        )
        mart = {"mart_id": asked["mart_request"]["id"]}
        post(analyst, "/mart-requests/{mart_id}/answer", {"option": 0}, **mart)
        post(analyst, "/mart-requests/{mart_id}/refine", {"instruction": "seulement le T1"}, **mart)
        get(analyst, "/mart-requests/{mart_id}", **mart)
        get(analyst, "/projects/{project_id}/mart-requests")
        state.settings.mart_require_approval = True
        post(analyst, "/mart-requests/{mart_id}/validate", **mart)
        post(engineer, "/mart-requests/{mart_id}/approve", **mart)
        state.settings.mart_require_approval = False
        rejected = post(
            analyst,
            "/projects/{project_id}/mart-requests",
            {"question": "Panier moyen par segment"},
        )
        post(
            analyst,
            "/mart-requests/{mart_id}/reject",
            {"reason": "doublon"},
            mart_id=rejected["mart_request"]["id"],
        )

        # Audit last: it holds everything above.
        rec.call(
            admin,
            "GET",
            "/projects/{project_id}/audit",
            p("/projects/{project_id}/audit"),
            params={"limit": 2},
        )
        rec.call(admin, "GET", "/audit", "/audit", params={"limit": 2})
        post(admin, "/projects/{project_id}/runs", {"type": "export"})
    return rec.examples


def write_examples(progress: Callable[[str], None] = print) -> int:
    with tempfile.TemporaryDirectory(prefix="forja_examples_") as root:
        examples = record(Path(root))
    EXAMPLES_FILE.write_text(
        json.dumps(examples, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    progress(f"{len(examples)} exemples écrits dans {EXAMPLES_FILE}")
    return len(examples)
