"""The evaluation set of the agent, with the mocked model only (no network).

A real model is evaluated with ``uv run python -m tests.agent_eval --provider ollama
--subset`` (5 questions) or ``--provider anthropic`` (all of them).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from forja_api.state import AppState
from forja_core.models import Project
from tests.agent_eval.cases import CASES, subset
from tests.agent_eval.run import EvalReport, MockAgentProvider, build_eval_shop, run_eval


@pytest.fixture(scope="module")
def evaluated(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[EvalReport, AppState, Project]]:
    state, project = build_eval_shop(tmp_path_factory.mktemp("eval"), ecommerce_dir)
    report = run_eval(state, project, MockAgentProvider(CASES), CASES, label="mock")
    yield report, state, project
    state.close()


def test_set_composition() -> None:
    categories = [c.category for c in CASES]
    assert len(CASES) == 20
    assert categories.count("ambigu") == 4 and categories.count("hors_perimetre") == 2
    assert len(subset()) == 5
    assert {c.category for c in subset()} == {"simple", "complexe", "ambigu", "hors_perimetre"}


def test_every_case_passes_with_the_mocked_model(
    evaluated: tuple[EvalReport, AppState, Project],
) -> None:
    report, _, _ = evaluated
    failures = [f"{r.id}: {r.outcome} — {r.reason}" for r in report.results if not r.passed]
    assert failures == [], "\n".join(failures)
    assert report.score == 1.0


def test_paths_and_context_size(evaluated: tuple[EvalReport, AppState, Project]) -> None:
    report, _, _ = evaluated
    paths = {r.id: r.path for r in report.results}
    assert all(paths[c.id] == "parser" for c in CASES if c.category == "simple")
    assert all(paths[c.id] == "llm" for c in CASES if c.category == "complexe")
    assert report.without_llm >= 0.5
    assert all((r.context_tokens or 0) < 1500 for r in report.results)
    assert all(r.input_tokens > 0 for r in report.results if r.path == "llm")
    rendered = report.render()
    assert "Par catégorie" in rendered and "Traitées sans LLM" in rendered


def test_llm_answers_are_cached(evaluated: tuple[EvalReport, AppState, Project]) -> None:
    _, state, project = evaluated
    case = next(c for c in CASES if c.category == "complexe")
    provider = MockAgentProvider(CASES)
    provider.settings = provider.settings.model_copy(update={"cache": True})
    provider.cache = state.catalog
    first = run_eval(state, project, provider, (case,), label="cache")
    second = run_eval(state, project, provider, (case,), label="cache")
    assert first.results[0].path == "llm" and second.results[0].path == "llm_cache"
    assert provider.calls == 1
