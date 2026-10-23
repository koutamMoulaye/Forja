"""Shared setup: the e-commerce fixture ingested and built into Silver."""

from __future__ import annotations

from pathlib import Path

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from tests.fixtures import ecommerce as ec

SOURCES = (ec.CLIENTS, ec.PRODUITS, ec.COMMANDES, ec.LIGNES)


def shop_settings(root: Path, **overrides: object) -> Settings:
    return Settings(
        data_dir=root / "data",
        secrets_dir=root / "secrets",
        log_format="console",
        log_level="WARNING",
        job_runner="inline",
        auto_approve_silver=True,
        **overrides,  # type: ignore[arg-type]
    )


def run(state: AppState, project: Project, request: RunRequest) -> None:
    job = state.executor.create(project.id, request)
    state.runner.submit(job.id)
    done = state.catalog.get_job(job.id)
    assert done.status is JobStatus.SUCCEEDED, state.catalog.job_logs(job.id)


def build_shop(settings: Settings, ecommerce_dir: Path) -> tuple[AppState, Project]:
    """Four e-commerce sources ingested, auto-approved and built into Silver."""
    state = AppState.build(
        settings.model_copy(update={"job_runner": "inline", "auto_approve_silver": True})
    )
    project = state.catalog.create_project(ProjectCreate(name="Boutique"))
    for name in SOURCES:
        state.ingestion.ingest_file(project.id, ecommerce_dir / name, name)
    run(state, project, RunRequest(type=JobType.BUILD_SILVER))
    return state, project


def build_gold_shop(settings: Settings, ecommerce_dir: Path) -> tuple[AppState, Project]:
    """The shop with confirmed relations, the heuristic star schema built, and its
    semantic layer generated (as after a build_gold run)."""
    state, project = build_shop(settings, ecommerce_dir)
    for relation in state.catalog.list_relations(project.id):
        state.relations.confirm(relation.id)
    state.gold.propose(project.id, use_llm=False)  # deterministic star schema
    state.gold.approve(project.id)
    run(state, project, RunRequest(type=JobType.BUILD_GOLD))
    return state, project
