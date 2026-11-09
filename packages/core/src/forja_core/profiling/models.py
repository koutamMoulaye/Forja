"""Profiling report models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

PROFILER_VERSION = "2"


class InferredType(StrEnum):
    INTEGER = "integer"
    DECIMAL = "decimal"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    STRING = "string"
    OTHER = "other"
    EMPTY = "empty"


class PiiType(StrEnum):
    EMAIL = "email"
    PHONE = "phone"
    IBAN = "iban"
    FIRST_NAME = "first_name"
    LAST_NAME = "last_name"
    FULL_NAME = "full_name"


class ConfidenceLevel(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    @classmethod
    def from_score(cls, confidence: float) -> ConfidenceLevel:
        if confidence >= 0.8:
            return cls.HIGH
        if confidence >= 0.5:
            return cls.MEDIUM
        return cls.LOW


class TypeInference(BaseModel):
    inferred_type: InferredType
    physical_type: str
    from_text: bool = Field(description="True when the type was inferred from text values")
    match_ratio: float = Field(ge=0, le=1, description="Share of values matching the type")
    format: str | None = Field(default=None, description="strptime format for dates")
    decimal_separator: Literal[",", "."] | None = None
    near_type: InferredType | None = Field(
        default=None, description="Type matched by most, but not enough, values"
    )
    near_type_ratio: float | None = None
    leading_zeros: bool = Field(
        default=False,
        description='Integers padded with leading zeros ("03"): the zeros are dropped',
    )
    max_decimals: int | None = Field(
        default=None, description="Most fractional digits seen in a decimal column"
    )
    sentinels: list[str] = Field(
        default_factory=list,
        description="Placeholders written instead of a value (Inconnu, NC, N/A), as written; "
        "left out of the type inference",
    )
    sentinel_count: int = Field(default=0, description="Rows holding one of the placeholders")


class TopValue(BaseModel):
    value: str
    count: int
    pct: float


class PiiDetection(BaseModel):
    column: str
    pii_type: PiiType
    confidence: float = Field(ge=0, le=1)
    level: ConfidenceLevel
    match_ratio: float = Field(ge=0, le=1)
    name_hint: bool
    method: str


class ColumnProfile(BaseModel):
    name: str
    physical_type: str
    inferred: TypeInference
    null_count: int
    null_pct: float
    distinct_count: int
    uniqueness: float = Field(description="distinct values / non-null values")
    is_unique: bool
    is_constant: bool
    min: int | float | str | None = None
    max: int | float | str | None = None
    mean: float | None = None
    stddev: float | None = None
    min_length: int | None = None
    max_length: int | None = None
    top_values: list[TopValue] = Field(default_factory=list)
    pii: PiiDetection | None = None


class CandidateKey(BaseModel):
    columns: list[str]
    kind: Literal["simple", "composite"]
    uniqueness: float = Field(
        default=1.0,
        ge=0,
        le=1,
        description="Distinct combinations / distinct rows; below 1 for a near-unique key "
        "whose few conflicting rows will be quarantined",
    )


class KeyConflicts(BaseModel):
    """Distinct rows sharing a key value, measured before any rule is approved.

    Near-identical rows only differ by blanks (or placeholders): the most complete one
    holds everything the others say. Divergent rows disagree on a filled value: a person
    decides which one to keep."""

    columns: list[str]
    keys: int = Field(description="Key values held by more than one distinct row")
    rows: int = Field(description="Rows holding those key values")
    near_identical_keys: int = 0
    near_identical_rows: int = 0
    divergent_keys: int = 0
    divergent_rows: int = 0
    by_period: dict[str, int] = Field(
        default_factory=dict,
        description="Keys in conflict by value of the period column of the key, if any "
        "(« 2021 »: 2)",
    )


class Composition(BaseModel):
    """A « total » column next to the columns it adds up (total = payant + gratuit): how
    often, and by how much, the source disagrees with itself."""

    total: str = Field(description="Source column holding the total")
    parts: list[str] = Field(description="Source columns it is the sum of")
    rows: int = Field(description="Rows where total and parts are all filled")
    mismatched_rows: int = Field(description="Rows where the total differs from the sum")
    gap: float = Field(description="Sum of total minus sum of the parts, over those rows")
    by_period: dict[str, float] = Field(
        default_factory=dict, description="Gap by value of a period column (« 2014 »: 9250)"
    )
    period_column: str | None = None


class EntityAttributes(BaseModel):
    """Columns that repeat the same value for each value of a key: the attributes of an
    entity stored on every row of a denormalized file (a museum's city on each year)."""

    key: str = Field(description="Source column identifying the entity")
    entities: int = Field(description="Distinct values of the key")
    attributes: list[str] = Field(description="Columns with one value per key, in source order")
    conflicts: dict[str, int] = Field(
        default_factory=dict,
        description="Keys holding more than one value, by attribute (a few are tolerated)",
    )


class DuplicateStats(BaseModel):
    duplicate_rows: int = Field(description="Rows that are exact copies of a previous row")
    duplicate_pct: float
    duplicate_groups: int = Field(description="Distinct rows appearing more than once")


class QualityComponent(BaseModel):
    name: str
    weight: float
    score: float = Field(ge=0, le=1)
    points: float
    details: str


class QualityScore(BaseModel):
    score: float = Field(ge=0, le=100)
    formula: str
    components: list[QualityComponent]
    issues: list[str] = Field(default_factory=list)


class ProfileReport(BaseModel):
    source_id: str
    source_name: str
    version_id: str | None = None
    version: int | None = None
    profiler_version: str = PROFILER_VERSION
    profiled_at: datetime
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    candidate_keys: list[CandidateKey]
    entities: list[EntityAttributes] = Field(
        default_factory=list,
        description="Attributes repeated for each value of an identifier (one row per "
        "entity and period, say): candidates for a dimension",
    )
    duplicates: DuplicateStats
    key_conflicts: list[KeyConflicts] = Field(
        default_factory=list,
        description="Near keys (unique but for a few rows): the rows in conflict, measured",
    )
    compositions: list[Composition] = Field(
        default_factory=list,
        description="Total columns and the columns they add up, with the gap measured",
    )
    pii: list[PiiDetection]
    quality: QualityScore
    sampled: bool = Field(
        default=False,
        description="Type inference, top values and statistics come from a sample; row, "
        "null, distinct and duplicate counts are always exact",
    )
    sample_rows: int | None = None
    duration_ms: int | None = Field(default=None, description="Time spent profiling")
