"""Persistence of jobs and of the registry of built Silver tables."""

from __future__ import annotations

import json
from typing import Any

from forja_core.catalog.base import from_db_timestamp, from_db_timestamp_required, to_db_timestamp
from forja_core.catalog.plans import PlansMixin
from forja_core.errors import JobNotFoundError, TableNotFoundError
from forja_core.jobs.models import Job, JobProgress, JobStatus, JobType, RunMetrics, RunRequest
from forja_core.models import ColumnSchema
from forja_core.silver.tables import TableLayer, WarehouseTable
from forja_core.utils import utcnow

_JOB_COLUMNS = (
    "id, project_id, type, status, params, metrics, error, created_at, started_at, finished_at, "
    "created_by, progress, result, attempts, cancel_requested"
)
_INTERRUPTED = "interrupted: the worker stopped before the run finished"
_TABLE_COLUMNS = (
    "id, project_id, source_id, name, plan_version, row_count, rejected_count, columns, "
    "built_at, last_run_id, layer, publish, owner_id"
)


def _job(row: tuple[Any, ...]) -> Job:
    return Job(
        id=row[0],
        project_id=row[1],
        type=row[2],
        status=row[3],
        params=RunRequest.model_validate_json(row[4]),
        metrics=None if row[5] is None else RunMetrics.model_validate_json(row[5]),
        error=row[6],
        created_at=from_db_timestamp_required(row[7]),
        started_at=from_db_timestamp(row[8]),
        finished_at=from_db_timestamp(row[9]),
        created_by=row[10],
        progress=None if row[11] is None else JobProgress.model_validate_json(row[11]),
        result=None if row[12] is None else json.loads(row[12]),
        attempts=row[13] or 0,
        cancel_requested=bool(row[14]),
    )


def _table(row: tuple[Any, ...]) -> WarehouseTable:
    return WarehouseTable(
        id=row[0],
        project_id=row[1],
        source_id=row[2],
        name=row[3],
        plan_version=row[4],
        row_count=row[5],
        rejected_count=row[6],
        columns=[ColumnSchema.model_validate(c) for c in json.loads(row[7])],
        built_at=from_db_timestamp_required(row[8]),
        last_run_id=row[9],
        layer=row[10] or TableLayer.SILVER,
        publish=bool(row[11]),
        owner_id=row[12],
    )


