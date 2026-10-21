from __future__ import annotations

from collections.abc import Callable, Iterator
from pathlib import Path

import duckdb
import pytest

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.errors import SourceNotFoundError
from forja_core.jobs.models import Job, JobStatus, JobType, RunMetrics, RunRequest
from forja_core.jobs.runner import InlineJobRunner, ThreadJobRunner
from forja_core.models import Project, ProjectCreate
from forja_core.silver.build import requires_full_refresh
from forja_core.silver.plan import ColumnPatch, PlanPatch, PlanStatus
from tests.fixtures import generate as fx


@pytest.fixture
def state(settings: Settings) -> Iterator[AppState]:
    app_state = AppState.build(settings.model_copy(update={"job_runner": "inline"}))
    yield app_state
    app_state.close()


@pytest.fixture
def demo(state: AppState) -> Project:
    return state.catalog.create_project(ProjectCreate(name="Clients"))


def _run(state: AppState, project: Project, request: RunRequest) -> Job:
    job = state.executor.create(project.id, request)
    state.runner.submit(job.id)
    return state.catalog.get_job(job.id)


def _ingest(state: AppState, project: Project, fixtures_dir: Path, name: str) -> str:
    [source] = state.ingestion.ingest_file(project.id, fixtures_dir / name, "clients.csv")
    return source.id


def test_build_without_approved_plan_fails(
    state: AppState, demo: Project, fixtures_dir: Path
) -> None:
    _ingest(state, demo, fixtures_dir, fx.CLIENTS_V1)
    job = _run(state, demo, RunRequest(type=JobType.BUILD_SILVER))
    assert job.status is JobStatus.FAILED
    assert job.error is not None and "approve a plan first" in job.error
    assert "build_silver failed" in state.catalog.job_logs(job.id)


def test_build_silver_routes_rows_and_measures(
    state: AppState, demo: Project, fixtures_dir: Path
) -> None:
    source_id = _ingest(state, demo, fixtures_dir, fx.CLIENTS_V1)
    state.plans.approve(source_id)

    job = _run(state, demo, RunRequest(type=JobType.BUILD_SILVER))
    assert job.status is JobStatus.SUCCEEDED, state.catalog.job_logs(job.id)
    metrics = job.metrics
    assert metrics is not None
    assert metrics.rows_read == fx.CLIENTS_V1_ROWS
    assert metrics.duplicates_removed == len(fx.FR_DUPLICATED_INDEXES)
    assert metrics.rows_rejected == fx.CLIENTS_V1_REJECTED
    assert metrics.rows_valid == fx.CLIENTS_V1_VALID
    assert metrics.duration_seconds > 0
    tests = metrics.dbt_tests
    assert tests is not None
    assert tests.failed == 0 and tests.errored == 0 and tests.passed >= 4
    assert {r.model for r in tests.results} >= {"stg_clients", "stg_clients__rejects"}

    assert state.catalog.get_plan(source_id).status is PlanStatus.APPLIED
    [table] = state.catalog.list_tables(demo.id)
    assert table.name == "stg_clients"
    assert table.row_count == fx.CLIENTS_V1_VALID
    assert table.rejected_count == fx.CLIENTS_V1_REJECTED

    warehouse = state.generator.warehouse_path(demo.id)
    with duckdb.connect(str(warehouse), read_only=True) as con:
        reasons = dict(
            con.execute(
                "SELECT coalesce(id, '<vide>'), _reject_reason FROM stg_clients__rejects"
            ).fetchall()
        )
        [(missing_batch,)] = con.execute(
            "SELECT count(*) FROM stg_clients__rejects WHERE _batch_id IS NULL"
        ).fetchall()
    assert reasons["6"] == "email : format d'email invalide"
    assert reasons["9"] == "date_inscription : valeur non convertible en date (JJ/MM/AAAA)"
    assert reasons["<vide>"] == "id : clé primaire manquante"
    assert reasons["21"] == "clé primaire en double dans le lot"
    assert missing_batch == 0

    logs = state.catalog.job_logs(job.id)
    assert "dbt build --select stg_clients stg_clients__rejects" in logs
    assert "Completed successfully" in logs

    again = _run(state, demo, RunRequest(type=JobType.BUILD_SILVER))
    assert again.metrics is not None
    assert again.metrics.rows_read == 0
    assert again.metrics.sources[0].rows_already_processed == fx.CLIENTS_V1_ROWS


