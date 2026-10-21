"""Provider-agnostic structured generation with retries, validation and a call journal."""

from __future__ import annotations

import hashlib
import json
import random
import re
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forja_core.llm_calls import LLMCall
from forja_core.utils import utcnow
from forja_llm.context import LLMSafeContext, serialize_for_llm
from forja_llm.settings import LLMSettings

SYSTEM_PROMPT = (
    "You are the data engineering assistant of Forja. You only receive dataset schemas "
    "and profiling statistics, never raw data. Answer with a single JSON document that "
    "validates against the provided JSON schema, without any surrounding text."
)

CallJournal = Callable[[LLMCall], None]


class LLMError(Exception):
    pass


class LLMConfigurationError(LLMError):
    """Missing key, missing package or unsupported option."""


class LLMRetryableError(LLMError):
    """Transient failure (rate limit, timeout, server error): the call may be retried."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class LLMRefusalError(LLMError):
    """The model declined the request."""


class LLMResponseError(LLMError):
    """The provider answered, but never with a document matching the expected model."""


@dataclass(frozen=True)
class Completion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0


class LLMRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    task: str = Field(min_length=1, description="Instruction written by Forja, not by data")
    context: LLMSafeContext
    purpose: str = "generic"
    project_id: str | None = None


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def extract_json(text: str) -> str:
    """The JSON object of an answer, tolerating a surrounding code fence."""
    stripped = text.strip()
    if stripped.startswith("{"):
        return stripped
    match = _JSON_BLOCK.search(stripped)
    return match.group(0) if match else stripped


def _validation_feedback(error: ValidationError) -> str:
    problems = [
        f"- {'.'.join(str(p) for p in item['loc']) or '(root)'}: {item['msg']}"
        for item in error.errors()[:20]
    ]
    return (
        "Your previous answer did not validate against the JSON schema:\n"
        + "\n".join(problems)
        + "\nAnswer again with a corrected JSON document only."
    )


class LLMProvider(ABC):
    name: ClassVar[str]

    def __init__(
        self,
        settings: LLMSettings,
        *,
        journal: CallJournal | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.settings = settings
        self.journal = journal
        self._sleep = sleep

    @property
    def model(self) -> str | None:
        return self.settings.model_for(self.name)

    def _require_model(self) -> str:
        model = self.model
        if model is None:
            raise LLMConfigurationError(f"no model configured for {self.name}: set FORJA_LLM_MODEL")
        return model

    @staticmethod
    def render_prompt(request: LLMRequest, schema: dict[str, Any]) -> str:
        context = serialize_for_llm(request.context)
        return (
            f"Task:\n{request.task}\n\n"
            f"Dataset context (schema and statistics only):\n{context}\n\n"
            f"Response JSON schema:\n{json.dumps(schema, separators=(',', ':'))}"
        )

    def _backoff(self, attempt: int, retry_after: float | None) -> float:
        if retry_after is not None:
            return min(retry_after, self.settings.backoff_max_seconds)
        delay = float(self.settings.backoff_base_seconds * 2 ** (attempt - 1))
        return min(delay + random.uniform(0, delay / 4), self.settings.backoff_max_seconds)

    def generate[T: BaseModel](self, request: LLMRequest, response_model: type[T]) -> T:
        """Structured generation validated against ``response_model``.

        Transient errors are retried with exponential backoff (or the provider's
        ``retry-after``); an answer that does not validate is retried once more with
        the validation errors, never with data. Every outcome is journaled.
        """
        schema = response_model.model_json_schema()
        prompt = self.render_prompt(request, schema)
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        started = time.perf_counter()
        input_tokens = output_tokens = attempts = 0
        status, error_type = "failed", None
        feedback = ""
        try:
            while True:
                attempts += 1
                try:
                    completion = self._complete(
                        system=SYSTEM_PROMPT,
                        prompt=prompt + (f"\n\n{feedback}" if feedback else ""),
                        response_schema=schema,
                        schema_name=response_model.__name__,
                    )
                except LLMRetryableError as exc:
                    if attempts >= self.settings.max_attempts:
                        error_type = type(exc).__name__
                        raise
                    self._sleep(self._backoff(attempts, exc.retry_after))
                    continue
                input_tokens += completion.input_tokens
                output_tokens += completion.output_tokens
                try:
                    result = response_model.model_validate_json(extract_json(completion.text))
                except ValidationError as exc:
                    if attempts >= self.settings.max_attempts:
                        error_type = "LLMResponseError"
                        raise LLMResponseError(
                            f"{self.name} response does not match {response_model.__name__}"
                        ) from exc
                    feedback = _validation_feedback(exc)
                    continue
                status = "succeeded"
                return result
        except LLMError as exc:
            error_type = error_type or type(exc).__name__
            raise
        finally:
            self._journal(
                request, prompt_hash, status, attempts, started, input_tokens, output_tokens,
                error_type,
            )  # fmt: skip

    def _journal(
        self,
        request: LLMRequest,
        prompt_hash: str,
        status: str,
        attempts: int,
        started: float,
        input_tokens: int,
        output_tokens: int,
        error_type: str | None,
    ) -> None:
        if self.journal is None:
            return
        self.journal(
            LLMCall(
                id=uuid.uuid4().hex,
                project_id=request.project_id,
                provider=self.name,
                model=self.model or "",
                purpose=request.purpose,
                prompt_sha256=prompt_hash,
                status="succeeded" if status == "succeeded" else "failed",
                attempts=attempts,
                duration_ms=round((time.perf_counter() - started) * 1000),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                error_type=error_type,
                created_at=utcnow(),
            )
        )

    @abstractmethod
    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        """One call to the provider; raise LLMRetryableError for transient failures."""
