"""Instance settings: the language model provider used by plans, the model and the agent."""

from __future__ import annotations

import re
import time

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from forja_api.security import AdminDep, PrincipalDep
from forja_api.state import AppState, StateDep
from forja_core.utils import utcnow
from forja_llm import LLMError
from forja_llm.settings import DEFAULT_MODELS
from forja_llm.store import NO_PROVIDER, LLMCheck, ProviderChoice

router = APIRouter(prefix="/settings", tags=["settings"])

_MODEL_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}")


class LLMKeys(BaseModel):
    anthropic: bool
    openai: bool


class LLMConfigView(BaseModel):
    """The provider in use. API keys are never returned, only whether one is set."""

    provider: ProviderChoice
    model: str | None = Field(description="Model in use; the provider's default if not chosen")
    default_model: str | None
    ollama_base_url: str
    keys: LLMKeys
    source: str = Field(description="environment, or saved (chosen from the interface)")
    last_check: LLMCheck | None = None
    editable: bool = Field(description="The caller may change it (instance administrator)")


class LLMConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ProviderChoice
    model: str | None = Field(default=None, description="Empty: the provider's default model")
    ollama_base_url: str | None = None
    api_key: SecretStr | None = Field(
        default=None, description="Anthropic or OpenAI key; stored outside the repository"
    )

    @field_validator("model")
    @classmethod
    def _model_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        if not _MODEL_RE.fullmatch(value.strip()):
            raise ValueError("invalid model name")
        return value.strip()

    @field_validator("ollama_base_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        if not re.fullmatch(r"https?://[^\s/]+(/\S*)?", value.strip()):
            raise ValueError("the Ollama address must be an http(s) URL")
        return value.strip().rstrip("/")


def _view(state: AppState, *, editable: bool) -> LLMConfigView:
    settings = state.llm_settings
    saved = state.llm_store.load()
    provider = settings.provider.value if settings.provider else NO_PROVIDER
    return LLMConfigView(
        provider=provider,
        model=settings.model_for(provider) if settings.provider else None,
        default_model=DEFAULT_MODELS.get(provider),
        ollama_base_url=settings.ollama_base_url,
        keys=LLMKeys(
            anthropic=settings.anthropic_api_key is not None,
            openai=settings.openai_api_key is not None,
        ),
        source="saved" if saved.provider is not None else "environment",
        last_check=saved.last_check,
        editable=editable,
    )


@router.get("/llm", summary="Language model provider in use (keys are never returned)")
def get_llm(principal: PrincipalDep, state: StateDep) -> LLMConfigView:
    return _view(state, editable=principal.user.is_admin)


@router.put("/llm", summary="Choose the language model provider (instance administrator)")
def put_llm(update: LLMConfigUpdate, admin: AdminDep, state: StateDep) -> LLMConfigView:
    saved = state.llm_store.load()
    changed_provider = saved.provider != update.provider
    saved.provider = update.provider
    saved.model = update.model
    if update.ollama_base_url is not None:
        saved.ollama_base_url = update.ollama_base_url
    if update.api_key is not None and update.api_key.get_secret_value().strip():
        key = SecretStr(update.api_key.get_secret_value().strip())
        if update.provider == "anthropic":
            saved.anthropic_api_key = key
        elif update.provider == "openai":
            saved.openai_api_key = key
    if changed_provider:
        saved.last_check = None
    state.llm_store.save(saved)
    state.configure_llm()
    state.auth.audit(
        admin,
        "settings.llm",
        object_type="settings",
        object_id="llm",
        details={
            "provider": update.provider,
            "model": update.model,
            "api_key_changed": update.api_key is not None,
        },
    )
    return _view(state, editable=True)


@router.post(
    "/llm/test",
    summary="Reach the provider and look up the model (no data is sent)",
)
def test_llm(admin: AdminDep, state: StateDep) -> LLMCheck:
    settings = state.llm_settings
    provider = state.llm
    started = time.perf_counter()
    if provider is None:
        ok, message = True, "Aucun fournisseur : les heuristiques de Forja sont utilisées."
    else:
        try:
            provider.check()
            ok, message = True, f"{provider.model} répond."
        except LLMError as exc:
            ok, message = False, str(exc)
    check = LLMCheck(
        ok=ok,
        message=message,
        provider=settings.provider.value if settings.provider else NO_PROVIDER,
        model=provider.model if provider else None,
        duration_ms=round((time.perf_counter() - started) * 1000),
        checked_at=utcnow(),
    )
    saved = state.llm_store.load()
    saved.last_check = check
    state.llm_store.save(saved)
    state.auth.audit(
        admin,
        "settings.llm_test",
        object_type="settings",
        object_id="llm",
        details={"provider": check.provider, "ok": ok},
    )
    return check
