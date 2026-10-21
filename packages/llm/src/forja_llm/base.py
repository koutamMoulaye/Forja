"""Provider-agnostic interface for structured generation."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forja_llm.context import LLMSafeContext, serialize_for_llm
from forja_llm.settings import LLMSettings

SYSTEM_PROMPT = (
    "You are the data engineering assistant of Forja. You only receive dataset schemas "
    "and profiling statistics, never raw data. Answer with a single JSON document that "
    "validates against the provided JSON schema, without any surrounding text."
)


class LLMError(Exception):
    pass


class LLMResponseError(LLMError):
    """The provider answered, but the answer does not match the expected model."""


class LLMRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    task: str = Field(min_length=1, description="Instruction written by Forja, not by data")
    context: LLMSafeContext


class LLMProvider(ABC):
    name: ClassVar[str]

    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings

    @property
    def model(self) -> str | None:
        return self.settings.model_for(self.name)

    def generate[T: BaseModel](self, request: LLMRequest, response_model: type[T]) -> T:
        """Run a structured generation and validate the answer against ``response_model``."""
        schema = response_model.model_json_schema()
        prompt = self.render_prompt(request, schema)
        raw = self._complete(system=SYSTEM_PROMPT, prompt=prompt, response_schema=schema)
        try:
            return response_model.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMResponseError(
                f"{self.name} response does not match {response_model.__name__}"
            ) from exc

    @staticmethod
    def render_prompt(request: LLMRequest, schema: dict[str, Any]) -> str:
        context = serialize_for_llm(request.context)
        return (
            f"Task:\n{request.task}\n\n"
            f"Dataset context (schema and statistics only):\n{context}\n\n"
            f"Response JSON schema:\n{json.dumps(schema, separators=(',', ':'))}"
        )

    @abstractmethod
    def _complete(self, *, system: str, prompt: str, response_schema: dict[str, Any]) -> str:
        """Send the prompt to the provider and return the raw JSON text it produced."""
