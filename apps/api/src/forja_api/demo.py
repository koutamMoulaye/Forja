"""Demonstration project « Démo e-commerce », for the front and for trying Forja.

Ingests the French e-commerce dataset, builds Silver, confirms the detected
relations, approves and builds the heuristic star schema (semantic layer included),
publishes two data marts asked by the analyst, and creates two accounts. Running it
again completes what is missing and changes nothing else; passwords are shown only
when an account is created (or with ``reset_passwords``).
"""

from __future__ import annotations

import secrets
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from forja_api.state import AppState
from forja_core.agent.models import MartStatus
from forja_core.auth.identity import hash_password
from forja_core.auth.models import Principal, Role, User
from forja_core.catalog.auth import new_id
from forja_core.config import Settings
from forja_core.demo import ecommerce
from forja_core.errors import ForjaError
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.relations.models import RelationStatus
from forja_core.silver.plan import PlanStatus
from forja_core.utils import utcnow

PROJECT_NAME = "Démo e-commerce"
ENGINEER_EMAIL = "ingenieur@demo.forja.local"
ANALYST_EMAIL = "analyste@demo.forja.local"
MART_QUESTIONS = (
    "Chiffre d'affaires et nombre de commandes par mois et par ville en 2024",
    "Quantité vendue et prix moyen par catégorie de produit",
)
SOURCES = (ecommerce.CLIENTS, ecommerce.PRODUITS, ecommerce.COMMANDES, ecommerce.LIGNES)


@dataclass
class DemoResult:
    project: Project
    created_accounts: dict[str, str] = field(default_factory=dict)  # email -> password
    steps: list[str] = field(default_factory=list)
    marts: list[str] = field(default_factory=list)


class DemoError(ForjaError):
    code = "demo_failed"


def _run(state: AppState, project: Project, request: RunRequest) -> None:
    job = state.executor.create(project.id, request)
    state.runner.submit(job.id)
    done = state.catalog.get_job(job.id)
    if done.status is not JobStatus.SUCCEEDED:
        raise DemoError(f"{request.type.value} failed: {done.error}")


def _account(
    state: AppState, project: Project, email: str, role: Role, reset: bool, result: DemoResult
) -> User:
    user = state.catalog.find_user_by_email(email)
    password = secrets.token_urlsafe(12)
    if user is None:
        user = state.catalog.add_user(
            User(id=new_id(), email=email, created_at=utcnow()), hash_password(password)
        )
        result.created_accounts[email] = password
    elif reset:
        state.catalog.set_password(user.id, hash_password(password), must_change=False)
        state.catalog.revoke_user_sessions(user.id, "demo_password_reset")
        result.created_accounts[email] = password
    state.catalog.set_membership(project.id, user.id, role)
    return user


def build_demo(state: AppState, *, reset_passwords: bool = False) -> DemoResult:
    """Create or complete the demonstration project; the state must run jobs inline."""
    catalog = state.catalog
    project = next((p for p in catalog.list_projects() if p.name == PROJECT_NAME), None)
    if project is None:
        project = catalog.create_project(
            ProjectCreate(
                name=PROJECT_NAME, description="Boutique en ligne fictive (données générées)"
            )
        )
        state.workspace.ensure_project(project.id)
    result = DemoResult(project=project)

    sources = {s.name: s for s in catalog.list_sources(project.id)}
    if len(sources) < len(SOURCES):
        with tempfile.TemporaryDirectory(prefix="forja_demo_") as directory:
            ecommerce.generate(Path(directory))
            for name in SOURCES:
                if Path(name).stem not in sources:
                    state.ingestion.ingest_file(project.id, Path(directory) / name, name)
        result.steps.append("sources chargées")
    for source in catalog.list_sources(project.id):
        if catalog.get_plan(source.id).status is PlanStatus.DRAFT:
            state.plans.approve(source.id)

    if not catalog.list_tables(project.id):
        _run(state, project, RunRequest(type=JobType.BUILD_SILVER))
        result.steps.append("Silver construit")
    for relation in catalog.list_relations(project.id, RelationStatus.SUGGESTED):
        state.relations.confirm(relation.id)

    gold = catalog.effective_gold_plan(project.id)
    if gold is None:
        state.gold.propose(project.id, use_llm=False)
        state.gold.approve(project.id)
        gold = catalog.effective_gold_plan(project.id)
    if gold is not None and gold.status is not PlanStatus.APPLIED:
        _run(state, project, RunRequest(type=JobType.BUILD_GOLD))
        result.steps.append("Gold construit, couche sémantique générée")
    if catalog.latest_semantic_layer(project.id) is None:
        state.semantic.regenerate(project.id)

    _account(state, project, ENGINEER_EMAIL, Role.ENGINEER, reset_passwords, result)
    analyst = _account(state, project, ANALYST_EMAIL, Role.ANALYST, reset_passwords, result)
    principal = Principal(user=analyst, via="password", roles=catalog.user_roles(analyst.id))

    requests = {r.question: r for r in catalog.list_mart_requests(project.id, owner_id=analyst.id)}
    for question in MART_QUESTIONS:
        request = requests.get(question)
        if request is not None and request.status is MartStatus.PUBLISHED:
            result.marts.append(request.published_name or "")
            continue
        if request is None or request.status is MartStatus.REJECTED:
            request, _ = state.marts.create(project.id, principal, question)
            request = catalog.get_mart_request(request.id)
        if request.status is MartStatus.PREVIEWED:
            state.marts.validate(request.id, principal)
            request = catalog.get_mart_request(request.id)
        if request.status is MartStatus.VALIDATED and state.settings.mart_require_approval:
            engineer = catalog.find_user_by_email(ENGINEER_EMAIL)
            assert engineer is not None
            state.marts.approve(
                request.id,
                Principal(user=engineer, via="password", roles=catalog.user_roles(engineer.id)),
            )
            request = catalog.get_mart_request(request.id)
        if request.status is not MartStatus.PUBLISHED:
            raise DemoError(f"the data mart « {question} » was not published ({request.status})")
        result.marts.append(request.published_name or "")
        result.steps.append(f"data mart {request.published_name} publié")
    return result


def demo_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"job_runner": "inline", "auto_approve_silver": True})
