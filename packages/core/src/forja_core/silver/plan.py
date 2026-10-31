"""Transformation plan of a source into its Silver table.

A plan is derived from the profiling report by deterministic rules, reviewed by a
person (or auto-approved in local mode), then applied by the Silver build.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forja_core.profiling.models import ConfidenceLevel, InferredType, PiiType

DEFAULT_NULL_VALUES: tuple[str, ...] = ("n/a", "na", "null", "none", "nan", "-", "#n/a")


class PlanStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    APPLIED = "applied"


class SilverType(StrEnum):
    """Types of Silver columns, named as in DuckDB."""

    BIGINT = "bigint"
    DOUBLE = "double"
    DECIMAL = "decimal(18,2)"
    BOOLEAN = "boolean"
    DATE = "date"
    TIMESTAMP = "timestamp"
    VARCHAR = "varchar"


NUMERIC_TYPES = frozenset({SilverType.DOUBLE, SilverType.DECIMAL})


class Normalization(StrEnum):
    NONE = "none"
    TRIM = "trim"
    COLLAPSE_WHITESPACE = "collapse_whitespace"
    LOWERCASE = "lowercase"
    COMPACT_UPPERCASE = "compact_uppercase"


class PiiTreatment(StrEnum):
    """Treatment applied when data leaves Forja (serving database and exports)."""

    HASH = "hash"
    MASK = "mask"
    DROP = "drop"
    NONE = "none"


class RuleKind(StrEnum):
    CASTABLE = "castable"
    NOT_NULL = "not_null"
    EMAIL_FORMAT = "email_format"
    PHONE_FORMAT = "phone_format"
    IBAN_FORMAT = "iban_format"


class ValidityRule(BaseModel):
    """A row failing an enabled rule is quarantined in the rejects table."""

    kind: RuleKind
    enabled: bool = True
    explanation: str = ""


class CastSpec(BaseModel):
    date_format: str | None = None
    decimal_separator: Literal[",", "."] | None = None
    true_values: list[str] = Field(default_factory=list)
    false_values: list[str] = Field(default_factory=list)
    null_values: list[str] = Field(default_factory=lambda: list(DEFAULT_NULL_VALUES))


class ColumnStats(BaseModel):
    """Profiling figures the explanations and tests are derived from."""

    row_count: int
    null_count: int
    null_pct: float
    distinct_count: int
    invalid_count: int | None = Field(
        default=None,
        description="Non-null values not matching the type; None when the type was overridden",
    )
    match_ratio: float


class ColumnPlan(BaseModel):
    source_column: str
    target_column: str
    included: bool = True
    present_in_latest: bool = True
    source_type: str = Field(description="Physical Bronze type")
    from_text: bool
    inferred_type: InferredType
    target_type: SilverType
    cast: CastSpec = Field(default_factory=CastSpec)
    normalization: Normalization = Normalization.NONE
    pii_type: PiiType | None = None
    pii_level: ConfidenceLevel | None = None
    pii_treatment: PiiTreatment = PiiTreatment.NONE
    rules: list[ValidityRule] = Field(default_factory=list)
    accepted_values: list[str] | None = None
    stats: ColumnStats
    description: str = ""
    explanation: str = ""

    def rule(self, kind: RuleKind) -> ValidityRule | None:
        return next((r for r in self.rules if r.kind is kind), None)

    def enabled_rules(self) -> list[ValidityRule]:
        return [r for r in self.rules if r.enabled]


class PrimaryKeyPlan(BaseModel):
    columns: list[str] = Field(description="Source column names")
    quasi_unique: bool = Field(
        default=False, description="Not strictly unique at profiling: some rows will be rejected"
    )
    explanation: str = ""


class DeduplicationPlan(BaseModel):
    enabled: bool = True
    duplicate_rows: int = 0
    explanation: str = ""


class TransformationPlan(BaseModel):
    id: str
    project_id: str
    source_id: str
    source_name: str
    model_name: str
    version: int
    status: PlanStatus
    based_on_source_version: int
    created_at: datetime
    updated_at: datetime
    columns: list[ColumnPlan]
    primary_key: PrimaryKeyPlan | None = None
    deduplication: DeduplicationPlan = Field(default_factory=DeduplicationPlan)
    warnings: list[str] = Field(default_factory=list)
    summary: str = ""
    reviews: dict[str, Literal["validated", "rejected"]] = Field(
        default_factory=dict,
        description="Review decisions by rule id (see GET /sources/{id}/plan/review)",
    )

    def column(self, source_column: str) -> ColumnPlan | None:
        return next((c for c in self.columns if c.source_column == source_column), None)

    def included_columns(self) -> list[ColumnPlan]:
        return [c for c in self.columns if c.included]

    def key_columns(self) -> list[ColumnPlan]:
        if self.primary_key is None:
            return []
        by_name = {c.source_column: c for c in self.columns}
        return [by_name[name] for name in self.primary_key.columns]


class ColumnPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    included: bool | None = None
    target_column: str | None = None
    target_type: SilverType | None = None
    date_format: str | None = Field(default=None, min_length=2, max_length=40)
    decimal_separator: Literal[",", "."] | None = None
    normalization: Normalization | None = None
    pii_treatment: PiiTreatment | None = None
    null_values: list[str] | None = None
    rules: dict[RuleKind, bool] | None = Field(
        default=None, description="Enable or disable validity rules"
    )

    @field_validator("date_format")
    @classmethod
    def _strptime_format(cls, value: str | None) -> str | None:
        if value is not None and "%" not in value:
            raise ValueError("date_format must be a strptime format such as %d/%m/%Y")
        return value


class PlanPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_version: int | None = Field(
        default=None,
        ge=1,
        description="Version the edit was made on; refused (409) if the plan has moved since",
    )

    columns: dict[str, ColumnPatch] = Field(
        default_factory=dict, description="Changes keyed by source column name"
    )
    primary_key: list[str] | None = Field(
        default=None, description="Source column names; an empty list removes the key"
    )
    deduplicate: bool | None = None
