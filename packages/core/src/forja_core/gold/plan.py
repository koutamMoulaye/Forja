"""Gold plan: a star schema of dimensions and facts built on Silver tables.

A plan only describes the model; it never contains SQL, except the row-level
expression of a measure, which is parsed and checked against an allowlist.
Column references use Silver names: ``source`` is a Silver source name (the table is
``stg_<source>``) and ``column`` a Silver column.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.silver.plan import PiiTreatment, PlanStatus

UNKNOWN_KEY = "-1"
DATE_DIMENSION = "dim_date"


class ScdType(StrEnum):
    SCD1 = "scd1"
    SCD2 = "scd2"


class Aggregation(StrEnum):
    SUM = "sum"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    COUNT = "count"
    COUNT_DISTINCT = "count_distinct"
    NONE = "none"
    """Non-additive row value (unit price, rate): never aggregated directly, not even
    averaged; the semantic layer derives a ratio of additive measures instead."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DimensionAttribute(_Strict):
    column: str = Field(description="Silver column of the dimension source")
    name: str = Field(description="Column name in the dimension")
    pii_treatment: PiiTreatment | None = Field(
        default=None, description="Export treatment; defaults to the Silver plan's"
    )
    description: str = ""


class Dimension(_Strict):
    name: str = Field(description="dim_<entity>")
    source: str = Field(description="Silver source name")
    natural_key: list[str] = Field(min_length=1, description="Silver key column(s)")
    surrogate_key: str = Field(description="Deterministic hash of the natural key")
    attributes: list[DimensionAttribute] = Field(default_factory=list)
    scd: ScdType = ScdType.SCD1
    explanation: str = ""


class FactJoin(_Strict):
    """A table joined to the fact base along a many-to-one relation (no fan-out)."""

    source: str
    from_source: str = Field(description="Base or already joined source holding the key")
    from_column: str
    to_column: str = Field(description="Key of the joined source")
    explanation: str = ""


class ForeignKey(_Strict):
    name: str = Field(description="Column of the fact holding the dimension surrogate key")
    dimension: str
    source: str = Field(description="Base or joined source holding the natural key")
    column: str
    relation_id: str | None = Field(default=None, description="Confirmed relation used")
    explanation: str = ""


class DateKey(_Strict):
    name: str = Field(description="Column of the fact holding the dim_date key (YYYYMMDD)")
    source: str
    column: str
    explanation: str = ""


class DegenerateDimension(_Strict):
    name: str
    source: str
    column: str


class Measure(_Strict):
    name: str
    expression: str = Field(
        description="Row-level expression over fact columns, e.g. quantite * prix_unitaire"
    )
    aggregation: Aggregation = Aggregation.SUM
    description: str = ""
    explanation: str = ""


class Fact(_Strict):
    name: str = Field(description="fct_<process>")
    source: str = Field(description="Silver source at the grain of the fact")
    grain: list[str] = Field(min_length=1, description="Columns of the source, one row each")
    grain_description: str = ""
    joins: list[FactJoin] = Field(default_factory=list)
    foreign_keys: list[ForeignKey] = Field(default_factory=list)
    date_keys: list[DateKey] = Field(default_factory=list)
    degenerate_dimensions: list[DegenerateDimension] = Field(default_factory=list)
    measures: list[Measure] = Field(default_factory=list)
    explanation: str = ""


class DateDimension(_Strict):
    enabled: bool = True
    explanation: str = ""


class GoldModel(_Strict):
    """The content of a Gold plan: what a proposer, heuristic or LLM, produces."""

    dimensions: list[Dimension] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    date_dimension: DateDimension = Field(default_factory=DateDimension)


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    location: str = ""


class GoldPlan(GoldModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    project_id: str
    version: int
    status: PlanStatus
    origin: str = Field(description="heuristic, or llm:<provider>/<model>")
    created_at: datetime
    updated_at: datetime
    issues: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    summary: str = ""

    def model(self) -> GoldModel:
        return GoldModel.model_validate(
            self.model_dump(include={"dimensions", "facts", "date_dimension"})
        )

    def dimension(self, name: str) -> Dimension | None:
        return next((d for d in self.dimensions if d.name == name), None)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]


class GoldPlanPatch(_Strict):
    """Replace whole sections, or apply targeted changes."""

    dimensions: list[Dimension] | None = None
    facts: list[Fact] | None = None
    date_dimension: DateDimension | None = None
    dimension_scd: dict[str, ScdType] | None = Field(
        default=None, description="Historization by dimension name"
    )
    add_measures: dict[str, list[Measure]] | None = Field(
        default=None, description="Measures to add, by fact name"
    )
    remove_measures: dict[str, list[str]] | None = Field(
        default=None, description="Measure names to remove, by fact name"
    )
