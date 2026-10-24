from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import httpx2
import openai
import pytest
from pydantic import BaseModel, ValidationError

from forja_api.state import AppState
from forja_core.catalog import Catalog
from forja_core.ingestion import IngestionService
from forja_core.llm_calls import LLMCall
from forja_core.models import Project
from forja_llm import (
    LLMConfigurationError,
    LLMProvider,
    LLMRefusalError,
    LLMRequest,
    LLMResponseError,
    LLMRetryableError,
    LLMSafeContext,
    LLMSettings,
    ProviderName,
    SourceContext,
    build_safe_context,
    get_provider,
    serialize_for_llm,
)
from forja_llm.base import Completion
from forja_llm.context import SafeColumn
from forja_llm.providers import AnthropicProvider, OllamaProvider, OpenAIProvider
from forja_llm.providers.anthropic_provider import REFUSAL_FALLBACK_BETA
from tests.fixtures import ecommerce as ec
from tests.fixtures import generate as fx
from tests.shop import build_shop, shop_settings


class _Proposal(BaseModel):
    tables: list[str]


# --- Safe context --------------------------------------------------------------------


@pytest.fixture(scope="module")
def shop_context(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[LLMSafeContext, AppState]]:
    """Context of the e-commerce project with profiles, Silver plans and relations."""
    state, project = build_shop(shop_settings(tmp_path_factory.mktemp("llm")), ecommerce_dir)
    items = []
    for source in state.catalog.list_sources(project.id):
        table = state.catalog.find_table(project.id, f"stg_{source.name}")
        items.append(
            SourceContext(
                source=source,
                profile=state.catalog.get_profile(source.id),
                plan=state.catalog.get_plan(source.id),
                table=table,
            )
        )
    context = build_safe_context(project, items, state.catalog.list_relations(project.id))
    yield context, state
    state.close()


def _leaks(payload: str, values: set[str]) -> list[str]:
    """Values found in the payload: as JSON strings, or as raw text when long enough."""
    leaked = []
    for value in values:
        if not value:
            continue
        if json.dumps(value) in payload or (len(value) >= 6 and value in payload):
            leaked.append(value)
    return sorted(leaked)


def test_no_fixture_value_reaches_the_context(
    shop_context: tuple[LLMSafeContext, AppState],
) -> None:
    context, _ = shop_context
    payload = serialize_for_llm(context)
    assert _leaks(payload, ec.all_values()) == []


def test_leak_check_catches_a_value(shop_context: tuple[LLMSafeContext, AppState]) -> None:
    context, _ = shop_context
    payload = serialize_for_llm(context)
    sample = next(iter(sorted(ec.all_values())))
    assert _leaks(payload + json.dumps(sample), ec.all_values()) == [sample]


def test_context_covers_profiles_plans_and_relations(
    shop_context: tuple[LLMSafeContext, AppState],
) -> None:
    context, _ = shop_context
    sources = {s.name: s for s in context.sources}
    assert sorted(sources) == ["clients", "commandes", "lignes_commande", "produits"]
    lines = sources["lignes_commande"]
    assert lines.silver_table == "stg_lignes_commande"
    assert lines.primary_key == ["id_commande", "num_ligne"]
    columns = {c.name: c for c in lines.columns}
    assert columns["prix_unitaire"].silver_type is not None
    assert columns["prix_unitaire"].silver_type.value == "decimal(18,2)"
    clients = {c.name: c for c in sources["clients"].columns}
    assert clients["email"].pii_type is not None
    # Relations name tables by source, as the plans the model answers with.
    assert {(r.from_source, r.from_column, r.to_source) for r in context.relations} == {
        ("commandes", "id_client", "clients"),
        ("lignes_commande", "code_produit", "produits"),
        ("lignes_commande", "id_commande", "commandes"),
    }
    assert all("stg_" not in r.model_dump_json() for r in context.relations)
    payload = serialize_for_llm(context)
    for forbidden in ("top_values", "min", "max", "mean"):
        assert f'"{forbidden}"' not in payload


