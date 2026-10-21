"""Core domain models: projects and sources."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

TECHNICAL_COLUMNS: tuple[str, ...] = ("_ingested_at", "_source_file", "_row_hash")


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


class Source(BaseModel):
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
    quality_score: float | None = None
