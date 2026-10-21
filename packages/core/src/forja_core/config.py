"""Runtime configuration, loaded from environment variables prefixed with ``FORJA_``."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DuplicateColumnPolicy(StrEnum):
    """What to do when a source contains duplicated column names."""

    RENAME = "rename"
    ERROR = "error"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FORJA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    data_dir: Path = Path("data")
    meta_db_path: Path | None = None

    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "json"

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    max_upload_mb: int = Field(default=200, gt=0)
    preview_max_rows: int = Field(default=1000, gt=0)
    allow_bronze_preview: bool = Field(
        default=False,
        description="Bronze holds raw values, personal data included: keep it hidden by default",
    )
    duplicate_columns: DuplicateColumnPolicy = DuplicateColumnPolicy.RENAME

    profiling_type_threshold: float = Field(default=0.95, gt=0.5, le=1.0)
    profiling_sample_size: int = Field(default=50_000, gt=0)
    profiling_top_values: int = Field(default=5, ge=0)
    profiling_max_key_columns: int = Field(default=15, ge=2)

    auto_approve_silver: bool = Field(
        default=False, description="Approve generated Silver plans without review (local mode)"
    )
    pii_default_treatment: Literal["hash", "mask", "drop", "none"] = "hash"
    accepted_values_max: int = Field(default=10, ge=0)

    job_runner: Literal["thread", "inline"] = Field(
        default="thread", description="thread: background worker; inline: run on submission"
    )
    dbt_executable: str | None = None
    dbt_threads: int = Field(default=1, ge=1)
    dbt_timeout_seconds: float = Field(default=1800, gt=0)

    secrets_dir: Path = Field(
        default_factory=lambda: Path.home() / ".forja" / "secrets",
        description="Per-project pseudonymization salts; keep it outside the repository",
    )
    export_csv_delimiter: str = Field(default=";", min_length=1, max_length=1)
    export_lock_timeout_seconds: float = Field(default=10, ge=0)

    @property
    def catalog_path(self) -> Path:
        return self.meta_db_path or self.data_dir / "forja_meta.duckdb"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