def test_fr_csv_context_has_no_value(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    [source] = ingestion.ingest_file(project.id, fixtures_dir / fx.FR_CSV, fx.FR_CSV)
    context = build_safe_context(project, [(source, catalog.get_profile(source.id))])
    values = {cell for row in fx.fr_csv_rows() for cell in row}
    assert _leaks(serialize_for_llm(context), values) == []


def test_safe_models_reject_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        SafeColumn.model_validate(
            {
                "name": "email",
                "physical_type": "VARCHAR",
                "inferred_type": "string",
                "null_pct": 0,
                "distinct_count": 1,
                "uniqueness": 1,
                "is_unique": True,
                "sample_values": ["jean.dupont@example.fr"],
            }
        )


def test_safe_models_reject_free_text_formats() -> None:
    with pytest.raises(ValidationError):
        SafeColumn(
            name="d",
            physical_type="VARCHAR",
            inferred_type="date",  # type: ignore[arg-type]
            date_format="jean.dupont@example.fr",
            null_pct=0,
            distinct_count=1,
            uniqueness=1,
            is_unique=True,
        )


def test_serialize_rejects_other_objects() -> None:
    with pytest.raises(TypeError):
        serialize_for_llm({"rows": [1, 2]})  # type: ignore[arg-type]


def test_request_requires_safe_context() -> None:
    with pytest.raises(ValidationError):
        LLMRequest(task="Propose", context={"rows": [["jean", "dupont"]]})  # type: ignore[arg-type]


# --- Provider selection ----------------------------------------------------------------


def test_no_provider_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FORJA_LLM_PROVIDER", raising=False)
    assert get_provider(LLMSettings(_env_file=None)) is None  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("name", "provider_type"),
    [("anthropic", AnthropicProvider), ("openai", OpenAIProvider), ("ollama", OllamaProvider)],
)
def test_provider_selected_from_environment(
    monkeypatch: pytest.MonkeyPatch, name: str, provider_type: type[LLMProvider]
) -> None:
    monkeypatch.setenv("FORJA_LLM_PROVIDER", name)
    provider = get_provider()
    assert isinstance(provider, provider_type)
    assert provider.name == name


def test_unknown_provider_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FORJA_LLM_PROVIDER", "unknown")
    with pytest.raises(ValidationError):
        get_provider()


def test_default_models() -> None:
    assert AnthropicProvider(LLMSettings(provider=ProviderName.ANTHROPIC)).model == (
        "claude-opus-5-5"
    )
    assert OpenAIProvider(LLMSettings(provider=ProviderName.OPENAI)).model is None
    assert OpenAIProvider(LLMSettings(model="custom")).model == "custom"


# --- Structured generation: retries, validation, journal ------------------------------


def _context() -> LLMSafeContext:
    return LLMSafeContext(project_name="P", architecture="medallion", sources=[])  # type: ignore[arg-type]


class _Scripted(LLMProvider):
    """Plays a script of completions or errors."""

    name = "scripted"

    def __init__(self, script: list[Completion | Exception], **kwargs: Any) -> None:
        super().__init__(
            LLMSettings(model="m", max_attempts=3, backoff_base_seconds=1),
            **kwargs,
        )
        self.script = list(script)
        self.prompts: list[str] = []

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.prompts.append(prompt)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def _request() -> LLMRequest:
    return LLMRequest(task="Propose", context=_context(), purpose="test", project_id="p1")


def test_generate_validates_and_journals() -> None:
    calls: list[LLMCall] = []
    provider = _Scripted([Completion('{"tables": ["fct_ventes"]}', 120, 30)], journal=calls.append)
    assert provider.generate(_request(), _Proposal) == _Proposal(tables=["fct_ventes"])
    [call] = calls
    assert (call.status, call.attempts, call.input_tokens, call.output_tokens) == (
        "succeeded", 1, 120, 30,
    )  # fmt: skip
    assert call.project_id == "p1" and call.purpose == "test"
    assert len(call.prompt_sha256) == 64
    assert "Propose" not in call.model_dump_json()  # the journal never holds the prompt


def test_invalid_answer_is_retried_with_feedback() -> None:
    provider = _Scripted([Completion('{"unexpected": 1}'), Completion('{"tables": []}')])
    assert provider.generate(_request(), _Proposal) == _Proposal(tables=[])
    assert "did not validate" in provider.prompts[1]
    assert "tables: Field required" in provider.prompts[1]


