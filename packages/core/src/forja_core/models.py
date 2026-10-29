"""Core domain models: projects, sources and source versions."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from forja_core.connectors.models import SourceOrigin

TECHNICAL_COLUMNS: tuple[str, ...] = ("_batch_id", "_ingested_at", "_source_file", "_row_hash")


class Architecture(StrEnum):
    MEDALLION = "medallion"


class Layer(StrEnum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"


class SourceFormat(StrEnum):
    CSV = "csv"
    EXCEL = "excel"
    PARQUET = "parquet"
    JSON = "json"
    DATABASE = "database"
    API = "api"


class IngestMode(StrEnum):
    """How an upload relates to existing sources."""

    AUTO = "auto"
    NEW_SOURCE = "new_source"
    NEW_VERSION = "new_version"


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    architecture: Architecture = Architecture.MEDALLION

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class Project(BaseModel):
    id: str
    name: str
    description: str | None = None
    architecture: Architecture
    created_at: datetime


class ColumnSchema(BaseModel):
    name: str
    type: str
    technical: bool = False


class TypeChange(BaseModel):
    column: str
    previous_type: str
    new_type: str
    level: Literal["physical", "inferred"]


class SchemaDrift(BaseModel):
    """Differences between a source version and the previous one."""

    previous_version: int
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    type_changed: list[TypeChange] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_drift(self) -> bool:
        return bool(self.added or self.removed or self.type_changed)


class SourceVersion(BaseModel):
    """One ingested batch of a source. ``id`` is the ``_batch_id`` written in Bronze."""

    id: str
    source_id: str
    version: int
    format: SourceFormat
    original_filename: str
    sheet_name: str | None = None
    encoding: str | None = None
    delimiter: str | None = None
    row_count: int
    new_row_count: int = Field(description="Rows whose _row_hash was not in earlier versions")
    columns: list[ColumnSchema]
    bronze_path: str
    warnings: list[str] = Field(default_factory=list)
    schema_drift: SchemaDrift | None = None
    ingested_at: datetime


class Source(BaseModel):
    """A logical source. Descriptive fields reflect its latest version."""

    id: str
    project_id: str
    name: str
    format: SourceFormat
    original_filename: str
    sheet_name: str | None = None
    encoding: str | None = None
    delimiter: str | None = None
    row_count: int
    column_count: int
    columns: list[ColumnSchema]
    bronze_path: str
    warnings: list[str] = Field(default_factory=list)
    ingested_at: datetime
    version: int = 1
    latest_version_id: str | None = None
    schema_drift: SchemaDrift | None = None
    quality_score: float | None = None
    origin: SourceOrigin | None = Field(
        default=None, description="The connection the source is loaded from, if any"
    )


class UploadStatus(StrEnum):
    RECEIVING = "receiving"
    COMPLETE = "complete"
    INGESTED = "ingested"
    FAILED = "failed"
    CANCELLED = "cancelled"


class UploadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)
    mode: IngestMode = IngestMode.AUTO
    source_id: str | None = None
    fingerprint: str | None = Field(
        default=None,
        max_length=200,
        description="Client-side identity of the file (name, size, date): an unfinished "
        "session for the same file is resumed instead of starting over",
    )


class UploadSession(BaseModel):
    id: str
    project_id: str
    filename: str
    size: int
    received: int = 0
    chunk_size: int
    mode: IngestMode = IngestMode.AUTO
    source_id: str | None = None
    fingerprint: str | None = None
    status: UploadStatus = UploadStatus.RECEIVING
    job_id: str | None = Field(default=None, description="The run ingesting the file")
    error: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime

    @property
    def complete(self) -> bool:
        return self.received >= self.size
