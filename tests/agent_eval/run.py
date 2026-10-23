"""Evaluation of the business agent: every case goes through the real pipeline
(pre-selection, parser, model when needed, validation, compilation, preview) on the
e-commerce shop built up to Gold."""

from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from forja_api.state import AppState
from forja_core.agent.models import MartIteration, MartRequest
from forja_core.agent.spec import FilterOperator, MartSpec
from forja_core.auth.models import Principal, User
from forja_core.models import Project
from forja_core.semantic.text import key
from forja_core.utils import utcnow
from forja_llm.agent import LLMMartInterpreter
from forja_llm.base import Completion, LLMProvider
from forja_llm.settings import LLMSettings
from tests.agent_eval.cases import (
    TODAY,
    Case,
    ExpectedClarification,
    ExpectedMart,
    ExpectedRefusal,
)
from tests.shop import build_gold_shop, shop_settings

_REQUEST = re.compile(r"^Request: (.*)$", re.MULTILINE)


class MockAgentProvider(LLMProvider):
    """Answers each question with the case's ``mock`` answer, like a well-behaved model."""

    name = "mock"

    def __init__(self, cases: tuple[Case, ...]) -> None:
        super().__init__(LLMSettings(model="mock", max_attempts=1, cache=False))
        self.answers = {c.question: c.mock for c in cases}
        self.calls = 0

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.calls += 1
        match = _REQUEST.search(prompt)
        answer = self.answers.get(match.group(1).strip()) if match else None
        text = (
            answer.model_dump_json()
            if answer is not None
            else '{"kind": "refusal", "refusal_reason": "question inconnue du mock"}'
        )
        # Token counts as a model would report them (about 3.2 characters per token).
        return Completion(text, round(len(system + prompt) / 3.2), round(len(text) / 3.2))


@dataclass
class CaseResult:
    id: str
    category: str
    question: str
    passed: bool
    outcome: str
    path: str | None
    reason: str = ""
    duration_s: float = 0.0
    context_tokens: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    llm_duration_ms: int = 0


@dataclass
class EvalReport:
    provider: str
    results: list[CaseResult] = field(default_factory=list)

    @property
    def score(self) -> float:
        return sum(r.passed for r in self.results) / len(self.results) if self.results else 0.0

    def by(self, attribute: str) -> dict[str, tuple[int, int]]:
        groups: dict[str, tuple[int, int]] = {}
        for result in self.results:
            name = str(getattr(result, attribute))
            passed, total = groups.get(name, (0, 0))
            groups[name] = (passed + result.passed, total + 1)
        return groups

    @property
    def without_llm(self) -> float:
        handled = [r for r in self.results if r.path == "parser"]
        return len(handled) / len(self.results) if self.results else 0.0

    @property
    def mean_context_tokens(self) -> float:
        sizes = [r.context_tokens for r in self.results if r.context_tokens is not None]
        return sum(sizes) / len(sizes) if sizes else 0.0

    def render(self) -> str:
        lines = [
            f"Évaluation de l'agent métier ({self.provider}) : "
            f"{sum(r.passed for r in self.results)}/{len(self.results)} ({self.score:.0%})",
            "",
            "Par catégorie : "
            + ", ".join(f"{k} {p}/{t}" for k, (p, t) in sorted(self.by("category").items())),
            "Par chemin : "
            + ", ".join(f"{k} {p}/{t}" for k, (p, t) in sorted(self.by("path").items())),
            f"Traitées sans LLM : {self.without_llm:.0%} ; contexte moyen : "
            f"{self.mean_context_tokens:.0f} tokens (estimés)",
            "",
            f"{'id':<4} {'ok':<3} {'chemin':<10} {'durée':>7} {'ctx':>5} {'in':>6} "
            f"{'out':>5}  résultat",
        ]
        for r in self.results:
            lines.append(
                f"{r.id:<4} {'✓' if r.passed else '✗':<3} {r.path or '-':<10} "
                f"{r.duration_s:>6.1f}s {r.context_tokens or 0:>5} {r.input_tokens:>6} "
                f"{r.output_tokens:>5}  {r.outcome}" + (f" — {r.reason}" if r.reason else "")
            )
        return "\n".join(lines)

    def to_json(self) -> str:
        return json.dumps(
            {
                "provider": self.provider,
                "score": self.score,
                "by_category": self.by("category"),
                "by_path": self.by("path"),
                "without_llm": self.without_llm,
                "mean_context_tokens": self.mean_context_tokens,
                "results": [asdict(r) for r in self.results],
            },
            ensure_ascii=False,
            indent=2,
        )


def _values(value: object) -> tuple[str, ...]:
    items = value if isinstance(value, list) else [value]
    return tuple(sorted(" ".join(key(str(v))) for v in items))


