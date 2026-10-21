from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from forja_core.catalog import Catalog
from forja_core.ingestion import IngestionService
from forja_core.models import Project
from forja_llm import (
    LLMProvider,
    LLMRequest,
    LLMResponseError,
    LLMSafeContext,
    LLMSettings,
    ProviderName,
    build_safe_context,
    get_provider,
    serialize_for_llm,
)
from forja_llm.context import SafeColumn
from forja_llm.providers import AnthropicProvider, OllamaProvider, OpenAIProvider
from tests.fixtures import generate as fx


class _Proposal(BaseModel):
    tables: list[str]


@pytest.fixture
def safe_context(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> LLMSafeContext:
    sources = ingestion.ingest_file(project.id, fixtures_dir / fx.FR_CSV, fx.FR_CSV)
    return build_safe_context(project, [(s, catalog.get_profile(s.id)) for s in sources])


def test_safe_context_contains_no_raw_values(
    safe_context: LLMSafeContext, catalog: Catalog, project: Project
) -> None:
    payload = serialize_for_llm(safe_context)
    rows = fx.fr_csv_rows()
    raw_values = {cell for row in rows for cell in row if len(cell) >= 4}
    leaked = sorted(v for v in raw_values if v in payload)
    assert leaked == []

    profile = catalog.get_profile(catalog.list_sources(project.id)[0].id)
    for column in profile.columns:
        for top in column.top_values:
            if len(top.value) >= 4:
                assert top.value not in payload


def test_safe_context_keeps_schema_and_statistics(safe_context: LLMSafeContext) -> None:
    [source] = safe_context.sources
    columns = {c.name: c for c in source.columns}
    assert source.row_count == 32
    assert columns["date_inscription"].date_format == "%d/%m/%Y"
    assert columns["montant_total"].decimal_separator == ","
    assert columns["montant_total"].numeric_mean is not None
    assert columns["email"].pii_type is not None
    assert columns["id"].numeric_min is not None


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


@pytest.mark.parametrize(
    ("name", "provider_type"),
    [
        ("anthropic", AnthropicProvider),
        ("openai", OpenAIProvider),
        ("ollama", OllamaProvider),
    ],
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
    settings = LLMSettings(provider=ProviderName.ANTHROPIC)
    assert get_provider(settings).model == "claude-opus-5-5"
    assert get_provider(LLMSettings(provider=ProviderName.OPENAI)).model is None
    assert get_provider(LLMSettings(provider=ProviderName.OPENAI, model="custom")).model == "custom"


def test_stub_providers_are_not_implemented(safe_context: LLMSafeContext) -> None:
    provider = get_provider(LLMSettings(provider=ProviderName.ANTHROPIC))
    with pytest.raises(NotImplementedError):
        provider.generate(LLMRequest(task="Propose a model", context=safe_context), _Proposal)


class _FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self, answer: str) -> None:
        super().__init__(LLMSettings())
        self.answer = answer
        self.prompts: list[str] = []

    def _complete(self, *, system: str, prompt: str, response_schema: dict[str, Any]) -> str:
        self.prompts.append(prompt)
        return self.answer


def test_generate_validates_structured_output(safe_context: LLMSafeContext) -> None:
    provider = _FakeProvider('{"tables": ["silver_clients"]}')
    result = provider.generate(LLMRequest(task="Propose", context=safe_context), _Proposal)
    assert result == _Proposal(tables=["silver_clients"])
    assert "jean.dupont@example.fr" not in provider.prompts[0]
    assert '"date_format":"%d/%m/%Y"' in provider.prompts[0]


def test_generate_rejects_invalid_output(safe_context: LLMSafeContext) -> None:
    provider = _FakeProvider('{"unexpected": true}')
    with pytest.raises(LLMResponseError):
        provider.generate(LLMRequest(task="Propose", context=safe_context), _Proposal)


def test_request_requires_safe_context() -> None:
    with pytest.raises(ValidationError):
        LLMRequest(task="Propose", context={"rows": [["jean", "dupont"]]})  # type: ignore[arg-type]
