"""Jobs (runs) and their metrics."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class JobType(StrEnum):
    PROFILE = "profile"
    BUILD_SILVER = "build_silver"
    EXPORT = "export"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

    @property
    def finished(self) -> bool:
        return self in (JobStatus.SUCCEEDED, JobStatus.FAILED)


class ExportFormat(StrEnum):
    PARQUET = "parquet"
    CSV = "csv"


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: JobType
    source_ids: list[str] | None = Field(
        default=None, description="Sources to process; all sources of the project by default"
    )
    full_refresh: bool = Field(
        default=False, description="build_silver: rebuild Silver tables from all Bronze batches"
    )
    formats: list[ExportFormat] = Field(
        default_factory=lambda: [ExportFormat.PARQUET, ExportFormat.CSV],
        description="export: file formats written next to the serving database",
    )
    csv_delimiter: str | None = Field(default=None, min_length=1, max_length=1)


class DbtTestResult(BaseModel):
    unique_id: str
    name: str
    model: str | None = None
    status: Literal["pass", "fail", "warn", "error", "skipped"]
    failures: int = 0
    message: str | None = None


class DbtTestSummary(BaseModel):
    passed: int = 0
    failed: int = 0
    warned: int = 0
    errored: int = 0
    skipped: int = 0
    results: list[DbtTestResult] = Field(default_factory=list)


class SourceRunMetrics(BaseModel):
    source_id: str
    source_name: str
    model: str
    plan_version: int
    full_refresh: bool
    rows_read: int = Field(description="Bronze rows not processed by a previous run")
    rows_already_processed: int = 0
    duplicates_removed: int = 0
    rows_valid: int = 0
    rows_rejected: int = 0
    rows_superseded: int = Field(
        default=0, description="Older rows of a key replaced by a more recent one in the same run"
    )
    model_status: str | None = None


class ExportedFile(BaseModel):
    table: str
    format: ExportFormat
    path: str
    rows: int


class RunMetrics(BaseModel):
    duration_seconds: float = 0.0
    rows_read: int = 0
    rows_valid: int = 0
    rows_rejected: int = 0
    duplicates_removed: int = 0
    sources: list[SourceRunMetrics] = Field(default_factory=list)
    dbt_tests: DbtTestSummary | None = None
    profiled_sources: int = 0
    exports: list[ExportedFile] = Field(default_factory=list)
    serving_path: str | None = None

    def add_source(self, source: SourceRunMetrics) -> None:
        self.sources.append(source)
        self.rows_read += source.rows_read
        self.rows_valid += source.rows_valid
        self.rows_rejected += source.rows_rejected
        self.duplicates_removed += source.duplicates_removed


class Job(BaseModel):
    id: str
    project_id: str
    type: JobType
    status: JobStatus
    params: RunRequest
    metrics: RunMetrics | None = None
    error: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
