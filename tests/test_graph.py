"""The pipeline graph of the canvas: nodes, states, links, runs and ETag."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_api.main import create_app
from forja_api.state import AppState
from forja_core.graph.builder import build_graph, plan_rules
from forja_core.graph.models import ProjectGraph
from forja_core.jobs.models import Job, JobProgress, JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.utils import utcnow
from tests.auth import api_client
from tests.fixtures import ecommerce as ec
from tests.shop import build_gold_shop, shop_settings


@pytest.fixture(scope="module")
def shop(tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path) -> Iterator[AppState]:
    state, _ = build_gold_shop(shop_settings(tmp_path_factory.mktemp("graph")), ecommerce_dir)
    yield state
    state.close()


def _graph(state: AppState, project_id: str) -> ProjectGraph:
    return build_graph(
        state.catalog, project_id, exports_dir=state.publisher.exports_dir(project_id)
    )


def _project(state: AppState) -> Project:
    [project] = state.catalog.list_projects()
    return project


def _add_job(state: AppState, project: Project, job_type: JobType, **fields: object) -> Job:
    values: dict[str, object] = {
        "id": f"job_{job_type.value}_{len(state.catalog.list_jobs(project.id))}",
        "project_id": project.id,
        "type": job_type,
        "status": JobStatus.RUNNING,
        "params": RunRequest(type=job_type),
        "created_at": utcnow(),
        **fields,
    }
    job = Job.model_validate(values)
    state.catalog.add_job(job)
    return job


def test_built_shop(shop: AppState) -> None:
    graph = _graph(shop, _project(shop).id)
    nodes = {n.id: n for n in graph.nodes}
    assert set(nodes) == {
        "src_clients", "src_produits", "src_commandes", "src_lignes_commande",
        "stg_clients", "stg_produits", "stg_commandes", "stg_lignes_commande",
        "dim_clients", "dim_produits", "dim_date", "fct_ventes", "dest_serving",
    }  # fmt: skip
    assert nodes["fct_ventes"].lane == "star_schema" and nodes["fct_ventes"].type == "fact"
    assert nodes["dim_date"].type == "date_dimension"
    assert all(n.state == "applied" for n in graph.nodes)
    clients = nodes["src_clients"]
    assert clients.name == ec.CLIENTS and clients.quality_score is not None
    assert clients.pii_count > 0 and clients.counts.rows == len(ec.clients_rows())
    assert nodes["stg_clients"].counts.rules == plan_rules(shop.catalog.get_plan(clients.ref or ""))
    assert nodes["dim_clients"].pii_count == len(nodes["dim_clients"].pii_columns) > 0
    assert set(nodes["stg_clients"].pii_columns) >= {"email"}
    assert nodes["fct_ventes"].highlights  # measures, shown when zoomed in

    edges = {(e.source, e.target): e for e in graph.edges}
    assert edges[("src_clients", "stg_clients")].type == "lineage"
    assert {("stg_lignes_commande", "fct_ventes"), ("stg_commandes", "fct_ventes")} <= set(edges)
    relation = edges[("dim_clients", "fct_ventes")]
    assert relation.type == "relation" and relation.confidence and relation.confidence > 0.9
    # Gold tables are published by default and no data mart reads them yet.
    assert edges[("fct_ventes", "dest_serving")].type == "publication"
    assert {lane.lane: lane.total for lane in graph.lanes} == {
        "sources": 4, "cleaning": 4, "star_schema": 4, "serving": 1,
    }  # fmt: skip
    assert graph.version == _graph(shop, _project(shop).id).version


def test_running_build_marks_nodes(shop: AppState) -> None:
    project = _project(shop)
    before = _graph(shop, project.id).version
    progress = JobProgress(step="dbt", percent=40, running=["stg_clients"], done=["stg_produits"])
    job = _add_job(shop, project, JobType.BUILD_SILVER, progress=progress)
    try:
        graph = _graph(shop, project.id)
        nodes = {n.id: n for n in graph.nodes}
        assert nodes["stg_clients"].state == "running"
        assert nodes["stg_clients"].run is not None and nodes["stg_clients"].run.percent == 40
        assert nodes["stg_produits"].state == "applied"
        assert nodes["stg_produits"].run and nodes["stg_produits"].run.status == "succeeded"
        assert nodes["stg_commandes"].state == "pending"  # not reached yet
        gold_run = nodes["dim_clients"].run  # not built by this run: keeps the Gold build
        assert gold_run is not None and gold_run.type is JobType.BUILD_GOLD
        edges = {(e.source, e.target): e for e in graph.edges}
        assert edges[("src_clients", "stg_clients")].state == "running"
        cleaning = next(lane for lane in graph.lanes if lane.lane == "cleaning")
        assert cleaning.states == {"running": 1, "applied": 1, "pending": 2}
        assert graph.version != before
    finally:
        job.status, job.finished_at, job.error = JobStatus.FAILED, utcnow(), "dbt a échoué"
        job.progress = progress.model_copy(
            update={"running": [], "failed": ["stg_clients"], "done": ["stg_produits"]}
        )
        shop.catalog.save_job(job)
    failed = {n.id: n for n in _graph(shop, project.id).nodes}
    assert (
        failed["stg_clients"].state == "error" and failed["stg_clients"].message == "dbt a échoué"
    )
    assert failed["stg_commandes"].state == "applied"  # never reached, keeps its state
    # A later success clears the error.
    _add_job(
        shop,
        project,
        JobType.BUILD_SILVER,
        status=JobStatus.SUCCEEDED,
        finished_at=utcnow(),
        progress=JobProgress(step="dbt", percent=100, done=["stg_clients"]),
    )
    assert {n.id: n for n in _graph(shop, project.id).nodes}["stg_clients"].state == "applied"


def test_states_follow_plans(tmp_path: Path, ecommerce_dir: Path) -> None:
    state = AppState.build(
        shop_settings(tmp_path).model_copy(update={"auto_approve_silver": False})
    )
    try:
        project = state.catalog.create_project(ProjectCreate(name="Vide"))
        empty = _graph(state, project.id)
        assert empty.nodes == [] and [lane.total for lane in empty.lanes] == [0, 0, 0, 0]

        [source] = state.ingestion.ingest_file(project.id, ecommerce_dir / ec.CLIENTS, ec.CLIENTS)
        nodes = {n.id: n for n in _graph(state, project.id).nodes}
        assert nodes["src_clients"].state == "applied"
        assert nodes["stg_clients"].state == "review" and nodes["stg_clients"].review_count > 0
        assert {e.state for e in _graph(state, project.id).edges} == {"applied"}

        state.plans.approve(source.id)
        nodes = {n.id: n for n in _graph(state, project.id).nodes}
        assert nodes["stg_clients"].state == "pending"
        assert nodes["stg_clients"].message == "Plan validé, table à construire"
    finally:
        state.close()


def test_endpoint_etag(tmp_path: Path) -> None:
    settings = shop_settings(tmp_path)
    with api_client(settings) as admin:
        project = admin.post("/projects", json={"name": "Boutique"}).json()
        response = admin.get(f"/projects/{project['id']}/graph")
        assert response.status_code == 200
        etag = response.headers["etag"]
        assert etag == f'"{response.json()["version"]}"'
        again = admin.get(f"/projects/{project['id']}/graph", headers={"If-None-Match": etag})
        assert again.status_code == 304 and again.content == b""
        other = admin.get(f"/projects/{project['id']}/graph", headers={"If-None-Match": '"x"'})
        assert other.status_code == 200
    with TestClient(create_app(settings)) as anonymous:
        assert anonymous.get(f"/projects/{project['id']}/graph").status_code == 401
