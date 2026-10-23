"""OpenAI Chat Completions, through the official SDK, with a JSON schema response format."""

from __future__ import annotations

from typing import Any

import openai

from forja_llm.base import (
    Completion,
    LLMError,
    LLMProvider,
    LLMRefusalError,
    LLMResponseError,
    LLMRetryableError,
)
from forja_llm.providers.anthropic_provider import retry_after
from forja_llm.schema import closed_schema
from forja_llm.settings import LLMSettings, ProviderName

_RETRYABLE_STATUS = frozenset({408, 409, 429})


class OpenAIProvider(LLMProvider):
    name = ProviderName.OPENAI.value

    def __init__(self, settings: LLMSettings, *, client: Any | None = None, **kwargs: Any) -> None:
        super().__init__(settings, **kwargs)
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            key = self.settings.openai_api_key
            options: dict[str, Any] = {
                "timeout": self.settings.timeout_for(self.name),
                "max_retries": 0,
            }
            if key is not None:
                options["api_key"] = key.get_secret_value()
            self._client = openai.OpenAI(**options)
        return self._client

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        try:
            response = self.client.chat.completions.create(
                model=self._require_model(),
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_name,
                        "schema": closed_schema(response_schema),
                        "strict": False,
                    },
                },
                max_completion_tokens=self.settings.max_output_tokens,
            )
        except openai.RateLimitError as exc:
            raise LLMRetryableError("openai rate limit", retry_after(exc.response.headers)) from exc
        except openai.APIConnectionError as exc:  # includes timeouts
            raise LLMRetryableError(f"openai connection error: {type(exc).__name__}") from exc
        except openai.APIStatusError as exc:
            if exc.status_code in _RETRYABLE_STATUS or exc.status_code >= 500:
                raise LLMRetryableError(
                    f"openai status {exc.status_code}", retry_after(exc.response.headers)
                ) from exc
            raise LLMError(f"openai status {exc.status_code}: {exc.message}") from exc

        choice = response.choices[0]
        if getattr(choice.message, "refusal", None):
            raise LLMRefusalError("openai declined the request")
        if choice.finish_reason == "length":
            raise LLMResponseError("openai answer truncated: raise FORJA_LLM_MAX_OUTPUT_TOKENS")
        usage = response.usage
        return Completion(
            text=choice.message.content or "",
            input_tokens=int(usage.prompt_tokens) if usage else 0,
            output_tokens=int(usage.completion_tokens) if usage else 0,
        )
