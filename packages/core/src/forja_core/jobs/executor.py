"""Execution of one job: status transitions, logs, metrics and type-specific work."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from datetime import datetime

from forja_core.catalog import Catalog
from forja_core.errors import ConflictError, ForjaError, SourceNotFoundError
from forja_core.gold.build import GoldBuilder, gold_inputs
from forja_core.gold.service import GoldPlanService
from forja_core.ingestion.service import IngestedVersion
from forja_core.jobs.errors import RunFailedError
from forja_core.jobs.models import (
    DbtTestSummary,
    Job,
    JobProgress,
    JobStatus,
    JobType,
    LLMUsage,
    RunMetrics,
    RunRequest,
)
from forja_core.jobs.scope import (
    JobCancelledError,
    JobScope,
    item_finished,
    item_started,
    job_scope,
    report,
    stage,
)
from forja_core.logging import get_logger
from forja_core.profiling.profiler import Profiler
from forja_core.relations.detector import RelationDetector
from forja_core.serving import Publisher
from forja_core.silver.build import SilverBuilder
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from forja_core.utils import utcnow

log = get_logger(__name__)

Handler = Callable[[Job, Callable[[str], None]], RunMetrics]

# Executions of an interrupted LLM job before it is given up (see recover_interrupted_jobs).
MAX_LLM_JOB_ATTEMPTS = 3


class JobExecutor:
    def __init__(
        self,
        catalog: Catalog,
        workspace: Workspace,
        profiler: Profiler,
        plans: PlanService,
        builder: SilverBuilder,
        publisher: Publisher,
        relations: RelationDetector,
        gold_builder: GoldBuilder | None = None,
        gold: GoldPlanService | None = None,
    ) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.profiler = profiler
        self.plans = plans
        self.builder = builder
        self.publisher = publisher
        self.relations = relations
        self.gold_builder = gold_builder
        self.gold = gold or (gold_builder.gold if gold_builder else None)
        self.handlers: dict[JobType, Handler] = {
            JobType.PROFILE: self._profile,
            JobType.BUILD_SILVER: self._build_silver,
            JobType.EXPORT: self._export,
            JobType.BUILD_GOLD: self._build_gold,
            JobType.GOLD_PROPOSAL: self._gold_proposal,
            JobType.BUILD_ALL: self._build_all,
        }
        self._scopes: dict[str, JobScope] = {}
        self.after_success: list[Callable[[Job, Callable[[str], None]], None]] = []

    def register(self, job_type: JobType, handler: Handler) -> None:
        self.handlers[job_type] = handler

    def cancel(self, job_id: str) -> Job:
        """Cancel a queued job, or a running LLM job (builds cannot stop half-way)."""
        job = self.catalog.get_job(job_id)
        if job.status.finished:
            raise ConflictError(
                f"run '{job_id}' is already {job.status.value}",
                details={"status": job.status.value},
            )
        if job.status is JobStatus.RUNNING and not job.type.uses_llm:
            raise ConflictError(
                f"a running {job.type.value} cannot be cancelled: dbt is writing the warehouse",
                details={"type": job.type.value},
            )
        job = self.catalog.request_job_cancel(job_id)
        scope = self._scopes.get(job_id)
        if scope is not None:
            scope.cancelled.set()
        log.info("job_cancel_requested", job_id=job_id, status=job.status.value)
        return job

    def create(self, project_id: str, request: RunRequest, *, created_by: str | None = None) -> Job:
        self.catalog.get_project(project_id)
        for source_id in request.source_ids or []:
            source = self.catalog.get_source(source_id)
            if source.project_id != project_id:
                raise SourceNotFoundError(
                    f"source '{source_id}' not found in project '{project_id}'"
                )
        job = Job(
            id=uuid.uuid4().hex,
            project_id=project_id,
            type=request.type,
            status=JobStatus.QUEUED,
            params=request,
            created_at=utcnow(),
            created_by=created_by,
        )
        self.catalog.add_job(job)
        log.info("job_queued", job_id=job.id, project_id=project_id, type=job.type.value)
        return job

    def execute(self, job_id: str) -> Job:
        job = self.catalog.get_job(job_id)
        if job.status is not JobStatus.QUEUED:
            return job
        bound = log.bind(job_id=job.id, project_id=job.project_id, type=job.type.value)

        def log_line(message: str) -> None:
            stamp = datetime.now().astimezone().strftime("%H:%M:%S")
            self.catalog.append_job_log(job.id, f"[{stamp}] {message}\n")

        def on_progress(progress: JobProgress, log: bool) -> None:
            job.progress = progress.model_copy(update={"updated_at": utcnow()})
            self.catalog.save_job_progress(job.id, job.progress)
            if log:
                log_line(f"[{progress.step}] {progress.message}")

        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        job.attempts += 1
        job.error = None
        self.catalog.save_job(job)
        bound.info("job_started", attempt=job.attempts)
        attempt = f" (attempt {job.attempts})" if job.attempts > 1 else ""
        log_line(f"{job.type.value} started{attempt}")
        started = time.perf_counter()
        scope = JobScope(job_id=job.id, project_id=job.project_id, on_progress=on_progress)
        self._scopes[job.id] = scope
        if self.catalog.job_cancel_requested(job.id):
            scope.cancelled.set()
        try:
            handler = self.handlers.get(job.type)
            if handler is None:
                raise ForjaError(f"no handler registered for '{job.type.value}' runs")
            with job_scope(scope):
                scope.check()
                job.metrics = handler(job, log_line)
                scope.check()
                scope.complete()
            job.status = JobStatus.SUCCEEDED
            # Follow-up work (the semantic layer after build_gold) is done before the run is
            # reported finished; its failure is logged, it does not fail the run.
            for callback in self.after_success:
                try:
                    callback(job, log_line)
                except Exception as exc:
                    bound.exception("job_callback_failed")
                    log_line(f"warning: follow-up step failed: {type(exc).__name__}: {exc}")
        except JobCancelledError:
            job.status = JobStatus.CANCELLED
            job.error = "cancelled"
        except RunFailedError as exc:
            job.metrics = exc.metrics
            job.status = JobStatus.FAILED
            job.error = exc.message
        except ForjaError as exc:
            job.status = JobStatus.FAILED
            job.error = exc.message
        except Exception as exc:
            if scope.cancelled.is_set():
                job.status, job.error = JobStatus.CANCELLED, "cancelled"
            else:
                bound.exception("job_crashed")
                job.status = JobStatus.FAILED
                job.error = f"unexpected error: {type(exc).__name__}: {exc}"
        finally:
            self._scopes.pop(job.id, None)

        duration = round(time.perf_counter() - started, 3)
        job.metrics = job.metrics or RunMetrics()
        job.metrics.duration_seconds = duration
        job.metrics.llm_calls = [
            LLMUsage(
                purpose=call.purpose,
                provider=call.provider,
                model=call.model,
                status=call.status,
                cached=call.status == "cached",
                attempts=call.attempts,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                duration_ms=call.duration_ms,
            )
            for call in self.catalog.list_llm_calls(job.project_id, job_id=job.id)
        ]
        job.finished_at = utcnow()
        log_line(
            f"{job.type.value} {job.status.value} in {duration:.1f} s"
            + (f": {job.error}" if job.error else "")
        )
        self.catalog.save_job(job)
        bound.info("job_finished", status=job.status.value, duration_s=duration, error=job.error)
        return job

    def _source_ids(self, job: Job) -> list[str]:
        if job.params.source_ids is not None:
            return list(job.params.source_ids)
        return [s.id for s in self.catalog.list_sources(job.project_id)]

    def _profile(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        metrics = RunMetrics()
        source_ids = self._source_ids(job)
        for index, source_id in enumerate(source_ids):
            source = self.catalog.get_source(source_id)
            report("profile", f"profilage de {source.name}", 100 * index // len(source_ids))
            item_started(source.id)
            version = self.catalog.list_versions(source_id)[-1]
            profile = self.profiler.profile(
                source_id=source.id,
                source_name=source.name,
                parquet_path=self.workspace.resolve(version.bronze_path),
                version_id=version.id,
                version=version.version,
            )
            self.catalog.save_profile(profile)
            self.plans.on_version_ingested(
                IngestedVersion(source=source, version=version, profile=profile)
            )
            metrics.profiled_sources += 1
            item_finished(source.id, ok=True)
            log_line(
                f"{source.name} v{version.version}: quality score {profile.quality.score}, "
                f"{len(profile.pii)} PII column(s)"
            )
        return metrics

    def _build_silver(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        metrics = self.builder.build(
            job.project_id,
            run_id=job.id,
            source_ids=job.params.source_ids,
            full_refresh=job.params.full_refresh,
            log_line=log_line,
        )
        for source in metrics.sources:
            log_line(
                f"{source.model}: {source.rows_read} read, {source.rows_valid} valid, "
                f"{source.rows_rejected} rejected, {source.duplicates_removed} duplicate(s) removed"
            )
        relations = self.relations.detect(job.project_id, log_line)
        metrics.relations_detected = len(relations)
        return metrics

    def _export(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        """Publish every built table to the serving database and write export files."""
        serving = self.publisher.publish(job.project_id, log_line)
        exports = self.publisher.export_all(
            job.project_id, list(job.params.formats), job.params.csv_delimiter, log_line
        )
        return RunMetrics(serving_path=self.workspace.relative(serving), exports=exports)

    def _gold_proposal(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        if self.gold is None:
            raise ForjaError("Gold proposals are not configured")
        plan = self.gold.propose(job.project_id, use_llm=job.params.use_llm)
        job.result = {
            "gold_plan_version": plan.version,
            "origin": plan.origin,
            "errors": len(plan.errors),
            "warnings": plan.warnings,
        }
        log_line(f"Gold plan v{plan.version} proposed by {plan.origin}: {plan.summary}")
        return RunMetrics()

    def _build_all(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        """Silver, then Gold, then the serving database and exports, as far as plans allow."""
        metrics = RunMetrics()
        if self.catalog.effective_plans(job.project_id):
            with stage(0, 45):
                report("silver", "nettoyage des sources", 0)
                metrics = self._build_silver(job, log_line)
        else:
            log_line("no approved Silver plan: cleaning skipped")
        if self.gold_builder is not None and gold_inputs(self.catalog, job.project_id):
            with stage(45, 90):
                report("gold", "construction du modèle en étoile", 0)
                gold = self._build_gold(job, log_line)
            metrics.models = gold.models
            metrics.unknown_member_rows = gold.unknown_member_rows
            metrics.dbt_tests = _merge_tests(metrics.dbt_tests, gold.dbt_tests)
        else:
            log_line("no approved Gold plan matching the Silver tables: model skipped")
        if self.publisher.published_tables(job.project_id):
            with stage(90, 100):
                report("serving", "publication et exports", 0)
                served = self._export(job, log_line)
            metrics.serving_path, metrics.exports = served.serving_path, served.exports
        else:
            log_line("no published table: serving skipped")
        return metrics

    def _build_gold(self, job: Job, log_line: Callable[[str], None]) -> RunMetrics:
        if self.gold_builder is None:
            raise ForjaError("Gold builds are not configured")
        metrics = self.gold_builder.build(job.project_id, run_id=job.id, log_line=log_line)
        for model in metrics.models:
            log_line(f"{model.name}: {model.rows} row(s)")
        for unknown in metrics.unknown_member_rows:
            if unknown.rows:
                log_line(
                    f"{unknown.fact}.{unknown.key}: {unknown.rows} row(s) attached to the "
                    f"unknown member of {unknown.dimension}"
                )
        return metrics


def _merge_tests(
    first: DbtTestSummary | None, second: DbtTestSummary | None
) -> DbtTestSummary | None:
    if first is None or second is None:
        return first or second
    return DbtTestSummary(
        passed=first.passed + second.passed,
        failed=first.failed + second.failed,
        warned=first.warned + second.warned,
        errored=first.errored + second.errored,
        skipped=first.skipped + second.skipped,
        results=first.results + second.results,
    )
