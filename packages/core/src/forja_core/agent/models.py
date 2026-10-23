"""Mart requests: the conversation between a user and the agent, version by version.

Lifecycle: ``drafted`` (being understood, or waiting for an answer to a question)
→ ``previewed`` (a verification preview is ready) → ``validated`` (the user checked
it) → ``published`` (dbt model built, served and exported); ``rejected`` at any
point before publication. With ``FORJA_MART_REQUIRE_APPROVAL=true``, an engineer
approves a validated request before it is published.
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


class LLMTrace(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0
    cached: bool = False


class MartIteration(BaseModel):
    version: int
    kind: Literal["question", "refinement", "answer"]
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
    sql: str | None = None
    preview: MartPreview | None = None
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
    validated_at: datetime | None = None
    approved_by: str | None = None
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


class MartRejection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(default="", max_length=1000)
