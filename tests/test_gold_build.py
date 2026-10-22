from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import duckdb
import pytest
import yaml

from forja_api.state import AppState
from forja_core.gold.build import gold_inputs
from forja_core.jobs.models import Job, JobStatus, JobType, RunRequest
from forja_core.models import Project
from forja_core.privacy import pseudonymize
from forja_core.silver.dbt.project import render_project
from forja_core.silver.plan import PlanStatus
from forja_core.silver.tables import TableLayer
from tests.fixtures import ecommerce as ec
from tests.shop import build_shop, shop_settings


def _submit(state: AppState, project: Project, job_type: JobType) -> Job:
    job = state.executor.create(project.id, RunRequest(type=job_type))
    state.runner.submit(job.id)
    return state.catalog.get_job(job.id)


@pytest.fixture(scope="module")
def gold_shop(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[AppState, Project, Job]]:
    state, project = build_shop(shop_settings(tmp_path_factory.mktemp("gold_build")), ecommerce_dir)
    failed = _submit(state, project, JobType.BUILD_GOLD)
    assert failed.status is JobStatus.FAILED and "approve one first" in (failed.error or "")
    for relation in state.catalog.list_relations(project.id):
        state.relations.confirm(relation.id)
    state.gold.propose(project.id)
    state.gold.approve(project.id)
    job = _submit(state, project, JobType.BUILD_GOLD)
    assert job.status is JobStatus.SUCCEEDED, state.catalog.job_logs(job.id)
    yield state, project, job
    state.close()


def _orphan_client_lines() -> int:
    return sum(1 for row in ec.lignes_rows() if row[0] in ec.ORPHAN_CLIENT_ORDERS)


def test_models_and_unknown_members(gold_shop: tuple[AppState, Project, Job]) -> None:
    _, _, job = gold_shop
    assert job.metrics is not None
    rows = {m.name: m.rows for m in job.metrics.models}
    lines = len(ec.lignes_rows())
    assert rows["fct_ventes"] == lines  # no fact row is lost
    assert rows["dim_clients"] == ec.CLIENT_COUNT + 1  # plus the unknown member
    assert rows["dim_produits"] == ec.PRODUCT_COUNT + 1
    assert rows["snap_clients"] == ec.CLIENT_COUNT
    assert rows["dim_date"] > 300

    unknown = {u.key: u.rows for u in job.metrics.unknown_member_rows}
    assert unknown == {
        "produit_key": 1,
        "client_key": _orphan_client_lines(),
        "date_commande_key": 0,
    }


def test_dbt_tests_cover_keys_relationships_and_grain(
    gold_shop: tuple[AppState, Project, Job],
) -> None:
    _, _, job = gold_shop
    assert job.metrics is not None and job.metrics.dbt_tests is not None
    tests = job.metrics.dbt_tests
    assert tests.failed == 0 and tests.errored == 0
    names = {r.name for r in tests.results}
    assert any(n.startswith("relationships_fct_ventes_client_key") for n in names)
    assert any(n.startswith("relationships_fct_ventes_date_commande_key") for n in names)
    assert any(n.startswith("forja_unique_combination_fct_ventes") for n in names)
    assert "unique_dim_clients_client_key" in names


def test_warehouse_content(gold_shop: tuple[AppState, Project, Job]) -> None:
    state, project, _ = gold_shop
    warehouse = state.generator.warehouse_path(project.id)
    with duckdb.connect(str(warehouse), read_only=True) as con:
        [(unknown_name, unknown_key)] = con.execute(
            "SELECT nom, client_key FROM dim_clients WHERE id_client IS NULL"
        ).fetchall()
        [(amount, quantity, price)] = con.execute(
            "SELECT montant, quantite, prix_unitaire FROM fct_ventes "
            "WHERE id_commande = 'CMD-00001' AND num_ligne = 1"
        ).fetchall()
        [(date_key, day_name)] = con.execute(
            "SELECT d.date_key, d.nom_jour FROM fct_ventes f "
            "JOIN dim_date d ON d.date_key = f.date_commande_key LIMIT 1"
        ).fetchall()
        orphans = con.execute(
            "SELECT DISTINCT client_key FROM fct_ventes WHERE id_commande IN (?, ?)",
            list(ec.ORPHAN_CLIENT_ORDERS),
        ).fetchall()
    assert (unknown_name, unknown_key) == ("Inconnu", "-1")
    assert amount == quantity * price
    assert 20240101 <= date_key <= 20241231
    assert day_name in {"lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"}
    assert orphans == [("-1",)]


