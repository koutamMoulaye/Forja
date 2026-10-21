"""Provider selection from configuration (``FORJA_LLM_PROVIDER``)."""

from __future__ import annotations

from forja_llm.base import CallJournal, LLMProvider
from forja_llm.providers import AnthropicProvider, OllamaProvider, OpenAIProvider
from forja_llm.settings import LLMSettings, ProviderName

PROVIDERS: dict[ProviderName, type[LLMProvider]] = {
    ProviderName.ANTHROPIC: AnthropicProvider,
    ProviderName.OPENAI: OpenAIProvider,
    ProviderName.OLLAMA: OllamaProvider,
}


def get_provider(
    settings: LLMSettings | None = None, *, journal: CallJournal | None = None
) -> LLMProvider | None:
    """The configured provider, or None: Forja then uses its deterministic heuristics."""
    settings = settings or LLMSettings()
    if settings.provider is None:
        return None
    return PROVIDERS[settings.provider](settings, journal=journal)