def _filter_key(
    field_name: str, operator: FilterOperator, value: object
) -> tuple[str, str, tuple[str, ...]]:
    values = _values(value)
    op = operator.value
    if op == "in" and len(values) == 1:
        op = "eq"
    if op == "not_in" and len(values) == 1:
        op = "neq"
    return field_name, op, values


def compare(expected: ExpectedMart, spec: MartSpec) -> str:
    """Empty when the spec matches; otherwise what differs."""
    problems = []
    if set(spec.metrics) != set(expected.metrics):
        problems.append(f"métriques {sorted(spec.metrics)} ≠ {sorted(expected.metrics)}")
    if set(spec.axes) != set(expected.axes):
        problems.append(f"axes {sorted(spec.axes)} ≠ {sorted(expected.axes)}")
    grain = spec.time_grain.value if spec.time_grain else None
    if grain != expected.time_grain:
        problems.append(f"granularité {grain} ≠ {expected.time_grain}")
    found = {_filter_key(f.field, f.operator, f.value) for f in spec.filters}
    wanted = {(f, o, tuple(sorted(" ".join(key(v)) for v in vs))) for f, o, vs in expected.filters}
    if found != wanted:
        problems.append(f"filtres {sorted(found)} ≠ {sorted(wanted)}")
    period = (spec.period.start, spec.period.end) if spec.period else None
    if period != expected.period:
        problems.append(f"période {period} ≠ {expected.period}")
    if spec.limit != expected.limit:
        problems.append(f"limite {spec.limit} ≠ {expected.limit}")
    return "; ".join(problems)


def score(case: Case, iteration: MartIteration) -> tuple[bool, str, str]:
    """(passed, outcome, reason)."""
    if iteration.status == "previewed" and iteration.spec is not None:
        outcome = f"mart : {iteration.summary}"
        if not isinstance(case.expected, ExpectedMart):
            return False, outcome, "un data mart a été deviné"
        reason = compare(case.expected, iteration.spec)
        return not reason, outcome, reason
    if iteration.status == "clarification" and iteration.clarification is not None:
        asked = iteration.clarification
        outcome = f"question : {asked.question} [{', '.join(o.ref for o in asked.options)}]"
        if not isinstance(case.expected, ExpectedClarification):
            return False, outcome, "question au lieu d'une réponse"
        offered = {o.ref for o in asked.options}
        missing = [r for r in case.expected.options if r not in offered]
        return not missing, outcome, f"options manquantes {missing}" if missing else ""
    if iteration.status == "refused":
        outcome = f"refus : {iteration.refusal}"
        return isinstance(case.expected, ExpectedRefusal), outcome, ""
    return False, f"{iteration.status} : {iteration.error}", "échec du traitement"


EVAL_USER = Principal(
    user=User(id="eval", email="eval@forja.local", is_admin=True, created_at=utcnow()),
    via="password",
)


def build_eval_shop(root: Path, ecommerce_dir: Path) -> tuple[AppState, Project]:
    settings = shop_settings(root, agent_today=TODAY)
    return build_gold_shop(settings, ecommerce_dir)


def run_eval(
    state: AppState,
    project: Project,
    provider: LLMProvider | None,
    cases: tuple[Case, ...],
    *,
    label: str,
    echo: bool = False,
) -> EvalReport:
    if provider is not None and provider.journal is None:
        provider.journal = state.catalog.add_llm_call  # tokens and durations per question
    state.marts.interpreter = LLMMartInterpreter(provider) if provider is not None else None
    report = EvalReport(provider=label)
    for case in cases:
        started = time.perf_counter()
        request, job = state.marts.create(project.id, EVAL_USER, case.question)
        request = _wait(state, request, job.id)
        iteration = request.latest
        assert iteration is not None
        passed, outcome, reason = score(case, iteration)
        trace = iteration.llm
        result = CaseResult(
            id=case.id,
            category=case.category,
            question=case.question,
            passed=passed,
            outcome=outcome,
            path=iteration.path.value if iteration.path else None,
            reason=reason,
            duration_s=round(time.perf_counter() - started, 2),
            context_tokens=iteration.context_tokens,
            input_tokens=trace.input_tokens if trace else 0,
            output_tokens=trace.output_tokens if trace else 0,
            llm_duration_ms=trace.duration_ms if trace else 0,
        )
        report.results.append(result)
        if echo:
            print(
                f"{case.id} {'OK' if passed else 'KO'} {result.path} {result.duration_s:.1f}s "
                f"in={result.input_tokens} out={result.output_tokens} | {outcome}"
                + (f" | {reason}" if reason else ""),
                flush=True,
            )
    return report


def _wait(state: AppState, request: MartRequest, job_id: str, timeout: float = 3600) -> MartRequest:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if state.catalog.get_job(job_id).status.finished:
            return state.catalog.get_mart_request(request.id)
        time.sleep(0.5)
    raise TimeoutError(f"mart request {request.id} did not finish")
