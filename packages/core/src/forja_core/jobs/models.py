"""Jobs (runs) and their metrics."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.pagination import Page


class JobType(StrEnum):
    PROFILE = "profile"
    BUILD_SILVER = "build_silver"
    BUILD_GOLD = "build_gold"
    EXPORT = "export"
    GOLD_PROPOSAL = "gold_proposal"
    MART_REQUEST = "mart_request"
    PUBLISH_MART = "publish_mart"
    BUILD_ALL = "build_all"
    LOAD = "load"
    INGEST = "ingest"

    @property
    def uses_llm(self) -> bool:
        """LLM jobs only read the catalog: they can be cancelled and resumed safely."""
        return self in (JobType.GOLD_PROPOSAL, JobType.MART_REQUEST)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def finished(self) -> bool:
        return self in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED)


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
    use_llm: bool = Field(
        default=True, description="gold_proposal: ask the configured LLM, else the heuristic"
    )
    mart_request_id: str | None = Field(
        default=None, description="mart_request and publish_mart: the request processed"
    )
    connection_id: str | None = Field(
        default=None, description="load: the connection whose sources are loaded"
    )
    upload_id: str | None = Field(default=None, description="ingest: the completed upload")
    trigger: Literal["manual", "schedule"] = Field(
        default="manual", description="load: started by someone or by a schedule"
    )
    schedule_id: str | None = None
    chain: bool = Field(
        default=False,
        description="load: then build Silver, Gold, the published data marts and serving, "
        "with the approved plans",
    )


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


class ModelRunMetrics(BaseModel):
    name: str
    rows: int
    status: str | None = None


class UnknownMemberRows(BaseModel):
    """Fact rows whose key matched no dimension member and took the unknown member."""

    fact: str
    key: str
    dimension: str
    rows: int


class ExportedFile(BaseModel):
    table: str
    format: ExportFormat
    path: str
    rows: int


class LLMUsage(BaseModel):
    """One language model call made by a job (the journal holds the same, by call)."""

    purpose: str
    provider: str
    model: str
    status: str
    cached: bool = False
    attempts: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0


class JobProgress(BaseModel):
    step: str
    message: str = ""
    percent: int = Field(default=0, ge=0, le=100)
    updated_at: datetime | None = None
    running: list[str] = Field(
        default_factory=list,
        description="Items being processed: dbt models (stg_clients, dim_clients...), or "
        "source ids while profiling",
    )
    done: list[str] = Field(default_factory=list, description="Items finished successfully")
    failed: list[str] = Field(default_factory=list, description="Items that failed")


class LoadMetrics(BaseModel):
    """One source loaded from a connection, or from an uploaded file."""

    source_id: str | None = None
    source_name: str
    object: str
    mode: str = "full"
    rows: int = 0
    batches: int = 0
    version: int | None = Field(default=None, description="Version created; None if skipped")
    cursor_value: str | None = None
    skipped: str | None = Field(default=None, description="Why no version was created")
    blocking_drift: bool = Field(
        default=False, description="Columns of the approved plan changed: Silver not rebuilt"
    )
    duration_seconds: float = 0.0


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
    relations_detected: int = 0
    models: list[ModelRunMetrics] = Field(default_factory=list)
    unknown_member_rows: list[UnknownMemberRows] = Field(default_factory=list)
    llm_calls: list[LLMUsage] = Field(default_factory=list)
    loads: list[LoadMetrics] = Field(default_factory=list)
    rows_loaded: int = 0

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
    created_by: str | None = Field(default=None, description="User who queued the job")
    progress: JobProgress | None = None
    result: dict[str, Any] | None = Field(
        default=None, description="Outcome of LLM jobs (Gold plan version, mart request...)"
    )
    attempts: int = Field(default=0, description="Executions started (resumed LLM jobs: > 1)")
    cancel_requested: bool = False


class RunPage(Page[Job]):
    """Runs of a project, newest first."""
