"""Terms of the verification preview: each underlined element of « Ce que Forja a
compris » offers a few choices; picking one rewrites the spec, which is previewed as is.

The choices come from the semantic layer and the data (other metrics of the same fact,
attributes of the same dimension, years covered, values of a filtered attribute), never
from the language model.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from forja_core.agent.models import SummaryPart
from forja_core.agent.spec import FilterOperator, MartSpec, OrderBy, Period
from forja_core.agent.summary import _GRAINS, describe
from forja_core.semantic.models import SemanticLayer, TimeGrain

Values = Callable[[str], list[str]]
Choice = tuple[str, MartSpec]

MAX_OPTIONS = 6
_LIMITS = (5, 10, 20)


def _metric_choices(spec: MartSpec, layer: SemanticLayer, index: int) -> list[Choice]:
    current = layer.metric(spec.metrics[index])
    if current is None:
        return []
    choices: list[Choice] = []
    for metric in layer.metrics:
        if metric.fact != current.fact or (
            metric.name in spec.metrics and metric.name != current.name
        ):
            continue
        metrics = list(spec.metrics)
        metrics[index] = metric.name
        order = [
            o.model_copy(update={"field": metric.name}) if o.field == current.name else o
            for o in spec.order_by
        ]
        filters = [f for f in spec.filters if f.field != current.name or metric is current]
        choices.append(
            (
                metric.label,
                spec.model_copy(update={"metrics": metrics, "order_by": order, "filters": filters}),
            )
        )
    return choices


def _grain_choices(spec: MartSpec) -> list[Choice]:
    choices: list[Choice] = [
        (f"par {_GRAINS[grain]}", spec.model_copy(update={"time_grain": grain}))
        for grain in (
            TimeGrain.DAY,
            TimeGrain.WEEK,
            TimeGrain.MONTH,
            TimeGrain.QUARTER,
            TimeGrain.YEAR,
        )
    ]
    choices.append(("sans découpage dans le temps", spec.model_copy(update={"time_grain": None})))
    return choices


def _axis_choices(spec: MartSpec, layer: SemanticLayer, index: int) -> list[Choice]:
    found = layer.attribute(spec.axes[index])
    if found is None:
        return []
    dim, current = found
    choices: list[Choice] = []
    for attribute in dim.attributes:
        ref = f"{dim.name}.{attribute.name}"
        if attribute.pii or (attribute is not current and ref in spec.axes):
            continue
        if attribute is not current and not attribute.filterable:
            continue  # identifiers, dates and numbers make poor axes
        label = dim.label if attribute.name == dim.display_attribute else attribute.label
        axes = list(spec.axes)
        axes[index] = ref
        choices.append((f"par {label.lower()}", spec.model_copy(update={"axes": axes})))
    removed = [a for i, a in enumerate(spec.axes) if i != index]
    order = [o for o in spec.order_by if o.field not in (spec.axes[index], current.name)]
    choices.append(
        ("retirer cet axe", spec.model_copy(update={"axes": removed, "order_by": order}))
    )
    return choices


def _period_choices(spec: MartSpec, data_range: tuple[date, date] | None) -> list[Choice]:
    choices: list[Choice] = []
    if data_range is not None:
        for year in range(data_range[0].year, data_range[1].year + 1):
            period = Period(start=date(year, 1, 1), end=date(year, 12, 31), label=str(year))
            choices.append((f"sur {year}", spec.model_copy(update={"period": period})))
            for quarter in range(1, 5):
                start = date(year, 3 * quarter - 2, 1)
                if start > data_range[1] or date(year, 3 * quarter, 28) < data_range[0]:
                    continue
                end = date(year + (quarter == 4), (3 * quarter) % 12 + 1, 1)
                label = f"T{quarter} {year}"
                choices.append(
                    (
                        f"sur {label}",
                        spec.model_copy(
                            update={
                                "period": Period(
                                    start=start,
                                    end=date.fromordinal(end.toordinal() - 1),
                                    label=label,
                                )
                            }
                        ),
                    )
                )
    choices.append(("sur toute la période", spec.model_copy(update={"period": None})))
    return choices


def _filter_choices(
    spec: MartSpec, layer: SemanticLayer, index: int, values: Values
) -> list[Choice]:
    item = spec.filters[index]
    removed = spec.model_copy(
        update={"filters": [f for i, f in enumerate(spec.filters) if i != index]}
    )
    choices: list[Choice] = []
    found = layer.attribute(item.field)
    if found is not None and item.operator in (FilterOperator.EQ, FilterOperator.IN):
        current = item.value if isinstance(item.value, list) else [item.value]
        for value in values(item.field)[: MAX_OPTIONS - 1]:
            filters = list(spec.filters)
            filters[index] = item.model_copy(update={"operator": FilterOperator.EQ, "value": value})
            if [str(v) for v in current] == [value]:
                filters[index] = item
            choices.append((value, spec.model_copy(update={"filters": filters})))
    choices.append(("retirer ce filtre", removed))
    return choices


def _limit_choices(spec: MartSpec) -> list[Choice]:
    target = spec.order_by[0] if spec.order_by else OrderBy(field=spec.metrics[0])
    choices: list[Choice] = [
        (
            f"les {n} premiers",
            spec.model_copy(update={"limit": n, "order_by": [target, *spec.order_by[1:]]}),
        )
        for n in _LIMITS
    ]
    choices.append(("sans limite", spec.model_copy(update={"limit": None})))
    return choices


_QUESTIONS = {
    "metric": "Quelle mesure ?",
    "grain": "Quel découpage dans le temps ?",
    "axis": "Quel axe d'analyse ?",
    "period": "Quelle période ?",
    "filter": "Quelle valeur garder ?",
    "limit": "Combien de lignes ?",
}


def choices(
    spec: MartSpec,
    layer: SemanticLayer,
    part: SummaryPart,
    *,
    data_range: tuple[date, date] | None,
    values: Values,
) -> list[Choice]:
    """What a term of the summary can become, each with the spec it gives; the current
    reading comes first."""
    term = part.term
    assert term is not None
    match term.kind:
        case "metric":
            found = _metric_choices(spec, layer, term.index)
        case "grain":
            found = _grain_choices(spec)
        case "axis":
            found = _axis_choices(spec, layer, term.index)
        case "period":
            found = _period_choices(spec, data_range)
        case "filter":
            found = _filter_choices(spec, layer, term.index, values)
        case "limit":
            found = _limit_choices(spec)
    current = next((c for c in found if c[1] == spec), (part.text, spec))
    others = [c for c in found if c[1] != spec]
    return [current, *others][:MAX_OPTIONS]


def correctable(
    spec: MartSpec,
    layer: SemanticLayer,
    *,
    data_range: tuple[date, date] | None,
    values: Values,
) -> list[SummaryPart]:
    """The summary with, on each term, its question and its choices."""
    parts = describe(spec, layer)
    for part in parts:
        if part.term is None:
            continue
        found = choices(spec, layer, part, data_range=data_range, values=values)
        if len(found) < 2:
            part.term = None  # nothing else to offer: plain text
            continue
        part.term.question = _QUESTIONS[part.term.kind]
        part.term.options = [label for label, _ in found]
        part.term.current = 0
    return parts


def corrected(
    spec: MartSpec,
    layer: SemanticLayer,
    parts: list[SummaryPart],
    term_index: int,
    option: int,
    *,
    data_range: tuple[date, date] | None,
    values: Values,
) -> tuple[str, MartSpec] | None:
    """The spec after choosing ``option`` for the term at ``term_index``, with its label."""
    if term_index >= len(parts) or parts[term_index].term is None:
        return None
    found = choices(spec, layer, parts[term_index], data_range=data_range, values=values)
    if option >= len(found):
        return None
    return found[option]
