"""Mart requests: the conversation between a user and the agent, version by version.

Lifecycle: ``drafted`` (being understood, or waiting for an answer to a question)
→ ``previewed`` (a verification preview is ready) → ``validated`` (the user checked
it) → ``published`` (dbt model built, served and exported); ``rejected`` at any
point before publication. With ``FORJA_MART_REQUIRE_APPROVAL=true``, an engineer
approves a validated request before it is published; an engineer's own request is
approved at validation when ``FORJA_MART_ALLOW_SELF_APPROVAL`` allows it.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.agent.spec import Clarification, MartSpec
from forja_core.jobs.models import ExportedFile


class MartStatus(StrEnum):
    DRAFTED = "drafted"
    PREVIEWED = "previewed"
    VALIDATED = "validated"
    PUBLISHED = "published"
    REJECTED = "rejected"


class AgentPath(StrEnum):
    """How the request was understood."""

    PARSER = "parser"
    LLM = "llm"
    LLM_CACHE = "llm_cache"


class Control(BaseModel):
    code: str
    status: Literal["ok", "info", "warning", "error"]
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class MartColumn(BaseModel):
    name: str
    kind: Literal["axis", "metric"]
    label: str
    ref: str
    additivity: str | None = None
    pii: str | None = Field(default=None, description="Personal data type, pseudonymized")


class MartPreview(BaseModel):
    row_count: int
    columns: list[MartColumn]
    rows: list[dict[str, Any]] = Field(description="Sample, personal data pseudonymized")
    pseudonymized: list[str] = Field(default_factory=list)
    controls: list[Control] = Field(default_factory=list)


TermKind = Literal["metric", "grain", "axis", "period", "filter", "limit"]


class SummaryTerm(BaseModel):
    """An element of the spec underlined in the summary, with what it can become."""

    kind: TermKind
    index: int = Field(default=0, description="Position in the spec list (metrics, axes...)")
    question: str = ""
    options: list[str] = Field(default_factory=list, description="Choices the user reads")
    current: int | None = Field(default=None, description="The option in use, if listed")


class SummaryPart(BaseModel):
    text: str
    term: SummaryTerm | None = None


class OptionCount(BaseModel):
    """How much an option of a question covers: « 1 284 clients », « 48 210 € »."""

    value: float
    unit: str = Field(default="", description="What is counted: clients, villes...")
    format: Literal["count", "currency", "integer", "decimal", "percent"] = "count"


Destination = Literal["powerbi", "superset", "csv", "parquet"]


class LLMTrace(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    cached: bool = False


class MartIteration(BaseModel):
    version: int
    kind: Literal["question", "refinement", "answer", "correction"]
    instruction: str
    effective: str = Field(default="", description="Text actually interpreted")
    refines: bool = Field(default=False, description="Applied to the previous spec")
    job_id: str | None = None
    status: Literal["processing", "clarification", "refused", "previewed", "failed"] = "processing"
    path: AgentPath | None = None
    spec: MartSpec | None = None
    clarification: Clarification | None = None
    refusal: str | None = None
    summary: str | None = None
    summary_parts: list[SummaryPart] = Field(
        default_factory=list, description="The summary, with the terms the user can correct"
    )
    sql: str | None = None
    preview: MartPreview | None = None
    option_counts: list[OptionCount | None] = Field(
        default_factory=list, description="What each option of the question covers"
    )
    proposed: MartSpec | None = Field(
        default=None, description="Correction of a term: the spec to preview as is"
    )
    context_tokens: int | None = Field(
        default=None, description="Estimated tokens of the pre-selected semantic context"
    )
    selected: list[str] = Field(
        default_factory=list, description="Semantic elements pre-selected for the request"
    )
    llm: LLMTrace | None = None
    error: str | None = None
    created_at: datetime


class MartRequest(BaseModel):
    id: str
    project_id: str
    owner_id: str
    owner_email: str | None = None
    question: str
    status: MartStatus = MartStatus.DRAFTED
    iterations: list[MartIteration] = Field(default_factory=list)
    bindings: dict[str, str] = Field(
        default_factory=dict, description="Terms resolved by the user's answers"
    )
    semantic_version: int | None = None
    owner_unmasked: bool = Field(
        default=False, description="The author may see personal data as the plans treat it"
    )
    destination: Destination | None = Field(
        default=None, description="Where the analyst wants the mart: a BI tool or a file"
    )
    validated_at: datetime | None = None
    approved_by: str | None = None
    approved_by_email: str | None = None
    approved_at: datetime | None = None
    rejected_by: str | None = None
    rejection_reason: str | None = None
    publish_job_id: str | None = None
    published_table_id: str | None = None
    published_name: str | None = None
    published_at: datetime | None = None
    exports: list[ExportedFile] = Field(default_factory=list)
    model_sql: str | None = Field(default=None, description="dbt model of the published mart")
    model_columns: list[MartColumn] = Field(default_factory=list)
    model_summary: str | None = None
    publish_error: str | None = None
    created_at: datetime
    updated_at: datetime

    @property
    def latest(self) -> MartIteration | None:
        return self.iterations[-1] if self.iterations else None

    @property
    def current_spec(self) -> MartSpec | None:
        """The spec of the latest previewed iteration (base of a refinement)."""
        for iteration in reversed(self.iterations):
            if iteration.spec is not None and iteration.status == "previewed":
                return iteration.spec
        return None


class AgentOverview(BaseModel):
    """What the analyst's home page shows before any question."""

    data_updated_at: datetime | None = Field(
        default=None, description="When the Gold model was last built successfully"
    )
    gold_run_id: str | None = None
    semantic_version: int | None = None
    suggestions: list[str] = Field(
        default_factory=list, description="Questions the parser understands on its own"
    )


class MartQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=2, max_length=1000)


class MartRefinement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=2, max_length=1000)


class ClarificationAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    option: int | None = Field(default=None, ge=0, description="Index of the chosen option")
    text: str | None = Field(default=None, max_length=1000, description="Free answer")


class TermCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1, description="Version whose summary was read")
    term: int = Field(ge=0, description="Index of the term among the summary parts")
    option: int = Field(ge=0, description="Index of the chosen option of that term")


class MartValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination | None = None


class MartRejection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(default="", max_length=1000)
