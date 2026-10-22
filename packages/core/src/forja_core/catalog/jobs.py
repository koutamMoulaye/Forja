"""Persistence of jobs and of the registry of built Silver tables."""

from __future__ import annotations

import json
from typing import Any

from forja_core.catalog.base import from_db_timestamp, from_db_timestamp_required, to_db_timestamp
from forja_core.catalog.plans import PlansMixin
from forja_core.errors import JobNotFoundError, TableNotFoundError
from forja_core.jobs.models import Job, JobStatus, RunMetrics, RunRequest
from forja_core.models import ColumnSchema
from forja_core.silver.tables import TableLayer, WarehouseTable
from forja_core.utils import utcnow

_JOB_COLUMNS = (
    "id, project_id, type, status, params, metrics, error, created_at, started_at, finished_at"
)
_TABLE_COLUMNS = (
    "id, project_id, source_id, name, plan_version, row_count, rejected_count, columns, "
    "built_at, last_run_id, layer, publish"
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
    )


class JobsMixin(PlansMixin):
    def add_job(self, job: Job) -> None:
        self._execute(
            f"INSERT INTO jobs ({_JOB_COLUMNS}, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')",
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
            ],
        )

    def save_job(self, job: Job) -> None:
        self._execute(
            "UPDATE jobs SET status = ?, metrics = ?, error = ?, started_at = ?, finished_at = ? "
            "WHERE id = ?",
            [
                job.status.value,
                None if job.metrics is None else job.metrics.model_dump_json(),
                job.error,
                to_db_timestamp(job.started_at),
                to_db_timestamp(job.finished_at),
                job.id,
            ],
        )

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

    def list_jobs(self, project_id: str) -> list[Job]:
        self.get_project(project_id)
        rows = self._fetchall(
            f"SELECT {_JOB_COLUMNS} FROM jobs WHERE project_id = ? ORDER BY created_at DESC",
            [project_id],
        )
        return [_job(row) for row in rows]

    def queued_job_ids(self) -> list[str]:
        rows = self._fetchall(
            "SELECT id FROM jobs WHERE status = ? ORDER BY created_at", [JobStatus.QUEUED.value]
        )
        return [row[0] for row in rows]

    def fail_interrupted_jobs(self) -> int:
        """Jobs left running by a stopped process can never finish: mark them failed."""
        rows = self._fetchall("SELECT id FROM jobs WHERE status = ?", [JobStatus.RUNNING.value])
        for (job_id,) in rows:
            self._execute(
                "UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
                [
                    JobStatus.FAILED.value,
                    "interrupted: the worker stopped before the run finished",
                    to_db_timestamp(utcnow()),
                    job_id,
                ],
            )
        return len(rows)

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
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    table.id,
                    table.project_id,
                    table.source_id,
                    table.name,
                    *values[1:],
                    table.publish,
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
