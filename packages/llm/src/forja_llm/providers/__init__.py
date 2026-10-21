"""Provider implementations. They are placeholders until the agent step."""

from __future__ import annotations

from typing import Any

from forja_llm.base import LLMProvider
from forja_llm.settings import ProviderName


class _NotImplementedProvider(LLMProvider):
    def _complete(self, *, system: str, prompt: str, response_schema: dict[str, Any]) -> str:
        raise NotImplementedError(f"the {self.name} provider is not implemented yet")


class AnthropicProvider(_NotImplementedProvider):
    name = ProviderName.ANTHROPIC.value


class OpenAIProvider(_NotImplementedProvider):
    name = ProviderName.OPENAI.value


class OllamaProvider(_NotImplementedProvider):
    name = ProviderName.OLLAMA.value


__all__ = ["AnthropicProvider", "OllamaProvider", "OpenAIProvider"]