def test_answer_in_a_code_fence_is_accepted() -> None:
    provider = _Scripted([Completion('```json\n{"tables": ["a"]}\n```')])
    assert provider.generate(_request(), _Proposal).tables == ["a"]


def test_transient_errors_are_retried_with_backoff() -> None:
    delays: list[float] = []
    calls: list[LLMCall] = []
    provider = _Scripted(
        [
            LLMRetryableError("rate limited", retry_after=7),
            LLMRetryableError("server"),
            Completion('{"tables": []}', 10, 5),
        ],
        sleep=delays.append,
        journal=calls.append,
    )
    provider.generate(_request(), _Proposal)
    assert delays[0] == 7  # retry-after wins
    assert 2 <= delays[1] <= 2.5  # 1 s * 2 ** (2 - 1), plus jitter
    assert calls[0].attempts == 3


def test_exhausted_retries_fail_and_are_journaled() -> None:
    calls: list[LLMCall] = []
    provider = _Scripted(
        [LLMRetryableError("a"), LLMRetryableError("b"), LLMRetryableError("c")],
        sleep=lambda _: None,
        journal=calls.append,
    )
    with pytest.raises(LLMRetryableError):
        provider.generate(_request(), _Proposal)
    assert (calls[0].status, calls[0].error_type) == ("failed", "LLMRetryableError")


def test_never_valid_answer_raises() -> None:
    provider = _Scripted([Completion("nope")] * 3)
    with pytest.raises(LLMResponseError):
        provider.generate(_request(), _Proposal)


def test_journal_is_persisted_in_the_catalog(catalog: Catalog) -> None:
    provider = _Scripted([Completion('{"tables": []}', 1, 1)], journal=catalog.add_llm_call)
    provider.generate(_request(), _Proposal)
    [call] = catalog.list_llm_calls("p1")
    assert call.status == "succeeded"


# --- Providers with mocked clients -----------------------------------------------------


def _anthropic_response(
    text: str, stop_reason: str = "end_turn", category: str | None = None
) -> Any:
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(category=category),
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=42, output_tokens=7),
    )


class _FakeMessages:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = outcomes
        self.requests: list[dict[str, Any]] = []

    def create(self, **request: Any) -> Any:
        self.requests.append(request)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _rate_limit(error_type: type[Exception]) -> Exception:
    request = httpx2.Request("POST", "https://api.example.test")
    response = httpx2.Response(429, headers={"retry-after": "3"}, request=request)
    return error_type("slow down", response=response, body=None)  # type: ignore[call-arg]


def test_anthropic_provider_request_and_usage() -> None:
    messages = _FakeMessages(
        [_rate_limit(anthropic.RateLimitError), _anthropic_response('{"tables": ["x"]}')]
    )
    delays: list[float] = []
    provider = AnthropicProvider(
        LLMSettings(provider=ProviderName.ANTHROPIC),
        client=SimpleNamespace(beta=SimpleNamespace(messages=messages)),
        sleep=delays.append,
    )
    assert provider.generate(_request(), _Proposal).tables == ["x"]
    assert delays == [3.0]
    request = messages.requests[-1]
    assert request["model"] == "claude-opus-5-5"
    assert request["fallbacks"] == "default"
    assert request["betas"] == [REFUSAL_FALLBACK_BETA]
    output = request["output_config"]
    assert output["effort"] == "high"
    assert output["format"]["type"] == "json_schema"
    assert output["format"]["schema"]["additionalProperties"] is False
    assert "tool_choice" not in request


def test_anthropic_refusal_and_client_errors() -> None:
    messages = _FakeMessages([_anthropic_response("", stop_reason="refusal", category="cyber")])
    provider = AnthropicProvider(
        LLMSettings(provider=ProviderName.ANTHROPIC, refusal_fallback=False),
        client=SimpleNamespace(beta=SimpleNamespace(messages=messages)),
    )
    with pytest.raises(LLMRefusalError, match="cyber"):
        provider.generate(_request(), _Proposal)
    assert "fallbacks" not in messages.requests[0]


