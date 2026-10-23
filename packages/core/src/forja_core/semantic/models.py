"""Semantic layer: business names over the applied Gold model.

- Metrics: an aggregate of a fact column (sum, count, count distinct, min, max) or a
  ratio of two metrics. Non-additive values (unit price, average basket) are always
  ratios of additive metrics, never averages of averages.
- Dimensions: a Gold dimension joined to a fact, the degenerate dimensions kept on
  the fact, or a role of the date dimension (one per date key of the fact).
- Labels, descriptions and synonyms are in French; an engineer edits them through
  overrides, which survive regeneration.

References: a metric by its name (``montant``), an attribute as
``dimension.attribute`` (``client.ville``), a time dimension by its name
(``date_commande``).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.profiling.models import PiiType


class Additivity(StrEnum):
    ADDITIVE = "additive"
    SEMI_ADDITIVE = "semi_additive"
    NON_ADDITIVE = "non_additive"


class MetricFormat(StrEnum):
    CURRENCY = "currency"
    INTEGER = "integer"
    DECIMAL = "decimal"
    PERCENT = "percent"


class MetricAggregation(StrEnum):
    SUM = "sum"
    COUNT = "count"
    COUNT_DISTINCT = "count_distinct"
    MIN = "min"
    MAX = "max"


class TimeGrain(StrEnum):
    DAY = "jour"
    WEEK = "semaine"
    MONTH = "mois"
    QUARTER = "trimestre"
    YEAR = "annee"


class Metric(BaseModel):
    name: str
    label: str
    description: str = ""
    fact: str
    kind: Literal["aggregate", "ratio"] = "aggregate"
    aggregation: MetricAggregation | None = None
    column: str | None = Field(default=None, description="Fact column aggregated")
    numerator: str | None = Field(default=None, description="Ratio: metric name")
    denominator: str | None = Field(default=None, description="Ratio: metric name")
    formula: str = Field(description="Readable definition, e.g. sum(montant) / sum(quantite)")
    additivity: Additivity
    non_additive_dimensions: list[str] = Field(
        default_factory=list, description="Semi-additive: dimensions it must not be summed over"
    )
    unit: str | None = None
    format: MetricFormat = MetricFormat.DECIMAL
    synonyms: list[str] = Field(default_factory=list)
    hidden: bool = False
    default: bool = Field(default=False, description="Always offered to the agent")


class Attribute(BaseModel):
    name: str
    column: str = Field(description="Column of the dimension table (or of the fact)")
    label: str
    description: str = ""
    data_type: Literal["text", "number", "date", "boolean"] = "text"
    pii: PiiType | None = Field(default=None, description="Personal data: never shown in clear")
    synonyms: list[str] = Field(default_factory=list)
    hidden: bool = False
    filterable: bool = Field(
        default=False, description="Values can be resolved locally to filter on them"
    )


class Hierarchy(BaseModel):
    name: str
    label: str
    levels: list[str] = Field(description="Attribute names, from the coarsest to the finest")


class SemanticDimension(BaseModel):
    name: str
    label: str
    description: str = ""
    kind: Literal["standard", "degenerate", "time"]
    fact: str
    table: str = Field(description="Gold table: dim_*, dim_date, or the fact (degenerate)")
    fact_key: str | None = Field(default=None, description="Foreign key column of the fact")
    table_key: str | None = Field(default=None, description="Key column of the dimension")
    display_attribute: str | None = Field(
        default=None, description="Attribute used when the dimension is asked for by name"
    )
    historized: bool = Field(
        default=False, description="SCD2: attributes as they were at the fact date"
    )
    attributes: list[Attribute] = Field(default_factory=list)
    hierarchies: list[Hierarchy] = Field(default_factory=list)
    synonyms: list[str] = Field(default_factory=list)
    hidden: bool = False

    def attribute(self, name: str) -> Attribute | None:
        return next((a for a in self.attributes if a.name == name), None)


class SemanticLayer(BaseModel):
    id: str
    project_id: str
    version: int
    gold_plan_version: int
    created_at: datetime
    created_by: str | None = None
    metrics: list[Metric] = Field(default_factory=list)
    dimensions: list[SemanticDimension] = Field(default_factory=list)
    default_time_dimension: str | None = None
    overrides: list[SemanticOverride] = Field(
        default_factory=list, description="Manual edits applied on top of the generated layer"
    )

    def metric(self, name: str) -> Metric | None:
        return next((m for m in self.metrics if m.name == name), None)

    def dimension(self, name: str) -> SemanticDimension | None:
        return next((d for d in self.dimensions if d.name == name), None)

    def attribute(self, ref: str) -> tuple[SemanticDimension, Attribute] | None:
        dimension_name, _, attribute_name = ref.partition(".")
        dim = self.dimension(dimension_name)
        if dim is None:
            return None
        attribute = dim.attribute(attribute_name or (dim.display_attribute or ""))
        return None if attribute is None else (dim, attribute)

    def time_dimensions(self) -> list[SemanticDimension]:
        return [d for d in self.dimensions if d.kind == "time" and not d.hidden]

    def content(self) -> dict[str, object]:
        """What a regeneration compares to decide whether a new version is needed."""
        return self.model_dump(
            mode="json", include={"metrics", "dimensions", "default_time_dimension", "overrides"}
        )


class SemanticOverride(BaseModel):
    """A manual edit of one element; ``None`` keeps the generated value."""

    model_config = ConfigDict(extra="forbid")

    target: str = Field(
        description="metric:<name>, dimension:<name> or attribute:<dimension>.<attribute>",
        pattern=r"^(metric|dimension|attribute):[a-z0-9_]+(\.[a-z0-9_]+)?$",
    )
    label: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    synonyms: list[str] | None = Field(
        default=None, description="Replaces the generated synonyms when set"
    )
    add_synonyms: list[str] = Field(default_factory=list, description="Added to the synonyms")
    hidden: bool | None = None
    updated_by: str | None = None
    updated_at: datetime | None = None


class SemanticPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overrides: list[SemanticOverride] = Field(min_length=1)


class SynonymProposal(BaseModel):
    id: str
    project_id: str
    target: str = Field(description="metric:<name>, dimension:<name> or attribute:<dim>.<attr>")
    synonym: str
    proposed_by: str
    status: Literal["pending", "accepted", "rejected"] = "pending"
    reviewed_by: str | None = None
    mart_request_id: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class SynonymProposalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: str = Field(pattern=r"^(metric|dimension|attribute):[a-z0-9_]+(\.[a-z0-9_]+)?$")
    synonym: str = Field(min_length=2, max_length=80)
    mart_request_id: str | None = None


SemanticLayer.model_rebuild()
