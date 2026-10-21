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
    duplicate_columns: DuplicateColumnPolicy = DuplicateColumnPolicy.RENAME

    profiling_type_threshold: float = Field(default=0.95, gt=0.5, le=1.0)
    profiling_sample_size: int = Field(default=50_000, gt=0)
    profiling_top_values: int = Field(default=5, ge=0)
    profiling_max_key_columns: int = Field(default=15, ge=2)

    @property
    def catalog_path(self) -> Path:
        return self.meta_db_path or self.data_dir / "forja_meta.duckdb"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