def test_gold_tables_registered_and_plan_applied(
    gold_shop: tuple[AppState, Project, Job],
) -> None:
    state, project, _ = gold_shop
    gold = state.catalog.list_tables(project.id, TableLayer.GOLD)
    assert sorted(t.name for t in gold) == ["dim_clients", "dim_date", "dim_produits", "fct_ventes"]
    assert all(t.publish for t in gold)
    silver = state.catalog.list_tables(project.id, TableLayer.SILVER)
    assert silver and not any(t.publish for t in silver)
    plan = state.catalog.get_gold_plan(project.id)
    assert plan.status is PlanStatus.APPLIED


def test_serving_publishes_gold_tables(gold_shop: tuple[AppState, Project, Job]) -> None:
    state, project, _ = gold_shop
    export = _submit(state, project, JobType.EXPORT)
    assert export.status is JobStatus.SUCCEEDED, state.catalog.job_logs(export.id)
    assert export.metrics is not None and export.metrics.serving_path is not None
    serving = state.workspace.resolve(export.metrics.serving_path)
    salt = state.publisher.secrets.salt(project.id)
    with duckdb.connect(str(serving), read_only=True) as con:
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
        [(email,)] = con.execute(
            "SELECT email FROM dim_clients WHERE id_client = 'CLI-0001' AND is_current"
        ).fetchall()
        layers = dict(con.execute("SELECT table_name, layer FROM _forja_tables").fetchall())
    assert tables == {"dim_clients", "dim_date", "dim_produits", "fct_ventes", "_forja_tables"}
    assert set(layers.values()) == {"gold"}
    assert email == pseudonymize("jean.dupont@exemple.fr", salt)
    exported = {Path(e.path).name for e in export.metrics.exports}
    assert "fct_ventes.csv" in exported and "dim_clients.parquet" in exported

    orders = state.catalog.find_table(project.id, "stg_commandes")
    assert orders is not None
    state.catalog.set_table_publication(orders.id, True)
    again = _submit(state, project, JobType.EXPORT)
    assert again.status is JobStatus.SUCCEEDED
    with duckdb.connect(str(serving), read_only=True) as con:
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
    assert "commandes" in tables
    state.catalog.set_table_publication(orders.id, False)


def test_gold_preview_is_treated(gold_shop: tuple[AppState, Project, Job]) -> None:
    state, project, _ = gold_shop
    dim = state.catalog.find_table(project.id, "dim_clients")
    assert dim is not None
    preview = state.publisher.preview(dim, 50)
    emails = {row["email"] for row in preview.rows}
    assert "jean.dupont@exemple.fr" not in emails
    assert "client_key" in preview.columns


def test_gold_project_files(gold_shop: tuple[AppState, Project, Job]) -> None:
    state, project, _ = gold_shop
    inputs = gold_inputs(state.catalog, project.id)
    assert inputs is not None
    plans = state.catalog.effective_plans(project.id)
    files = render_project(project, plans, gold=inputs)
    assert files == render_project(project, plans, gold=inputs)
    for name in ("dim_clients", "dim_produits", "dim_date", "fct_ventes"):
        assert f"models/gold/{name}.sql" in files
    snapshots = yaml.safe_load(files["snapshots/snapshots.yml"])["snapshots"]
    assert {s["name"] for s in snapshots} == {"snap_clients", "snap_produits"}
    fact = files["models/gold/fct_ventes.sql"]
    assert "coalesce(dim_clients.client_key, '-1') as client_key" in fact
    assert "lignes_commande.quantite * lignes_commande.prix_unitaire as montant" in fact
    assert "commandes.date_commande >= dim_clients.valid_from" in fact

    # A Silver build regenerates the whole project, Gold included: nothing changes.
    rebuilt = state.generator.generate(project, plans, gold=inputs)
    assert not rebuilt.changed
