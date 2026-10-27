"""Provider chosen from the interface, saved next to the other secrets of the instance.

The environment (``FORJA_LLM_*``) gives the defaults. An administrator can then pick
another provider, model or API key from the settings screen; the choice is written to
``llm.json`` in ``FORJA_SECRETS_DIR`` (outside the repository and the data directory,
readable by the current user only) and wins over the environment. API keys are never
sent back: the API only says whether one is set.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, SecretStr

from forja_llm.settings import LLMSettings, ProviderName

NO_PROVIDER = "none"
ProviderChoice = Literal["ollama", "anthropic", "openai", "none"]


class LLMCheck(BaseModel):
    """Outcome of the last connection test."""

    ok: bool
    message: str
    provider: str
    model: str | None
    duration_ms: int
    checked_at: datetime


class SavedLLMConfig(BaseModel):
    provider: ProviderChoice | None = None
    """None: follow the environment; "none": no provider, heuristics only."""
    model: str | None = None
    ollama_base_url: str | None = None
    anthropic_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    last_check: LLMCheck | None = None


class LLMConfigStore:
    FILENAME = "llm.json"

    def __init__(self, directory: Path) -> None:
        self.path = directory.expanduser() / self.FILENAME

    def load(self) -> SavedLLMConfig:
        if not self.path.exists():
            return SavedLLMConfig()
        return SavedLLMConfig.model_validate_json(self.path.read_text(encoding="utf-8"))

    def save(self, config: SavedLLMConfig) -> None:
        payload = config.model_dump(mode="json")
        for field in ("anthropic_api_key", "openai_api_key"):
            secret = getattr(config, field)
            payload[field] = None if secret is None else secret.get_secret_value()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        temporary.replace(self.path)


def effective_settings(base: LLMSettings, saved: SavedLLMConfig) -> LLMSettings:
    """The environment settings, overridden by the choice saved from the interface."""
    if saved.provider is None:
        return base
    update: dict[str, object] = {
        "provider": None if saved.provider == NO_PROVIDER else ProviderName(saved.provider),
        "model": saved.model,
    }
    if saved.ollama_base_url:
        update["ollama_base_url"] = saved.ollama_base_url
    if saved.anthropic_api_key is not None:
        update["anthropic_api_key"] = saved.anthropic_api_key
    if saved.openai_api_key is not None:
        update["openai_api_key"] = saved.openai_api_key
    return base.model_copy(update=update)