class JobsMixin(PlansMixin):
    def add_job(self, job: Job) -> None:
        self._execute(
            f"INSERT INTO jobs ({_JOB_COLUMNS}, logs) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')",
            [
                job.id,
                job.project_id,
                job.type.value,
                job.status.value,
                job.params.model_dump_json(),
                None if job.metrics is None else job.metrics.model_dump_json(),
                job.error,
                to_db_timestamp(job.created_at),
                to_db_timestamp(job.started_at),
                to_db_timestamp(job.finished_at),
                job.created_by,
                None if job.progress is None else job.progress.model_dump_json(),
                None if job.result is None else json.dumps(job.result, ensure_ascii=False),
                job.attempts,
                job.cancel_requested,
            ],
        )

    def save_job(self, job: Job) -> None:
        self._execute(
            "UPDATE jobs SET status = ?, metrics = ?, error = ?, started_at = ?, finished_at = ?, "
            "progress = ?, result = ?, attempts = ? WHERE id = ?",
            [
                job.status.value,
                None if job.metrics is None else job.metrics.model_dump_json(),
                job.error,
                to_db_timestamp(job.started_at),
                to_db_timestamp(job.finished_at),
                None if job.progress is None else job.progress.model_dump_json(),
                None if job.result is None else json.dumps(job.result, ensure_ascii=False),
                job.attempts,
                job.id,
            ],
        )

    def save_job_progress(self, job_id: str, progress: JobProgress) -> None:
        self._execute(
            "UPDATE jobs SET progress = ? WHERE id = ?", [progress.model_dump_json(), job_id]
        )

    def request_job_cancel(self, job_id: str) -> Job:
        """Cancel a queued job at once; flag a running one, which stops at its next check."""
        with self._lock:
            job = self.get_job(job_id)
            if job.status is JobStatus.QUEUED:
                self._execute(
                    "UPDATE jobs SET status = ?, cancel_requested = true, error = ?, "
                    "finished_at = ? WHERE id = ?",
                    [JobStatus.CANCELLED.value, "cancelled", to_db_timestamp(utcnow()), job_id],
                )
            elif job.status is JobStatus.RUNNING:
                self._execute("UPDATE jobs SET cancel_requested = true WHERE id = ?", [job_id])
            return self.get_job(job_id)

    def job_cancel_requested(self, job_id: str) -> bool:
        row = self._fetchone("SELECT cancel_requested FROM jobs WHERE id = ?", [job_id])
        return bool(row and row[0])

    def append_job_log(self, job_id: str, text: str) -> None:
        self._execute("UPDATE jobs SET logs = logs || ? WHERE id = ?", [text, job_id])

    def get_job(self, job_id: str) -> Job:
        row = self._fetchone(f"SELECT {_JOB_COLUMNS} FROM jobs WHERE id = ?", [job_id])
        if row is None:
            raise JobNotFoundError(f"run '{job_id}' not found")
        return _job(row)

    def job_logs(self, job_id: str) -> str:
        row = self._fetchone("SELECT logs FROM jobs WHERE id = ?", [job_id])
        if row is None:
            raise JobNotFoundError(f"run '{job_id}' not found")
        return str(row[0])

    def list_jobs(
        self,
        project_id: str,
        *,
        created_by: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Job]:
        """Runs of a project, newest first; those of one user with ``created_by``."""
        self.get_project(project_id)
        rows = self._fetchall(
            f"SELECT {_JOB_COLUMNS} FROM jobs WHERE project_id = ? "
            "AND (? IS NULL OR created_by = ?) ORDER BY created_at DESC, id "
            "LIMIT ? OFFSET ?",
            [project_id, created_by, created_by, limit, offset],
        )
        return [_job(row) for row in rows]

    def count_jobs(self, project_id: str, *, created_by: str | None = None) -> int:
        row = self._fetchone(
            "SELECT count(*) FROM jobs WHERE project_id = ? AND (? IS NULL OR created_by = ?)",
            [project_id, created_by, created_by],
        )
        return int(row[0]) if row else 0

    def active_jobs(self, job_type: JobType) -> list[Job]:
        """Queued or running jobs of a type, oldest first."""
        rows = self._fetchall(
            f"SELECT {_JOB_COLUMNS} FROM jobs WHERE type = ? AND status IN (?, ?) "
            "ORDER BY created_at",
            [job_type.value, JobStatus.QUEUED.value, JobStatus.RUNNING.value],
        )
        return [_job(row) for row in rows]

    def queued_job_ids(self) -> list[str]:
        rows = self._fetchall(
            "SELECT id FROM jobs WHERE status = ? ORDER BY created_at", [JobStatus.QUEUED.value]
        )
        return [row[0] for row in rows]

    def recover_interrupted_jobs(self, max_attempts: int) -> tuple[int, int]:
        """Jobs left running by a stopped process (shutdown, crash, machine asleep).

        LLM jobs only read the catalog: they are queued again and restart from the
        beginning, up to ``max_attempts`` executions (answers already received are in
        the LLM cache). Builds may have left a half-written warehouse: they fail.
        Returns (resumed, failed).
        """
        rows = self._fetchall(
            "SELECT id, type, coalesce(attempts, 0), coalesce(cancel_requested, false) "
            "FROM jobs WHERE status = ?",
            [JobStatus.RUNNING.value],
        )
        resumed = failed = 0
        for job_id, job_type, attempts, cancelled in rows:
            if JobType(job_type).uses_llm and not cancelled and attempts < max_attempts:
                self._execute(
                    "UPDATE jobs SET status = ?, started_at = NULL WHERE id = ?",
                    [JobStatus.QUEUED.value, job_id],
                )
                self.append_job_log(job_id, "interrupted: queued again to resume\n")
                resumed += 1
                continue
            self._execute(
                "UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
                [
                    (JobStatus.CANCELLED if cancelled else JobStatus.FAILED).value,
                    "cancelled" if cancelled else _INTERRUPTED,
                    to_db_timestamp(utcnow()),
                    job_id,
                ],
            )
            failed += 1
        return resumed, failed

    def fail_interrupted_jobs(self) -> int:
        """Mark every job left running as failed or cancelled (no resumption)."""
        _, failed = self.recover_interrupted_jobs(max_attempts=0)
        return failed

    def save_table(self, table: WarehouseTable) -> WarehouseTable:
        """Insert or update a Silver table, keeping its id stable across builds."""
        existing = self._fetchone(
            "SELECT id FROM warehouse_tables WHERE project_id = ? AND name = ?",
            [table.project_id, table.name],
        )
        values = [
            table.source_id,
            table.plan_version,
            table.row_count,
            table.rejected_count,
            json.dumps([c.model_dump() for c in table.columns], ensure_ascii=False),
            to_db_timestamp(table.built_at),
            table.last_run_id,
            table.layer.value,
        ]
        if existing is None:
            self._execute(
                f"INSERT INTO warehouse_tables ({_TABLE_COLUMNS}) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    table.id,
                    table.project_id,
                    table.source_id,
                    table.name,
                    *values[1:],
                    table.publish,
                    table.owner_id,
                ],
            )
            return table
        # The publication flag is a decision of the user: a rebuild keeps it.
        self._execute(
            "UPDATE warehouse_tables SET source_id = ?, plan_version = ?, row_count = ?, "
            "rejected_count = ?, columns = ?, built_at = ?, last_run_id = ?, layer = ? "
            "WHERE id = ?",
            [*values, existing[0]],
        )
        stored = self.get_table(existing[0])
        return table.model_copy(update={"id": existing[0], "publish": stored.publish})

    def set_table_publication(self, table_id: str, publish: bool) -> WarehouseTable:
        self.get_table(table_id)
        self._execute("UPDATE warehouse_tables SET publish = ? WHERE id = ?", [publish, table_id])
        return self.get_table(table_id)

    def list_tables(self, project_id: str, layer: TableLayer | None = None) -> list[WarehouseTable]:
        self.get_project(project_id)
        rows = self._fetchall(
            f"SELECT {_TABLE_COLUMNS} FROM warehouse_tables WHERE project_id = ? ORDER BY name",
            [project_id],
        )
        tables = [_table(row) for row in rows]
        return [t for t in tables if layer is None or t.layer is layer]

    def get_table(self, table_id: str) -> WarehouseTable:
        row = self._fetchone(
            f"SELECT {_TABLE_COLUMNS} FROM warehouse_tables WHERE id = ?", [table_id]
        )
        if row is None:
            raise TableNotFoundError(f"table '{table_id}' not found")
        return _table(row)

    def find_table(self, project_id: str, name: str) -> WarehouseTable | None:
        row = self._fetchone(
            f"SELECT {_TABLE_COLUMNS} FROM warehouse_tables WHERE project_id = ? AND name = ?",
            [project_id, name],
        )
        return None if row is None else _table(row)
