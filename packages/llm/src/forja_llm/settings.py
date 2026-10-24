"""LLM configuration, loaded from environment variables prefixed with ``FORJA_LLM_``."""

from __future__ import annotations

from enum import StrEnum

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderName(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"


DEFAULT_MODELS: dict[str, str] = {
    ProviderName.ANTHROPIC: "claude-opus-5-5",
    ProviderName.OLLAMA: "qwen3.5:9b",
}

CLOUD_TIMEOUT_SECONDS = 120.0
# A local model running on CPU can take minutes to write a Gold plan.
LOCAL_TIMEOUT_SECONDS = 1800.0


class LLMSettings(BaseSettings):
    """No provider by default: Forja then relies on its deterministic heuristics."""

    model_config = SettingsConfigDict(
        env_prefix="FORJA_LLM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    provider: ProviderName | None = None
    model: str | None = None
    timeout_seconds: float | None = Field(
        default=None, gt=0, description="Per call; default 120 s, 1800 s for Ollama"
    )
    max_attempts: int = Field(default=3, ge=1, le=10, description="Calls per generation")
    backoff_base_seconds: float = Field(default=1.0, ge=0)
    backoff_max_seconds: float = Field(default=30.0, ge=0)
    max_output_tokens: int = Field(default=16_000, gt=0)
    effort: str = Field(default="high", description="Anthropic output effort")
    refusal_fallback: bool = Field(
        default=True, description="Anthropic: retry a declined request on a fallback model"
    )
    cache: bool = Field(
        default=True,
        description="Reuse the validated answer of an identical prompt instead of calling again",
    )

    anthropic_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("FORJA_LLM_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("FORJA_LLM_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    ollama_base_url: str = "http://localhost:11434"
    ollama_num_ctx: int = Field(
        default=16_384, ge=2_048, description="Context window; longer prompts are truncated"
    )
    ollama_think: bool = Field(default=False, description="Reasoning of thinking models")
    ollama_keep_alive: str = Field(default="30m", description="How long the model stays loaded")

    @field_validator("provider", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        """``FORJA_LLM_PROVIDER=`` (empty) means no provider, as when it is unset."""
        return None if isinstance(value, str) and not value.strip() else value

    def model_for(self, provider: str) -> str | None:
        return self.model or DEFAULT_MODELS.get(provider)

    def timeout_for(self, provider: str) -> float:
        if self.timeout_seconds is not None:
            return self.timeout_seconds
        if provider == ProviderName.OLLAMA:
            return LOCAL_TIMEOUT_SECONDS
        return CLOUD_TIMEOUT_SECONDS
