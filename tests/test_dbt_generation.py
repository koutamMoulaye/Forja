from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from forja_core.catalog import Catalog
from forja_core.ingestion import IngestionService
from forja_core.models import Project
from forja_core.silver.dbt.project import DbtProjectGenerator, render_project
from forja_core.silver.dbt.sql import ident
from forja_core.silver.plan import ColumnPatch, PlanPatch, TransformationPlan
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from tests.fixtures import generate as fx


@pytest.fixture
def plans(
    ingestion: IngestionService,
    plan_service: PlanService,
    catalog: Catalog,
    project: Project,
    fixtures_dir: Path,
) -> list[TransformationPlan]:
    ingestion.ingest_file(project.id, fixtures_dir / fx.FR_CSV, "clients.csv")
    ingestion.ingest_file(project.id, fixtures_dir / fx.EXCEL, fx.EXCEL)
    for source in catalog.list_sources(project.id):
        plan_service.approve(source.id)
    return catalog.effective_plans(project.id)


def test_project_layout(plans: list[TransformationPlan], project: Project) -> None:
    files = render_project(project, plans)
    assert sorted(files) == [
        "dbt_project.yml",
        "macros/forja_unique_combination.sql",
        "macros/forja_unprocessed_rows.sql",
        "models/staging/_bronze__sources.yml",
        "models/staging/clients/stg_clients.sql",
        "models/staging/clients/stg_clients__checked.sql",
        "models/staging/clients/stg_clients__rejects.sql",
        "models/staging/schema.yml",
        "models/staging/ventes__commandes/stg_ventes__commandes.sql",
        "models/staging/ventes__commandes/stg_ventes__commandes__checked.sql",
        "models/staging/ventes__commandes/stg_ventes__commandes__rejects.sql",
        "models/staging/ventes__magasins/stg_ventes__magasins.sql",
        "models/staging/ventes__magasins/stg_ventes__magasins__checked.sql",
        "models/staging/ventes__magasins/stg_ventes__magasins__rejects.sql",
        "profiles.yml",
    ]
    profiles = yaml.safe_load(files["profiles.yml"])
    assert profiles["forja"]["outputs"]["local"] == {
        "type": "duckdb",
        "path": "../warehouse.duckdb",
        "threads": 1,
    }
    sources = yaml.safe_load(files["models/staging/_bronze__sources.yml"])
    clients = sources["sources"][0]["tables"][0]
    assert clients["meta"]["external_location"] == (
        "read_parquet('../bronze/clients/*.parquet', union_by_name = true)"
    )


def test_silver_model_sql(plans: list[TransformationPlan], project: Project) -> None:
    files = render_project(project, plans)
    silver = files["models/staging/clients/stg_clients.sql"]
    assert "materialized='incremental'" in silver
    assert "unique_key='id'" in silver
    assert "on_schema_change='append_new_columns'" in silver
    assert "where _reject_reason is null" in silver

    checked = files["models/staging/clients/stg_clients__checked.sql"]
    assert "{{ forja_unprocessed_rows('stg_clients') }}" in checked
    assert "partition by _row_hash" in checked
    assert "try_strptime(date_inscription__raw, '%d/%m/%Y')" in checked
    assert "'date_inscription : valeur non convertible en date (JJ/MM/AAAA)'" in checked
    assert "'email : format d''email invalide'" in checked
    assert "nullif(trim(\"prénom\"), '') as prenom__raw" in checked

    rejects = files["models/staging/clients/stg_clients__rejects.sql"]
    assert "where _reject_reason is not null" in rejects
    assert "unique_key" not in rejects


def test_schema_tests_and_contracts(plans: list[TransformationPlan], project: Project) -> None:
    schema = yaml.safe_load(render_project(project, plans)["models/staging/schema.yml"])
    models = {m["name"]: m for m in schema["models"]}

    clients = models["stg_clients"]
    assert clients["config"]["contract"]["enforced"] is True
    columns = {c["name"]: c for c in clients["columns"]}
    assert columns["id"]["data_tests"] == ["unique", "not_null"]
    assert columns["id"]["data_type"] == "bigint"
    assert columns["date_inscription"]["data_type"] == "date"
    assert columns["_ingested_at"]["data_type"] == "timestamp with time zone"
    assert "data_tests" not in columns["commentaire"]  # free text: no accepted_values
    assert "JJ/MM/AAAA" in columns["date_inscription"]["description"]
    assert "6,2 % de valeurs nulles" in columns["email"]["description"]

    orders = models["stg_ventes__commandes"]
    assert orders["data_tests"] == [
        {"forja_unique_combination": {"arguments": {"columns": ["order_id", "line_no"]}}}
    ]
    assert models["stg_clients__rejects"]["columns"][-6]["name"] == "_reject_reason"


def test_accepted_values_on_low_cardinality_codes(
    ingestion: IngestionService, catalog: Catalog, project: Project, tmp_path: Path
) -> None:
    path = tmp_path / "commandes.csv"
    rows = "\n".join(f"{i};{'ouvert' if i % 3 else 'clos'}" for i in range(1, 31))
    path.write_text(f"id;statut\n{rows}\n", encoding="utf-8")
    [source] = ingestion.ingest_file(project.id, path, path.name)
    plan = catalog.get_plan(source.id)
    statut = next(c for c in plan.columns if c.source_column == "statut")
    assert statut.accepted_values == ["clos", "ouvert"]


def test_generation_is_idempotent(
    plans: list[TransformationPlan], project: Project, workspace: Workspace
) -> None:
    generator = DbtProjectGenerator(workspace)
    first = generator.generate(project, plans)
    assert first.changed and len(first.written) == 15

    snapshot = {p: p.read_bytes() for p in first.path.rglob("*") if p.is_file()}
    second = generator.generate(project, plans)
    assert not second.changed
    assert second.written == [] and second.removed == []
    assert {p: p.read_bytes() for p in first.path.rglob("*") if p.is_file()} == snapshot


def test_regeneration_updates_and_removes_files(
    plans: list[TransformationPlan],
    project: Project,
    workspace: Workspace,
    plan_service: PlanService,
    catalog: Catalog,
) -> None:
    generator = DbtProjectGenerator(workspace)
    generator.generate(project, plans)

    clients = next(p for p in plans if p.source_name == "clients")
    plan_service.patch(
        clients.source_id, PlanPatch(columns={"commentaire": ColumnPatch(included=False)})
    )
    plan_service.approve(clients.source_id)
    updated = generator.generate(project, catalog.effective_plans(project.id))
    assert "models/staging/clients/stg_clients.sql" in updated.written
    assert "models/staging/ventes__magasins/stg_ventes__magasins.sql" not in updated.written

    only_clients = [p for p in catalog.effective_plans(project.id) if p.source_name == "clients"]
    pruned = generator.generate(project, only_clients)
    assert "models/staging/ventes__magasins/stg_ventes__magasins.sql" in pruned.removed
    assert not (updated.path / "models/staging/ventes__magasins").exists()


@pytest.mark.parametrize(
    ("name", "expected"),
    [("id", "id"), ("order", '"order"'), ("select", '"select"'), ("prénom", '"prénom"')],
)
def test_identifiers_are_quoted_when_needed(name: str, expected: str) -> None:
    assert ident(name) == expected
