"""Questions offered on the analyst's home page: written from the semantic layer, and
kept only when the deterministic parser understands them alone (no language model, no
question back), so that every suggestion leads straight to a preview."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date

from forja_core.agent.parser import parse
from forja_core.agent.validate import validate_spec
from forja_core.agent.vocabulary import Vocabulary
from forja_core.semantic.models import Metric, SemanticLayer, TimeGrain

Lookup = Callable[..., list[str]]


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text[:2] != text[:2].upper() else text


def _candidates(layer: SemanticLayer, year: int) -> Iterator[str]:
    # Business metrics first: the default ones, then those named without a technical
    # qualifier (« Nombre de lignes (lignes commande) » is a modelling detail).
    metrics: list[Metric] = sorted(
        layer.metrics,
        key=lambda m: (not m.default, "(" in m.label, m.kind != "aggregate", m.name),
    )
    # Axes people name: a dimension's display attribute, or an attribute with synonyms;
    # codes and identifiers stay out of the suggestions.
    axes: list[tuple[str, str]] = []  # (label, plural of the dimension)
    for dim in layer.dimensions:
        if dim.kind != "standard":
            continue
        for attribute in dim.attributes:
            display = attribute.name == dim.display_attribute and not attribute.name.startswith(
                ("id_", "code_")
            )
            named = display or bool(attribute.synonyms)
            if (
                attribute.filterable
                and not attribute.pii
                and named
                and attribute.data_type == "text"
            ):
                label = dim.label if attribute.name == dim.display_attribute else attribute.label
                axes.append((label.lower(), dim.label.lower() + "s"))
    first = metrics[0] if metrics else None
    main = next((d for d in layer.time_dimensions() if d.primary), None)
    yearly = main is not None and main.time_level is TimeGrain.YEAR
    if first is not None and yearly and axes:
        # A year column: the months and quarters do not exist, the years do.
        yield f"{first.label} par {axes[0][0]} en {year}"
        yield f"{first.label} par année"
    elif first is not None:
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
    if not yearly:
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
        checked = validate_spec(answer.mart, layer, lookup)
        if checked.spec is None or checked.notes:
            continue  # adjusted by Forja: not the question it reads
        kept.append(question)
        if len(kept) == limit:
            break
    return kept
