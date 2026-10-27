"""Language model provider chosen from the interface: stored outside the repository,
keys never returned, applied at once to the services that use it."""

from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from forja_llm import LLMConfigurationError
from forja_llm.providers import OllamaProvider
from forja_llm.settings import LLMSettings
from forja_llm.store import LLMConfigStore, SavedLLMConfig, effective_settings
from tests.auth import user_client


def _state(client: TestClient) -> AppState:
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    return state


def test_saved_choice_overrides_the_environment() -> None:
    base = LLMSettings(provider="ollama", model="qwen3.5:9b")
    assert effective_settings(base, SavedLLMConfig()) is base
    none = effective_settings(base, SavedLLMConfig(provider="none"))
    assert none.provider is None
    chosen = effective_settings(
        base,
        SavedLLMConfig(provider="anthropic", anthropic_api_key="sk-test"),  # type: ignore[arg-type]
    )
    assert chosen.provider == "anthropic" and chosen.model is None
    assert chosen.anthropic_api_key is not None


def test_llm_settings_api(client: TestClient, settings: Settings) -> None:
    initial = client.get("/settings/llm").json()
    assert initial["provider"] == "none" and initial["source"] == "environment"
    assert initial["editable"] is True

    chosen = client.put(
        "/settings/llm",
        json={"provider": "anthropic", "model": "claude-opus-5-5", "api_key": "sk-secret-123"},
    )
    assert chosen.status_code == 200, chosen.text
    body = chosen.json()
    assert body["provider"] == "anthropic" and body["model"] == "claude-opus-5-5"
    assert body["keys"] == {"anthropic": True, "openai": False}
    assert body["source"] == "saved"
    assert "sk-secret-123" not in chosen.text
    assert "sk-secret-123" not in client.get("/settings/llm").text
    audit = client.get("/audit").json()
    assert any(e["action"] == "settings.llm" for e in audit)
    assert "sk-secret-123" not in str(audit)

    # Stored with the other secrets, outside the data directory.
    stored = settings.secrets_dir / LLMConfigStore.FILENAME
    assert stored.exists() and not stored.is_relative_to(settings.data_dir)
    if sys.platform != "win32":
        assert stored.stat().st_mode & 0o777 == 0o600
    assert os.fspath(stored).endswith("llm.json")

    state = _state(client)
    assert state.llm is not None and state.llm.name == "anthropic"
    assert state.gold.proposer is not None and state.marts.interpreter is not None

    switched = client.put("/settings/llm", json={"provider": "none"}).json()
    assert switched["provider"] == "none"
    assert state.llm is None and state.gold.proposer is None and state.marts.interpreter is None
    tested = client.post("/settings/llm/test").json()
    assert tested["ok"] is True and tested["provider"] == "none"
    assert client.get("/settings/llm").json()["last_check"]["ok"] is True

    bad = client.put("/settings/llm", json={"provider": "ollama", "ollama_base_url": "file:///x"})
    assert bad.status_code == 422
    assert client.put("/settings/llm", json={"provider": "mistral"}).status_code == 422


def test_connection_test_reports_failures(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/settings/llm", json={"provider": "ollama", "model": "mistral-small3:24b"})

    def missing(self: OllamaProvider) -> None:
        raise LLMConfigurationError("Le modèle mistral-small3:24b n'est pas installé")

    monkeypatch.setattr(OllamaProvider, "check", missing)
    check = client.post("/settings/llm/test").json()
    assert check["ok"] is False and "pas installé" in check["message"]
    assert check["model"] == "mistral-small3:24b"

    monkeypatch.setattr(OllamaProvider, "check", lambda self: None)
    assert client.post("/settings/llm/test").json()["ok"] is True


def test_only_the_instance_administrator_changes_it(settings: Settings) -> None:
    from tests.auth import api_client

    with api_client(settings.model_copy(update={"auth_mode": "multi"})) as admin:
        project_id = admin.post("/projects", json={"name": "Réglages"}).json()["id"]
        with user_client(admin, project_id, "chef@exemple.fr", "admin") as owner:
            view = owner.get("/settings/llm").json()
            assert view["editable"] is False
            assert owner.put("/settings/llm", json={"provider": "none"}).status_code == 403
            assert owner.post("/settings/llm/test").status_code == 403
