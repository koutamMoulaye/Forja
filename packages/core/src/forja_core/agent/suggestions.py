"""Questions offered on the analyst's home page: written from the semantic layer, and
kept only when the deterministic parser understands them alone (no language model, no
question back), so that every suggestion leads straight to a preview."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date

from forja_core.agent.parser import parse
from forja_core.agent.validate import validate_spec
from forja_core.agent.vocabulary import Vocabulary
from forja_core.semantic.models import Metric, SemanticLayer

Lookup = Callable[..., list[str]]


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text[:2] != text[:2].upper() else text


def _candidates(layer: SemanticLayer, year: int) -> Iterator[str]:
    metrics: list[Metric] = sorted(
        layer.metrics, key=lambda m: (not m.default, m.kind != "aggregate", m.name)
    )
    axes: list[tuple[str, str]] = []  # (label, plural of the dimension)
    for dim in layer.dimensions:
        if dim.kind != "standard":
            continue
        for attribute in dim.attributes:
            if attribute.filterable and not attribute.pii:
                label = dim.label if attribute.name == dim.display_attribute else attribute.label
                axes.append((label.lower(), dim.label.lower() + "s"))
    first = metrics[0] if metrics else None
    if first is not None:
        yield f"{first.label} par mois en {year}"
    # One question per metric, each on another axis, so the chips do not repeat.
    for index, metric in enumerate(metrics):
        if not axes:
            break
        label, plural = axes[index % len(axes)]
        if index % 3 == 1:
            yield f"Top 5 des {plural} par {_lower_first(metric.label)}"
        else:
            yield f"{metric.label} par {label}"
    for metric in metrics[:2]:
        yield f"{metric.label} par trimestre en {year}"


def suggestions(
    layer: SemanticLayer,
    vocabulary: Vocabulary,
    values: dict[str, list[str]],
    lookup: Lookup,
    *,
    today: date,
    default_year: int,
    limit: int = 4,
) -> list[str]:
    """Up to ``limit`` questions the parser turns into a valid data mart on its own."""
    kept: list[str] = []
    for question in dict.fromkeys(_candidates(layer, default_year)):
        outcome = parse(
            question, layer, vocabulary, values=values, bindings={},
            today=today, default_year=default_year,
        )  # fmt: skip
        answer = outcome.answer
        if not outcome.confident or answer is None or answer.kind != "mart" or answer.mart is None:
            continue
        if validate_spec(answer.mart, layer, lookup).spec is None:
            continue
        kept.append(question)
        if len(kept) == limit:
            break
    return kept
