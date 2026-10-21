"""Anthropic Messages API, through the official SDK.

Structured output uses ``output_config.format`` (JSON schema). Declined requests are
retried by the API on a fallback model (``fallbacks: "default"``) unless
``FORJA_LLM_REFUSAL_FALLBACK=false``. Retries are handled by :class:`LLMProvider`,
so the SDK's own retries are disabled.
"""

from __future__ import annotations

from typing import Any

import anthropic

from forja_llm.base import (
    Completion,
    LLMError,
    LLMProvider,
    LLMRefusalError,
    LLMResponseError,
    LLMRetryableError,
)
from forja_llm.schema import closed_schema
from forja_llm.settings import LLMSettings, ProviderName

REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01"
_RETRYABLE_STATUS = frozenset({408, 409, 429})


def retry_after(headers: Any) -> float | None:
    value = headers.get("retry-after") if headers is not None else None
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


class AnthropicProvider(LLMProvider):
    name = ProviderName.ANTHROPIC.value

    def __init__(self, settings: LLMSettings, *, client: Any | None = None, **kwargs: Any) -> None:
        super().__init__(settings, **kwargs)
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            key = self.settings.anthropic_api_key
            options: dict[str, Any] = {"timeout": self.settings.timeout_seconds, "max_retries": 0}
            if key is not None:
                options["api_key"] = key.get_secret_value()
            self._client = anthropic.Anthropic(**options)
        return self._client

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        request: dict[str, Any] = {
            "model": self._require_model(),
            "max_tokens": self.settings.max_output_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
            "output_config": {
                "effort": self.settings.effort,
                "format": {"type": "json_schema", "schema": closed_schema(response_schema)},
            },
        }
        if self.settings.refusal_fallback:
            request["betas"] = [REFUSAL_FALLBACK_BETA]
            request["fallbacks"] = "default"
        try:
            response = self.client.beta.messages.create(**request)
        except anthropic.RateLimitError as exc:
            raise LLMRetryableError(
                "anthropic rate limit", retry_after(exc.response.headers)
            ) from exc
        except anthropic.APIConnectionError as exc:  # includes timeouts
            raise LLMRetryableError(f"anthropic connection error: {type(exc).__name__}") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code in _RETRYABLE_STATUS or exc.status_code >= 500:
                raise LLMRetryableError(
                    f"anthropic status {exc.status_code}", retry_after(exc.response.headers)
                ) from exc
            raise LLMError(f"anthropic status {exc.status_code}: {exc.message}") from exc

        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None)
            raise LLMRefusalError(f"anthropic declined the request (category: {category})")
        if response.stop_reason == "max_tokens":
            raise LLMResponseError("anthropic answer truncated: raise FORJA_LLM_MAX_OUTPUT_TOKENS")
        text = "".join(block.text for block in response.content if block.type == "text")
        usage = response.usage
        return Completion(
            text=text,
            input_tokens=int(usage.input_tokens or 0),
            output_tokens=int(usage.output_tokens or 0),
        )