def test_openai_provider() -> None:
    answer = SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason="stop",
                message=SimpleNamespace(content='{"tables": ["y"]}', refusal=None),
            )
        ],
        usage=SimpleNamespace(prompt_tokens=11, completion_tokens=3),
    )
    completions = _FakeMessages([_rate_limit(openai.RateLimitError), answer])
    calls: list[LLMCall] = []
    provider = OpenAIProvider(
        LLMSettings(provider=ProviderName.OPENAI, model="gpt-test"),
        client=SimpleNamespace(chat=SimpleNamespace(completions=completions)),
        sleep=lambda _: None,
        journal=calls.append,
    )
    assert provider.generate(_request(), _Proposal).tables == ["y"]
    request = completions.requests[-1]
    assert request["response_format"]["type"] == "json_schema"
    assert request["messages"][0]["role"] == "system"
    assert (calls[0].input_tokens, calls[0].attempts) == (11, 2)


def test_ollama_provider() -> None:
    seen: list[dict[str, Any]] = []
    statuses = [503, 200]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        status = statuses.pop(0)
        if status != 200:
            return httpx.Response(status)
        return httpx.Response(
            200,
            json={
                "message": {"content": '{"tables": ["z"]}'},
                "prompt_eval_count": 9,
                "eval_count": 4,
            },
        )

    client = httpx.Client(base_url="http://ollama.test", transport=httpx.MockTransport(handler))
    provider = OllamaProvider(
        LLMSettings(provider=ProviderName.OLLAMA), client=client, sleep=lambda _: None
    )
    assert provider.generate(_request(), _Proposal).tables == ["z"]
    assert seen[-1]["model"] == "qwen3.5:9b" and seen[-1]["stream"] is False
    assert seen[-1]["format"]["type"] == "object"
    assert seen[-1]["think"] is False and seen[-1]["keep_alive"] == "30m"
    assert seen[-1]["options"]["num_ctx"] == 16_384
    assert seen[-1]["options"]["num_predict"] == 16_000


def test_timeout_defaults_to_local_or_cloud() -> None:
    settings = LLMSettings()
    assert settings.timeout_for("ollama") == 1800
    assert settings.timeout_for("anthropic") == settings.timeout_for("openai") == 120
    assert LLMSettings(timeout_seconds=30).timeout_for("ollama") == 30


def test_ollama_missing_model() -> None:
    client = httpx.Client(
        base_url="http://ollama.test",
        transport=httpx.MockTransport(lambda _: httpx.Response(404)),
    )
    provider = OllamaProvider(LLMSettings(provider=ProviderName.OLLAMA), client=client)
    with pytest.raises(LLMConfigurationError, match="ollama pull"):
        provider.generate(_request(), _Proposal)


# --- Real providers, skipped without credentials ----------------------------------------


def _ollama_available(url: str) -> bool:
    try:
        return httpx.get(f"{url}/api/tags", timeout=1).status_code == 200
    except httpx.HTTPError:
        return False


_OLLAMA_URL = os.environ.get("FORJA_LLM_OLLAMA_BASE_URL", "http://localhost:11434")
# CI runs with the mocked model only: no real provider is called, even if reachable.
_NO_REAL = os.environ.get("FORJA_SKIP_REAL_LLM_TESTS") == "1"


@pytest.mark.parametrize(
    "provider_name",
    [
        pytest.param(
            "anthropic",
            marks=pytest.mark.skipif(
                _NO_REAL or not os.environ.get("ANTHROPIC_API_KEY"),
                reason="ANTHROPIC_API_KEY not set (or real LLM tests disabled)",
            ),
        ),
        pytest.param(
            "openai",
            marks=pytest.mark.skipif(
                _NO_REAL
                or not (os.environ.get("OPENAI_API_KEY") and os.environ.get("FORJA_LLM_MODEL")),
                reason="OPENAI_API_KEY and FORJA_LLM_MODEL not set (or real LLM tests disabled)",
            ),
        ),
        pytest.param(
            "ollama",
            marks=pytest.mark.skipif(
                _NO_REAL or not _ollama_available(_OLLAMA_URL),
                reason="Ollama not reachable (or real LLM tests disabled)",
            ),
        ),
    ],
)
def test_real_provider_structured_output(provider_name: str) -> None:
    provider = get_provider(LLMSettings(provider=ProviderName(provider_name)))
    assert provider is not None
    result = provider.generate(
        LLMRequest(
            task="List two plausible star schema table names for an online shop.",
            context=_context(),
        ),
        _Proposal,
    )
    assert result.tables
