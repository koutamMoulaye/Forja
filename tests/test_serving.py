from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import duckdb
import pyarrow.csv as pacsv
import pyarrow.parquet as pq
import pytest

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.jobs.models import ExportFormat, Job, JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate
from forja_core.privacy import pseudonymize
from forja_core.silver.plan import ColumnPatch, PiiTreatment, PlanPatch
from tests.fixtures import generate as fx


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[AppState, Project]]:
    """One Silver build shared by the tests of this module (dbt takes a few seconds)."""
    root = tmp_path_factory.mktemp("serving")
    settings = Settings(
        data_dir=root / "data",
        secrets_dir=root / "secrets",
        log_format="console",
        log_level="WARNING",
        job_runner="inline",
    )
    state = AppState.build(settings)
    project = state.catalog.create_project(ProjectCreate(name="Clients Démo"))
    fixtures = Path(fx.FIXTURES_DIR)
    [source] = state.ingestion.ingest_file(project.id, fixtures / fx.CLIENTS_V1, "clients.csv")
    state.plans.approve(source.id)
    job = _run(state, project, RunRequest(type=JobType.BUILD_SILVER))
    assert job.status is JobStatus.SUCCEEDED, state.catalog.job_logs(job.id)
    yield state, project
    state.close()


def _run(state: AppState, project: Project, request: RunRequest) -> Job:
    job = state.executor.create(project.id, request)
    state.runner.submit(job.id)
    return state.catalog.get_job(job.id)


def test_export_job_publishes_serving_database(built: tuple[AppState, Project]) -> None:
    state, project = built
    [table] = state.catalog.list_tables(project.id)
    assert not table.publish  # Silver tables are only published on request
    state.catalog.set_table_publication(table.id, True)
    job = _run(state, project, RunRequest(type=JobType.EXPORT))
    assert job.status is JobStatus.SUCCEEDED, state.catalog.job_logs(job.id)
    assert job.metrics is not None
    assert job.metrics.serving_path == f"{project.id}/serving/clients_demo.duckdb"
    assert sorted(e.format for e in job.metrics.exports) == [ExportFormat.CSV, ExportFormat.PARQUET]

    serving = state.workspace.resolve(job.metrics.serving_path)
    salt = state.publisher.secrets.salt(project.id)
    with duckdb.connect(str(serving), read_only=True) as con:
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
        assert tables == {"clients", "_forja_tables"}
        columns = [row[0] for row in con.execute("DESCRIBE clients").fetchall()]
        assert not any(c.startswith("_") for c in columns)
        [(count,)] = con.execute("SELECT count(*) FROM clients").fetchall()
        [(email,)] = con.execute("SELECT email FROM clients WHERE id = 1").fetchall()
        [(meta,)] = con.execute("SELECT treated_columns FROM _forja_tables").fetchall()
    assert count == fx.CLIENTS_V1_VALID
    assert email == pseudonymize("jean.dupont@example.fr", salt)
    assert "email:hash" in meta and "iban:hash" in meta


def test_csv_export_is_utf8_with_semicolons(built: tuple[AppState, Project]) -> None:
    state, project = built
    [table] = state.catalog.list_tables(project.id)
    target = state.workspace.project_dir(project.id) / "exports" / "test.csv"
    exported = state.publisher.export(table, ExportFormat.CSV, target)
    assert exported.rows == fx.CLIENTS_V1_VALID

    text = target.read_bytes().decode("utf-8")
    header = text.splitlines()[0]
    assert header.split(";")[:3] == ['"id"', '"nom"', '"prenom"']
    assert "Client fidèle" in text  # non-PII text is kept as is
    assert "jean.dupont@example.fr" not in text
    parsed = pacsv.read_csv(target, parse_options=pacsv.ParseOptions(delimiter=";"))
    assert parsed.num_rows == fx.CLIENTS_V1_VALID

    comma = state.publisher.export(table, ExportFormat.CSV, target, delimiter=",")
    assert Path(comma.path).read_text(encoding="utf-8").splitlines()[0].count(",") > 5


def test_treatment_override_applies_without_rebuild(built: tuple[AppState, Project]) -> None:
    state, project = built
    [table] = state.catalog.list_tables(project.id)
    state.plans.patch(
        table.source_id,
        PlanPatch(
            columns={
                "email": ColumnPatch(pii_treatment=PiiTreatment.MASK),
                "iban": ColumnPatch(pii_treatment=PiiTreatment.DROP),
                "nom": ColumnPatch(pii_treatment=PiiTreatment.NONE),
            }
        ),
    )
    state.plans.approve(table.source_id)

    target = state.workspace.project_dir(project.id) / "exports" / "override.parquet"
    state.publisher.export(table, ExportFormat.PARQUET, target)
    rows = {r["id"]: r for r in pq.read_table(target).to_pylist()}
    assert "iban" not in rows[1]
    assert rows[1]["email"] == "j***@example.fr"
    assert rows[1]["nom"] == "Dupont"
    assert rows[1]["prenom"] == pseudonymize("Jean", state.publisher.secrets.salt(project.id))


def test_table_preview_treats_personal_data(built: tuple[AppState, Project]) -> None:
    state, project = built
    [table] = state.catalog.list_tables(project.id)
    assert len(state.publisher.preview(table, 3).rows) == 3
    preview = state.publisher.preview(table, 100)
    assert preview.total_rows == len(preview.rows) == fx.CLIENTS_V1_VALID
    assert not any(c.startswith("_") for c in preview.columns)
    first = next(r for r in preview.rows if r["id"] == 1)
    assert first["email"] != "jean.dupont@example.fr"
    assert first["code_postal"] is not None  # non-personal data is shown as is


def test_export_api(built: tuple[AppState, Project]) -> None:
    from fastapi.testclient import TestClient

    from forja_api.main import create_app

    state, project = built
    [table] = state.catalog.list_tables(project.id)
    state.close()  # the API process opens the same catalog
    try:
        with TestClient(create_app(state.settings)) as client:
            listed = client.get(f"/projects/{project.id}/tables").json()
            assert [t["id"] for t in listed] == [table.id]
            assert client.get(f"/tables/{table.id}").json()["name"] == "stg_clients"

            response = client.get(f"/tables/{table.id}/export", params={"format": "csv"})
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/csv")
            assert 'filename="clients.csv"' in response.headers["content-disposition"]
            assert response.content.decode("utf-8").startswith('"id";"nom"')

            parquet = client.get(f"/tables/{table.id}/export", params={"format": "parquet"})
            assert parquet.status_code == 200
            assert parquet.content[:4] == b"PAR1"
            assert client.get("/tables/missing/export").status_code == 404
            preview = client.get(f"/tables/{table.id}/preview", params={"limit": 2}).json()
            assert preview["limit"] == 2 and len(preview["rows"]) == 2
            assert "jean.dupont@example.fr" not in str(preview)
            exports = state.publisher.exports_dir(project.id)
            assert not any(p.name.startswith(".") for p in exports.iterdir())
    finally:
        state.catalog = type(state.catalog)(state.settings.catalog_path)
