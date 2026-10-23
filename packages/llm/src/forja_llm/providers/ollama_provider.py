"""Ollama, a local model server, through its REST API (``/api/chat``).

The JSON schema is passed as ``format`` so the model is constrained to it.
"""

from __future__ import annotations

from typing import Any

import httpx

from forja_llm.base import (
    Completion,
    LLMConfigurationError,
    LLMError,
    LLMProvider,
    LLMRetryableError,
)
from forja_llm.providers.anthropic_provider import retry_after
from forja_llm.settings import LLMSettings, ProviderName

_RETRYABLE_STATUS = frozenset({408, 429, 503})


class OllamaProvider(LLMProvider):
    name = ProviderName.OLLAMA.value

    def __init__(
        self, settings: LLMSettings, *, client: httpx.Client | None = None, **kwargs: Any
    ) -> None:
        super().__init__(settings, **kwargs)
        self._client = client

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.settings.ollama_base_url,
                timeout=self.settings.timeout_for(self.name),
            )
        return self._client

    def _abort(self) -> None:
        """Closing the connection makes Ollama stop reading or writing for this request."""
        client, self._client = self._client, None
        if client is not None:
            client.close()

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        model = self._require_model()
        try:
            response = self.client.post(
                "/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "format": response_schema,
                    "stream": False,
                    "think": self.settings.ollama_think,
                    "keep_alive": self.settings.ollama_keep_alive,
                    "options": {
                        "temperature": 0,
                        "num_ctx": self.settings.ollama_num_ctx,
                        "num_predict": self.settings.max_output_tokens,
                    },
                },
            )
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise LLMRetryableError(f"ollama unreachable: {type(exc).__name__}") from exc

        if response.status_code == 404:
            raise LLMConfigurationError(
                f"ollama model '{model}' not found: run `ollama pull {model}`"
            )
        if response.status_code in _RETRYABLE_STATUS or response.status_code >= 500:
            raise LLMRetryableError(
                f"ollama status {response.status_code}", retry_after(response.headers)
            )
        if response.status_code >= 400:
            raise LLMError(f"ollama status {response.status_code}")
        body = response.json()
        return Completion(
            text=str(body.get("message", {}).get("content", "")),
            input_tokens=int(body.get("prompt_eval_count") or 0),
            output_tokens=int(body.get("eval_count") or 0),
        )
