"""Runtime configuration, loaded from environment variables prefixed with ``FORJA_``."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
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

    relation_min_inclusion: float = Field(default=0.8, gt=0, le=1)
    relation_min_confidence: float = Field(default=0.6, gt=0, le=1)
    relation_min_distinct: int = Field(default=5, ge=1)
    relation_sample_size: int = Field(default=10_000, gt=0)
    auto_confirm_relations: bool = Field(
        default=False, description="Confirm detected relations without review (local mode)"
    )
    relation_auto_confirm_confidence: float = Field(default=0.9, gt=0, le=1)

    auth_mode: Literal["local", "multi"] = Field(
        default="local",
        description="local: a single administrator; multi: users join projects by invitation",
    )
    auth_secret: SecretStr | None = Field(
        default=None,
        description="JWT signing key; generated once in FORJA_SECRETS_DIR when unset",
    )
    auth_access_token_minutes: int = Field(default=15, gt=0, le=24 * 60)
    auth_refresh_token_days: int = Field(default=14, gt=0, le=365)
    auth_invitation_days: int = Field(default=7, gt=0, le=90)
    auth_password_min_length: int = Field(default=12, ge=8)
    auth_bootstrap_email: str = "admin@forja.local"
    auth_bootstrap_password: SecretStr | None = Field(
        default=None,
        description="Password of the first administrator (random and logged once when unset)",
    )

    auth_throttle_enabled: bool = Field(
        default=True, description="Limit failed logins, refreshes and registrations"
    )
    auth_throttle_window_seconds: int = Field(default=900, gt=0)
    auth_throttle_account_max: int = Field(
        default=5, ge=1, description="Failed logins of one account within the window"
    )
    auth_throttle_ip_max: int = Field(
        default=20, ge=1, description="Failed attempts from one IP within the window"
    )
    auth_throttle_lockout_seconds: int = Field(
        default=60, gt=0, description="First lock; each new lock lasts twice as long"
    )
    auth_throttle_max_lockout_seconds: int = Field(default=3600, gt=0)
    auth_trust_forwarded_for: bool = Field(
        default=False,
        description="Take the client IP from X-Forwarded-For (only behind a trusted proxy)",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        description="Origins allowed to call the API from a browser (the front)",
    )

    mart_require_approval: bool = Field(
        default=False, description="An engineer approves a data mart before it is published"
    )
    mart_preview_rows: int = Field(default=50, gt=0, le=1000)
    mart_max_rows: int = Field(default=1_000_000, gt=0)
    agent_today: str | None = Field(
        default=None, description="ISO date used as today by the agent (tests, evaluation)"
    )

    @property
    def catalog_path(self) -> Path:
        return self.meta_db_path or self.data_dir / "forja_meta.duckdb"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