def test_profile_job(state: AppState, demo: Project, fixtures_dir: Path) -> None:
    _ingest(state, demo, fixtures_dir, fx.CLIENTS_V1)
    job = _run(state, demo, RunRequest(type=JobType.PROFILE))
    assert job.status is JobStatus.SUCCEEDED
    assert job.metrics is not None and job.metrics.profiled_sources == 1
    assert "quality score" in state.catalog.job_logs(job.id)


def test_run_on_source_of_another_project(
    state: AppState, demo: Project, fixtures_dir: Path
) -> None:
    source_id = _ingest(state, demo, fixtures_dir, fx.CLIENTS_V1)
    other = state.catalog.create_project(ProjectCreate(name="Autre"))
    with pytest.raises(SourceNotFoundError):
        state.executor.create(other.id, RunRequest(type=JobType.PROFILE, source_ids=[source_id]))


def test_handler_crash_marks_job_failed(state: AppState, demo: Project) -> None:
    def crash(_job: Job, _log: Callable[[str], None]) -> RunMetrics:
        raise RuntimeError("boom")

    state.executor.register(JobType.EXPORT, crash)
    job = _run(state, demo, RunRequest(type=JobType.EXPORT))
    assert job.status is JobStatus.FAILED
    assert job.error == "unexpected error: RuntimeError: boom"
    assert job.started_at is not None and job.finished_at is not None


def test_thread_runner_executes_in_background(state: AppState, demo: Project) -> None:
    seen: list[str] = []

    def record(job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        log_line("working")
        seen.append(job.id)
        return RunMetrics(profiled_sources=7)

    state.executor.register(JobType.PROFILE, record)
    runner = ThreadJobRunner(state.executor)
    queued = [state.executor.create(demo.id, RunRequest(type=JobType.PROFILE)) for _ in range(3)]
    runner.start()  # picks up jobs queued before it started
    runner.join()
    runner.stop(timeout=5)

    assert seen == [job.id for job in queued]
    for job in queued:
        done = state.catalog.get_job(job.id)
        assert done.status is JobStatus.SUCCEEDED
        assert done.metrics is not None and done.metrics.profiled_sources == 7
        assert "working" in state.catalog.job_logs(job.id)


def test_interrupted_jobs_are_failed_on_start(state: AppState, demo: Project) -> None:
    job = state.executor.create(demo.id, RunRequest(type=JobType.PROFILE))
    job.status = JobStatus.RUNNING
    state.catalog.save_job(job)

    runner = ThreadJobRunner(state.executor)
    runner.start()
    runner.stop(timeout=5)
    failed = state.catalog.get_job(job.id)
    assert failed.status is JobStatus.FAILED
    assert failed.error is not None and failed.error.startswith("interrupted")
    assert isinstance(state.runner, InlineJobRunner)


def test_full_refresh_only_when_existing_columns_change(
    state: AppState, demo: Project, fixtures_dir: Path
) -> None:
    source_id = _ingest(state, demo, fixtures_dir, fx.CLIENTS_V1)
    applied = state.plans.approve(source_id)
    renamed = state.plans.patch(
        source_id, PlanPatch(columns={"nom": ColumnPatch(target_column="nom_famille")})
    )
    assert requires_full_refresh(applied, renamed)
    assert not requires_full_refresh(applied, applied)

    state.ingestion.ingest_file(demo.id, fixtures_dir / fx.CLIENTS_V2, "clients.csv")
    with_segment = state.catalog.get_plan(source_id)
    assert with_segment.column("segment") is not None
    # The refreshed plan is based on the latest version, which carries the rename.
    assert not requires_full_refresh(renamed, with_segment)
