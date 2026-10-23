"""Provider-agnostic structured generation with retries, validation and a call journal."""

from __future__ import annotations

import hashlib
import json
import random
import re
import threading
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, ClassVar, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forja_core.jobs.scope import current_scope
from forja_core.llm_calls import LLMCall
from forja_core.logging import get_logger
from forja_core.utils import utcnow
from forja_llm.context import LLMSafeContext, SemanticContext, serialize_for_llm
from forja_llm.settings import LLMSettings

log = get_logger(__name__)

# How often a cancellable call checks whether its job was cancelled.
_CANCEL_POLL_SECONDS = 0.2

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


class LLMCancelledError(LLMError):
    """The job making the call was cancelled; the request to the provider was dropped."""


@dataclass(frozen=True)
class Completion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0


class LLMCache(Protocol):
    """Validated answers by prompt fingerprint (the catalog implements it)."""

    def get_llm_cache(self, key: str) -> str | None: ...

    def put_llm_cache(
        self, key: str, *, provider: str, model: str, purpose: str, response: str
    ) -> None: ...


class LLMRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    task: str = Field(min_length=1, description="Instruction written by Forja, not by data")
    context: LLMSafeContext | SemanticContext
    purpose: str = "generic"
    project_id: str | None = None
    include_schema: bool = Field(
        default=True,
        description="Repeat the JSON schema in the prompt (structured output constrains it too)",
    )


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


@dataclass
class _Attempts:
    """What a generation measured, for the journal."""

    prompt_hash: str
    started: float
    count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    status: str = "failed"
    error_type: str | None = None


