"""Recording of the response examples of the OpenAPI document.

The demonstration project is built in a temporary directory, then every operation is
called once with a role allowed to perform it; each answer is shortened (two items
per list, long texts cut) and secrets are replaced by placeholders.
"""

from __future__ import annotations

import json
import tempfile
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pydantic import SecretStr

from forja_api.demo import ANALYST_EMAIL, ENGINEER_EMAIL, build_demo, demo_settings
from forja_api.main import create_app
from forja_api.openapi import EXAMPLES_FILE
from forja_core.config import Settings
from forja_core.connectors.models import (
    CursorCandidate,
    DatabaseColumn,
    DatabaseExploration,
    DatabaseTable,
)
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


_ORDERS = [
    {
        "id": i,
        "updated_at": f"2025-01-{10 + i:02d}T08:00:00Z",
        "statut": "payée" if i % 2 else "en attente",
        "montant": 40.0 + 12.5 * i,
        "client": {"nom": "***", "ville": "Lyon" if i % 2 else "Nantes"},
        "lignes": [{"sku": f"P-{i}{n}", "quantite": n + 1} for n in range(i % 3)],
    }
    for i in range(1, 6)
]


@contextmanager
def _sample_api() -> Iterator[str]:
    """A small REST API of orders, paginated by page number, for the examples."""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args: Any) -> None:
            return

        def do_GET(self) -> None:
            page = 1
            if "page=" in self.path:
                page = int(self.path.split("page=")[1].split("&")[0])
            chunk = _ORDERS[(page - 1) * 3 : page * 3]
            data = json.dumps({"data": chunk, "meta": {"page": page}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    finally:
        server.shutdown()
        server.server_close()


def _exploration_example(connection_id: str) -> dict[str, Any]:
    """A database exploration (no database runs while examples are recorded)."""
    exploration = DatabaseExploration(
        connection_id=connection_id,
        schemas=["public", "ventes"],
        tables=[
            DatabaseTable(
                schema_name="ventes",
                name="commandes",
                kind="table",
                estimated_rows=1_284_310,
                columns=[
                    DatabaseColumn(name="id", type="INTEGER", forja_type="int64", nullable=False),
                    DatabaseColumn(
                        name="montant", type="NUMERIC(10, 2)", forja_type="decimal128(10, 2)"
                    ),
                    DatabaseColumn(
                        name="modifie_le",
                        type="TIMESTAMP WITH TIME ZONE",
                        forja_type="timestamp[us, tz=UTC]",
                        nullable=False,
                    ),
                ],
                primary_key=["id"],
                cursor_candidates=[
                    CursorCandidate(
                        column="modifie_le",
                        kind="timestamp",
                        reason="Date de modification : chaque chargement reprend les lignes "
                        "ajoutées ou modifiées depuis le précédent.",
                    ),
                    CursorCandidate(
                        column="id",
                        kind="increasing_id",
                        reason="Identifiant croissant : seules les nouvelles lignes sont lues, "
                        "les modifications ne sont pas reprises.",
                    ),
                ],
                suggested_cursor="modifie_le",
            )
        ],
    )
    return {"status": 200, "body": _shorten(exploration.model_dump(mode="json"))}


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
        scheduler_enabled=False,
        connector_allowed_hosts=["127.0.0.1"],
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
        revoked = post(
            admin,
            "/projects/{project_id}/invitations",
            {"email": "erreur@exemple.fr", "role": "analyst"},
        )
        rec.call(
            admin,
            "DELETE",
            "/projects/{project_id}/invitations/{invitation_id}",
            p("/projects/{project_id}/invitations/{invitation_id}", invitation_id=revoked["id"]),
        )
        rec.call(
            TestClient(app),
            "POST",
            "/auth/invitations/lookup",
            "/auth/invitations/lookup",
            json={"token": invitation["token"]},
        )
        registered = rec.call(
            TestClient(app),
            "POST",
            "/auth/register",
            "/auth/register",
            json={
                "token": invitation["token"],
                "password": "Nouveau-Passw0rd-26",
                "name": "Nora Nouvelle",
            },
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
        review = get(engineer, "/sources/{source_id}/plan/review", **source_ids)
        post(
            engineer,
            "/sources/{source_id}/plan/review",
            {"decisions": {rule["id"]: "validated" for rule in review["rules"]}},
            **source_ids,
        )
        get(engineer, "/sources/{source_id}/plan/samples", **source_ids)
        post(engineer, "/sources/{source_id}/plan/approve", **source_ids)
        rec.call(
            engineer,
            "GET",
            "/sources/{source_id}/rejects",
            p("/sources/{source_id}/rejects", **source_ids),
            params={"limit": 2},
        )

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
        get(engineer, "/projects/{project_id}/gold-plan/issues")
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
        get(analyst, "/projects/{project_id}/agent/overview")
        asked = post(
            analyst,
            "/projects/{project_id}/mart-requests",
            {"question": "Les ventes par produit en 2024"},
        )
        mart = {"mart_id": asked["mart_request"]["id"]}
        post(analyst, "/mart-requests/{mart_id}/answer", {"option": 0}, **mart)
        post(analyst, "/mart-requests/{mart_id}/refine", {"instruction": "seulement le T1"}, **mart)
        refined = get(analyst, "/mart-requests/{mart_id}", **mart)["iterations"][-1]
        term = next(i for i, part in enumerate(refined["summary_parts"]) if part.get("term"))
        post(
            analyst,
            "/mart-requests/{mart_id}/correct",
            {"version": refined["version"], "term": term, "option": 1},
            **mart,
        )
        get(analyst, "/mart-requests/{mart_id}", **mart)
        get(analyst, "/projects/{project_id}/mart-requests")
        state.settings.mart_require_approval = True
        post(analyst, "/mart-requests/{mart_id}/validate", {"destination": "powerbi"}, **mart)
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

        # Notifications of the analyst: the agent's answers and the decisions above.
        rec.call(analyst, "GET", "/notifications", "/notifications", params={"limit": 2})
        rec.call(analyst, "POST", "/notifications/read", "/notifications/read", json={})

        # Connections, chunked uploads and schedules
        with _sample_api() as base:
            get(admin, "/settings/connectors")
            rec.call(
                admin,
                "PUT",
                "/settings/connectors",
                "/settings/connectors",
                json={"allowed_hosts": ["10.0.0.0/8", "crm.interne"]},
            )
            api = {
                "base_url": base,
                "auth": {"kind": "bearer"},
                "pagination": {"kind": "page_number", "page_size": 3},
                "endpoints": [
                    {
                        "name": "commandes",
                        "path": "/commandes",
                        "incremental": {"param": "depuis", "cursor_field": "updated_at"},
                    }
                ],
                "rate_limit_per_second": 5,
            }
            draft = {
                "name": "Boutique en ligne",
                "type": "rest_api",
                "params": api,
                "secrets": {"token": "jeton-de-demonstration"},
            }
            post(engineer, "/projects/{project_id}/connections/test", draft)
            post(
                engineer,
                "/projects/{project_id}/connections/preview",
                {"params": api, "secrets": {"token": "jeton-de-demonstration"}},
            )
            connection = post(engineer, "/projects/{project_id}/connections", draft)
            ids = {"connection_id": connection["id"]}
            post(engineer, "/connections/{connection_id}/test", **ids)
            rec.call(
                engineer,
                "PATCH",
                "/connections/{connection_id}",
                p("/connections/{connection_id}", **ids),
                json={"name": "Boutique en ligne (API)"},
            )
            post(
                engineer,
                "/connections/{connection_id}/import",
                {"endpoints": [{"endpoint": "commandes"}], "load_now": False},
                **ids,
            )
            post(engineer, "/connections/{connection_id}/load", {"chain": False}, **ids)
            get(engineer, "/connections/{connection_id}", **ids)
            get(engineer, "/projects/{project_id}/connections")
            rec.examples["GET /connections/{connection_id}/explore"] = _exploration_example(
                connection["id"]
            )
            post(
                engineer,
                "/projects/{project_id}/schedules/interpret",
                {"text": "du lundi au vendredi à 6 h 30"},
            )
            rec.call(
                engineer,
                "PUT",
                "/connections/{connection_id}/schedule",
                p("/connections/{connection_id}/schedule", **ids),
                json={"text": "tous les jours à 6 h"},
            )
            get(engineer, "/connections/{connection_id}/schedule", **ids)
            api_source = next(
                s for s in get(engineer, "/projects/{project_id}/sources") if s["origin"]
            )
            source = {"source_id": api_source["id"]}
            rec.call(
                engineer,
                "PUT",
                "/sources/{source_id}/schedule",
                p("/sources/{source_id}/schedule", **source),
                json={"text": "toutes les heures"},
            )
            get(engineer, "/sources/{source_id}/schedule", **source)
            get(engineer, "/projects/{project_id}/schedules")
            rec.call(
                engineer,
                "DELETE",
                "/sources/{source_id}/schedule",
                p("/sources/{source_id}/schedule", **source),
            )
            rec.call(
                engineer,
                "DELETE",
                "/connections/{connection_id}/schedule",
                p("/connections/{connection_id}/schedule", **ids),
            )
            spare = post(engineer, "/projects/{project_id}/connections", {**draft, "name": "Essai"})
            rec.call(
                engineer,
                "DELETE",
                "/connections/{connection_id}",
                p("/connections/{connection_id}", connection_id=spare["id"]),
            )

        content = "code;libellé\nA;Premier\nB;Second\n".encode()
        upload = post(
            engineer,
            "/projects/{project_id}/uploads",
            {"filename": "codes.csv", "size": len(content)},
        )
        uploaded = {"upload_id": upload["id"]}
        rec.call(
            engineer,
            "PUT",
            "/uploads/{upload_id}/chunks",
            p("/uploads/{upload_id}/chunks", **uploaded),
            params={"offset": 0},
            content=content,
            headers={"Content-Type": "application/octet-stream"},
        )
        get(engineer, "/uploads/{upload_id}", **uploaded)
        post(engineer, "/uploads/{upload_id}/complete", **uploaded)
        abandoned = post(
            engineer, "/projects/{project_id}/uploads", {"filename": "gros.parquet", "size": 10**9}
        )
        rec.call(
            engineer,
            "DELETE",
            "/uploads/{upload_id}",
            p("/uploads/{upload_id}", upload_id=abandoned["id"]),
        )

        # Instance settings
        get(analyst, "/settings/llm")
        rec.call(admin, "PUT", "/settings/llm", "/settings/llm", json={"provider": "none"})
        post(admin, "/settings/llm/test")

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
