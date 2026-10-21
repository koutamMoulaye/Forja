"""LLM configuration, loaded from environment variables prefixed with ``FORJA_LLM_``."""

from __future__ import annotations

from enum import StrEnum

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderName(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"


DEFAULT_MODELS: dict[str, str] = {
    ProviderName.ANTHROPIC: "claude-opus-5-5",
    ProviderName.OLLAMA: "llama3.1",
}


class LLMSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FORJA_LLM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    provider: ProviderName = ProviderName.OLLAMA
    model: str | None = None
    timeout_seconds: float = Field(default=60.0, gt=0)

    anthropic_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("FORJA_LLM_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("FORJA_LLM_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    ollama_base_url: str = "http://localhost:11434"

    def model_for(self, provider: str) -> str | None:
        return self.model or DEFAULT_MODELS.get(provider)
