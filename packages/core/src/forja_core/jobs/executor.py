"""Execution of one job: status transitions, logs, metrics and type-specific work."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from datetime import datetime

from forja_core.catalog import Catalog
from forja_core.errors import ForjaError, SourceNotFoundError
from forja_core.ingestion.service import IngestedVersion
from forja_core.jobs.models import Job, JobStatus, JobType, RunMetrics, RunRequest
from forja_core.logging import get_logger
from forja_core.profiling.profiler import Profiler
from forja_core.relations.detector import RelationDetector
from forja_core.serving import Publisher
from forja_core.silver.build import SilverBuilder, SilverBuildError
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from forja_core.utils import utcnow

log = get_logger(__name__)

Handler = Callable[[Job, Callable[[str], None]], RunMetrics]


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
    ) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.profiler = profiler
        self.plans = plans
        self.builder = builder
        self.publisher = publisher
        self.relations = relations
        self.handlers: dict[JobType, Handler] = {
            JobType.PROFILE: self._profile,
            JobType.BUILD_SILVER: self._build_silver,
            JobType.EXPORT: self._export,
        }

    def register(self, job_type: JobType, handler: Handler) -> None:
        self.handlers[job_type] = handler

    def create(self, project_id: str, request: RunRequest) -> Job:
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

        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        self.catalog.save_job(job)
        bound.info("job_started")
        log_line(f"{job.type.value} started")
        started = time.perf_counter()
        try:
            handler = self.handlers.get(job.type)
            if handler is None:
                raise ForjaError(f"no handler registered for '{job.type.value}' runs")
            job.metrics = handler(job, log_line)
            job.status = JobStatus.SUCCEEDED
        except SilverBuildError as exc:
            job.metrics = exc.metrics
            job.status = JobStatus.FAILED
            job.error = exc.message
        except ForjaError as exc:
            job.status = JobStatus.FAILED
            job.error = exc.message
        except Exception as exc:
            bound.exception("job_crashed")
            job.status = JobStatus.FAILED
            job.error = f"unexpected error: {type(exc).__name__}: {exc}"

        duration = round(time.perf_counter() - started, 3)
        job.metrics = job.metrics or RunMetrics()
        job.metrics.duration_seconds = duration
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
        for source_id in self._source_ids(job):
            source = self.catalog.get_source(source_id)
            version = self.catalog.list_versions(source_id)[-1]
            report = self.profiler.profile(
                source_id=source.id,
                source_name=source.name,
                parquet_path=self.workspace.resolve(version.bronze_path),
                version_id=version.id,
                version=version.version,
            )
            self.catalog.save_profile(report)
            self.plans.on_version_ingested(
                IngestedVersion(source=source, version=version, profile=report)
            )
            metrics.profiled_sources += 1
            log_line(
                f"{source.name} v{version.version}: quality score {report.quality.score}, "
                f"{len(report.pii)} PII column(s)"
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
