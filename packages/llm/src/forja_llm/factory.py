"""Provider selection from configuration (``FORJA_LLM_PROVIDER``)."""

from __future__ import annotations

from forja_llm.base import LLMProvider
from forja_llm.providers import AnthropicProvider, OllamaProvider, OpenAIProvider
from forja_llm.settings import LLMSettings, ProviderName

PROVIDERS: dict[ProviderName, type[LLMProvider]] = {
    ProviderName.ANTHROPIC: AnthropicProvider,
    ProviderName.OPENAI: OpenAIProvider,
    ProviderName.OLLAMA: OllamaProvider,
}


def get_provider(settings: LLMSettings | None = None) -> LLMProvider:
    settings = settings or LLMSettings()
    return PROVIDERS[settings.provider](settings)