class LLMProvider(ABC):
    name: ClassVar[str]

    def __init__(
        self,
        settings: LLMSettings,
        *,
        journal: CallJournal | None = None,
        cache: LLMCache | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.settings = settings
        self.journal = journal
        self.cache = cache if settings.cache else None
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
        label = (
            "Semantic layer (business names only, no data)"
            if isinstance(request.context, SemanticContext)
            else "Dataset context (schema and statistics only)"
        )
        prompt = f"Task:\n{request.task}\n\n{label}:\n{context}"
        if request.include_schema:
            prompt += f"\n\nResponse JSON schema:\n{json.dumps(schema, separators=(',', ':'))}"
        return prompt

    def cache_key(self, prompt: str, schema_name: str) -> str:
        """Fingerprint of everything that determines the answer."""
        material = "\x1f".join((self.name, self.model or "", schema_name, SYSTEM_PROMPT, prompt))
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _backoff(self, attempt: int, retry_after: float | None) -> float:
        if retry_after is not None:
            return min(retry_after, self.settings.backoff_max_seconds)
        delay = float(self.settings.backoff_base_seconds * 2 ** (attempt - 1))
        return min(delay + random.uniform(0, delay / 4), self.settings.backoff_max_seconds)

    def generate[T: BaseModel](self, request: LLMRequest, response_model: type[T]) -> T:
        """Structured generation validated against ``response_model``.

        A validated answer to the same prompt (same context, task, provider and model)
        is served from the cache without calling the provider. Transient errors are
        retried with exponential backoff (or the provider's ``retry-after``); an
        answer that does not validate is retried once more with the validation errors,
        never with data. Inside a job, the call stops when the job is cancelled.
        Every outcome is journaled with its tokens and duration.
        """
        schema = response_model.model_json_schema()
        prompt = self.render_prompt(request, schema)
        key = self.cache_key(prompt, response_model.__name__)
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        attempts = _Attempts(prompt_hash, time.perf_counter())

        cached = self.cache.get_llm_cache(key) if self.cache is not None else None
        if cached is not None:
            try:
                result = response_model.model_validate_json(cached)
            except ValidationError:
                result = None  # the model changed since: ask again
            if result is not None:
                attempts.status = "cached"
                self._journal(request, attempts)
                return result

        feedback = ""
        try:
            while True:
                attempts.count += 1
                self._check_cancelled()
                try:
                    completion = self._call(
                        system=SYSTEM_PROMPT,
                        prompt=prompt + (f"\n\n{feedback}" if feedback else ""),
                        response_schema=schema,
                        schema_name=response_model.__name__,
                    )
                except LLMRetryableError as exc:
                    if attempts.count >= self.settings.max_attempts:
                        attempts.error_type = type(exc).__name__
                        raise
                    self._sleep(self._backoff(attempts.count, exc.retry_after))
                    continue
                attempts.input_tokens += completion.input_tokens
                attempts.output_tokens += completion.output_tokens
                try:
                    result = response_model.model_validate_json(extract_json(completion.text))
                except ValidationError as exc:
                    if attempts.count >= self.settings.max_attempts:
                        attempts.error_type = "LLMResponseError"
                        raise LLMResponseError(
                            f"{self.name} response does not match {response_model.__name__}"
                        ) from exc
                    feedback = _validation_feedback(exc)
                    continue
                attempts.status = "succeeded"
                if self.cache is not None:
                    self.cache.put_llm_cache(
                        key,
                        provider=self.name,
                        model=self.model or "",
                        purpose=request.purpose,
                        response=result.model_dump_json(),
                    )
                return result
        except LLMCancelledError:
            attempts.status = "cancelled"
            raise
        except LLMError as exc:
            attempts.error_type = attempts.error_type or type(exc).__name__
            raise
        finally:
            if attempts.status != "cached":
                self._journal(request, attempts)

    @staticmethod
    def _check_cancelled() -> None:
        scope = current_scope()
        if scope is not None and scope.cancelled.is_set():
            raise LLMCancelledError("the job was cancelled")

    def _call(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        """``_complete``, abandoned as soon as the current job is cancelled.

        Outside a job the call runs in the calling thread. Inside a job it runs in a
        helper thread while this one watches the cancellation flag: a local model can
        spend minutes reading a prompt before writing anything.
        """
        scope = current_scope()
        if scope is None:
            return self._complete(
                system=system, prompt=prompt, response_schema=response_schema,
                schema_name=schema_name,
            )  # fmt: skip
        outcome: dict[str, Any] = {}

        def target() -> None:
            try:
                outcome["completion"] = self._complete(
                    system=system, prompt=prompt, response_schema=response_schema,
                    schema_name=schema_name,
                )  # fmt: skip
            except BaseException as exc:
                outcome["error"] = exc

        worker = threading.Thread(target=target, name=f"llm-{self.name}", daemon=True)
        worker.start()
        while worker.is_alive():
            worker.join(_CANCEL_POLL_SECONDS)
            if worker.is_alive() and scope.cancelled.is_set():
                self._abort()
                raise LLMCancelledError("the job was cancelled during the call")
        if "error" in outcome:
            raise outcome["error"]
        completion: Completion = outcome["completion"]
        return completion

    def _abort(self) -> None:  # noqa: B027 - optional hook
        """Drop the request in flight (close the connection) so the provider stops."""

    def _journal(self, request: LLMRequest, attempts: _Attempts) -> None:
        scope = current_scope()
        duration_ms = round((time.perf_counter() - attempts.started) * 1000)
        log.info(
            "llm_call",
            purpose=request.purpose,
            provider=self.name,
            model=self.model,
            status=attempts.status,
            attempts=attempts.count,
            input_tokens=attempts.input_tokens,
            output_tokens=attempts.output_tokens,
            duration_ms=duration_ms,
            job_id=scope.job_id if scope else None,
        )
        if self.journal is None:
            return
        self.journal(
            LLMCall(
                id=uuid.uuid4().hex,
                project_id=request.project_id,
                job_id=scope.job_id if scope else None,
                provider=self.name,
                model=self.model or "",
                purpose=request.purpose,
                prompt_sha256=attempts.prompt_hash,
                status=attempts.status,
                attempts=attempts.count,
                duration_ms=duration_ms,
                input_tokens=attempts.input_tokens,
                output_tokens=attempts.output_tokens,
                error_type=attempts.error_type,
                created_at=utcnow(),
            )
        )

    @abstractmethod
    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        """One call to the provider; raise LLMRetryableError for transient failures."""
