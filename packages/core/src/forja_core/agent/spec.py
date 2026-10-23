"""What the agent understands from a request: a data mart specification, a question
back to the user, or a refusal. The LLM answers with :class:`AgentAnswer`; the
deterministic parser produces the same objects. Neither ever contains SQL.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forja_core.semantic.models import TimeGrain

_NAME = r"^[a-z][a-z0-9_]{0,47}$"


class FilterOperator(StrEnum):
    EQ = "eq"
    NEQ = "neq"
    IN = "in"
    NOT_IN = "not_in"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    CONTAINS = "contains"


Scalar = str | int | float | bool


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MartFilter(_Strict):
    field: str = Field(description="dimension.attribute, or a metric name (filter on totals)")
    operator: FilterOperator = FilterOperator.EQ
    value: Scalar | list[Scalar]


class Period(_Strict):
    start: date | None = Field(default=None, description="First day included")
    end: date | None = Field(default=None, description="Last day included")
    label: str | None = Field(default=None, description="As said by the user: 2024, T1 2024")


class OrderBy(_Strict):
    field: str = Field(description="A metric or an axis of the mart")
    direction: Literal["asc", "desc"] = "desc"


class MartSpec(_Strict):
    metrics: list[str] = Field(min_length=1, description="Metric names")
    axes: list[str] = Field(
        default_factory=list, description="dimension.attribute, or a dimension name"
    )
    time_grain: TimeGrain | None = None
    time_dimension: str | None = Field(default=None, description="Defaults to the main date")
    filters: list[MartFilter] = Field(default_factory=list)
    period: Period | None = None
    order_by: list[OrderBy] = Field(default_factory=list)
    limit: int | None = Field(default=None, ge=1)
    name: str = Field(default="mart", description="snake_case name of the data mart")

    @field_validator("name", mode="before")
    @classmethod
    def _snake(cls, value: object) -> object:
        if isinstance(value, str):
            from forja_core.utils import slugify

            value = slugify(value, default="mart", max_length=48)
            if not value[:1].isalpha():
                value = f"mart_{value}"[:48]
        return value


class ClarificationOption(_Strict):
    label: str = Field(description="What the user reads")
    ref: str = Field(
        description="What the term means if chosen: metric:<name>, attribute:<dim>.<attr>, "
        "value:<dim>.<attr>=<value>, or ignore"
    )


class Clarification(_Strict):
    question: str
    term: str = Field(description="The word of the request that is ambiguous or unknown")
    options: list[ClarificationOption] = Field(min_length=2, max_length=4)


class AgentAnswer(_Strict):
    """Answer of the language model (and of the parser)."""

    kind: Literal["mart", "clarification", "refusal"]
    mart: MartSpec | None = None
    clarification: Clarification | None = None
    refusal_reason: str | None = Field(default=None, description="Why it is out of scope")
