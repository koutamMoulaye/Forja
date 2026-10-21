"""Privacy-safe context sent to language models.

The only way to build what a provider receives is :func:`build_safe_context`.
It copies an explicit allowlist of schema and statistical fields from profiling
reports. No field of these models can carry a cell value: top values, string
min/max and sample rows are never copied, numeric aggregates are dropped for
columns flagged as personal data, and every free-text field is either an
identifier (project, source or column name) or a value from a closed set.
"""

from __future__ import annotations

from collections.abc import Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forja_core.models import Architecture, Project, Source
from forja_core.profiling.models import (
    ColumnProfile,
    InferredType,
    PiiType,
    ProfileReport,
)
from forja_core.profiling.types import KNOWN_FORMATS

_IDENTIFIER_MAX_LENGTH = 128


class _SafeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def _check_identifier(value: str) -> str:
    if len(value) > _IDENTIFIER_MAX_LENGTH or "\n" in value:
        raise ValueError("identifier is too long or contains line breaks")
    return value


class SafeColumn(_SafeModel):
    name: str
    physical_type: str
    inferred_type: InferredType
    date_format: str | None = None
    decimal_separator: str | None = None
    null_pct: float
    distinct_count: int
    uniqueness: float
    is_unique: bool
    numeric_min: float | None = None
    numeric_max: float | None = None
    numeric_mean: float | None = None
    pii_type: PiiType | None = None
    pii_confidence: float | None = None

    _check_name = field_validator("name", "physical_type")(_check_identifier)

    @field_validator("date_format")
    @classmethod
    def _known_format(cls, value: str | None) -> str | None:
        if value is not None and value not in KNOWN_FORMATS:
            raise ValueError("unknown date format")
        return value

    @field_validator("decimal_separator")
    @classmethod
    def _known_separator(cls, value: str | None) -> str | None:
        if value not in (None, ",", "."):
            raise ValueError("unknown decimal separator")
        return value


class SafeSource(_SafeModel):
    name: str
    row_count: int
    columns: list[SafeColumn]
    candidate_keys: list[list[str]] = Field(default_factory=list)
    duplicate_pct: float
    quality_score: float

    _check_name = field_validator("name")(_check_identifier)


class LLMSafeContext(_SafeModel):
    project_name: str
    architecture: Architecture
    sources: list[SafeSource]

    _check_name = field_validator("project_name")(_check_identifier)


def _safe_column(column: ColumnProfile) -> SafeColumn:
    inferred = column.inferred
    numeric = (
        column.pii is None
        and inferred.inferred_type in (InferredType.INTEGER, InferredType.DECIMAL)
        and isinstance(column.min, int | float)
        and isinstance(column.max, int | float)
    )
    return SafeColumn(
        name=column.name,
        physical_type=column.physical_type,
        inferred_type=inferred.inferred_type,
        date_format=inferred.format,
        decimal_separator=inferred.decimal_separator,
        null_pct=column.null_pct,
        distinct_count=column.distinct_count,
        uniqueness=column.uniqueness,
        is_unique=column.is_unique,
        numeric_min=float(column.min) if numeric and column.min is not None else None,
        numeric_max=float(column.max) if numeric and column.max is not None else None,
        numeric_mean=column.mean if numeric else None,
        pii_type=column.pii.pii_type if column.pii else None,
        pii_confidence=column.pii.confidence if column.pii else None,
    )


def build_safe_context(
    project: Project, sources: Sequence[tuple[Source, ProfileReport]]
) -> LLMSafeContext:
    return LLMSafeContext(
        project_name=project.name,
        architecture=project.architecture,
        sources=[
            SafeSource(
                name=source.name,
                row_count=report.row_count,
                columns=[_safe_column(c) for c in report.columns],
                candidate_keys=[list(k.columns) for k in report.candidate_keys],
                duplicate_pct=report.duplicates.duplicate_pct,
                quality_score=report.quality.score,
            )
            for source, report in sources
        ],
    )


def serialize_for_llm(context: LLMSafeContext) -> str:
    """The single serialization path for data-derived content sent to a provider."""
    if not isinstance(context, LLMSafeContext):
        raise TypeError("only an LLMSafeContext can be serialized for a language model")
    return context.model_dump_json(exclude_none=True)
