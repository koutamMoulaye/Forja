"""Strict validation of a MartSpec against the semantic layer.

Everything the spec names must exist and be visible; values of text filters are
resolved locally against the distinct values of the attribute (exact, then close
match), never sent anywhere. A name that cannot be resolved becomes a question to
the user (2 to 4 options) or, when nothing comes close, a refusal: Forja does not
guess.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from difflib import get_close_matches

from forja_core.agent.parser import clarification
from forja_core.agent.spec import Clarification, FilterOperator, MartFilter, MartSpec, OrderBy
from forja_core.semantic.models import Attribute, SemanticDimension, SemanticLayer
from forja_core.semantic.text import key, normalize

ValueLookup = Callable[[SemanticDimension, Attribute], list[str]]

_TEXT_OPERATORS = frozenset(
    {FilterOperator.EQ, FilterOperator.NEQ, FilterOperator.IN, FilterOperator.NOT_IN,
     FilterOperator.CONTAINS}
)  # fmt: skip
_LIST_OPERATORS = frozenset({FilterOperator.IN, FilterOperator.NOT_IN})


@dataclass
class Validation:
    spec: MartSpec | None = None
    fact: str | None = None
    clarification: Clarification | None = None
    refusal: str | None = None
    notes: list[str] = field(default_factory=list)


class _StopError(Exception):
    def __init__(self, outcome: Validation) -> None:
        self.outcome = outcome


def _closest(word: str, choices: dict[str, str], n: int = 4) -> list[str]:
    """Refs of the choices (label -> ref) closest to ``word``."""
    by_key = {normalize(label): ref for label, ref in choices.items()}
    found = get_close_matches(normalize(word), list(by_key), n=n, cutoff=0.5)
    return list(dict.fromkeys(by_key[f] for f in found))


def _unknown(layer: SemanticLayer, kind: str, name: str, choices: dict[str, str]) -> _StopError:
    refs = _closest(name, choices)
    ask = clarification(
        layer, name, refs, f"« {name} » n'existe pas dans la couche sémantique. Voulez-vous dire :"
    )
    if ask is not None:
        return _StopError(Validation(clarification=ask))
    available = ", ".join(sorted(choices)[:12])
    return _StopError(
        Validation(
            refusal=f"{kind} « {name} » inconnue : elle n'existe pas dans les données du projet. "
            f"Disponibles : {available}."
        )
    )


def _metric_choices(layer: SemanticLayer) -> dict[str, str]:
    choices: dict[str, str] = {}
    for metric in layer.metrics:
        for text in (metric.name, metric.label, *metric.synonyms):
            choices.setdefault(text, f"metric:{metric.name}")
    return choices


def _attribute_choices(layer: SemanticLayer) -> dict[str, str]:
    choices: dict[str, str] = {}
    for dim in layer.dimensions:
        for attribute in dim.attributes:
            ref = f"attribute:{dim.name}.{attribute.name}"
            for text in (f"{dim.name}.{attribute.name}", attribute.label, *attribute.synonyms):
                choices.setdefault(text, ref)
    return choices


def _resolve_axis(layer: SemanticLayer, ref: str, fact: str) -> str:
    found = layer.attribute(ref)
    if found is None:
        raise _unknown(layer, "Dimension", ref, _attribute_choices(layer))
    dim, attribute = found
    if dim.fact != fact:
        raise _StopError(
            Validation(refusal=f"{dim.label} n'est pas reliée aux mesures demandées ({fact}).")
        )
    return f"{dim.name}.{attribute.name}"


def _resolve_text(
    layer: SemanticLayer,
    dim: SemanticDimension,
    attribute: Attribute,
    raw: str,
    lookup: ValueLookup,
) -> str:
    values = lookup(dim, attribute)
    if not values:
        return raw
    by_key = {" ".join(key(v)): v for v in values}
    wanted = " ".join(key(raw))
    if wanted in by_key:
        return by_key[wanted]
    starts = [v for k, v in by_key.items() if k.startswith(wanted) and len(wanted) >= 3]
    if len(starts) == 1:
        return starts[0]
    close = get_close_matches(wanted, list(by_key), n=4, cutoff=0.75)
    if len(close) == 1:
        return by_key[close[0]]
    options = [by_key[c] for c in close] or starts[:4]
    ref = f"{dim.name}.{attribute.name}"
    ask = clarification(
        layer,
        raw,
        [f"value:{ref}={v}" for v in options],
        f"« {raw} » ne correspond à aucune valeur de {attribute.label.lower()}. Voulez-vous dire :",
    )
    if ask is not None:
        raise _StopError(Validation(clarification=ask))
    raise _StopError(
        Validation(
            refusal=f"Aucune valeur « {raw} » pour {attribute.label.lower()} "
            f"({dim.label.lower()}) dans les données."
        )
    )


def _filter(
    layer: SemanticLayer, item: MartFilter, fact: str, metrics: list[str], lookup: ValueLookup
) -> MartFilter:
    metric = layer.metric(item.field)
    if metric is not None:
        if item.field not in metrics:
            metrics.append(item.field)  # a filter on a total needs the total
        if item.operator in _TEXT_OPERATORS - {FilterOperator.EQ, FilterOperator.NEQ}:
            raise _StopError(
                Validation(
                    refusal=f"Opérateur {item.operator.value} impossible sur {metric.label}."
                )
            )
        values = item.value if isinstance(item.value, list) else [item.value]
        if not all(isinstance(v, int | float) and not isinstance(v, bool) for v in values):
            raise _StopError(Validation(refusal=f"{metric.label} se filtre sur un nombre."))
        return item
    field_ref = _resolve_axis(layer, item.field, fact)
    found = layer.attribute(field_ref)
    assert found is not None
    dim, attribute = found
    if attribute.pii is not None:
        raise _StopError(
            Validation(
                refusal=f"{attribute.label} est une donnée personnelle : Forja ne filtre pas "
                "sur ses valeurs."
            )
        )
    values = item.value if isinstance(item.value, list) else [item.value]
    if item.operator in _LIST_OPERATORS and not isinstance(item.value, list):
        item = item.model_copy(update={"value": values})
    if attribute.data_type == "text":
        if item.operator not in _TEXT_OPERATORS:
            raise _StopError(
                Validation(
                    refusal=f"{attribute.label} est un texte : opérateur "
                    f"{item.operator.value} impossible."
                )
            )
        if item.operator is not FilterOperator.CONTAINS:
            values = [_resolve_text(layer, dim, attribute, str(v), lookup) for v in values]
    elif attribute.data_type == "number":
        try:
            values = [
                v if isinstance(v, int | float) and not isinstance(v, bool) else float(str(v))
                for v in values
            ]
        except (TypeError, ValueError) as exc:
            raise _StopError(Validation(refusal=f"{attribute.label} attend un nombre.")) from exc
    elif attribute.data_type == "boolean":
        values = [
            v if isinstance(v, bool) else normalize(str(v)) in ("oui", "vrai", "true", "1")
            for v in values
        ]
    value: object = values if isinstance(item.value, list) else values[0]
    return item.model_copy(update={"field": field_ref, "value": value})


def validate_spec(spec: MartSpec, layer: SemanticLayer, lookup: ValueLookup) -> Validation:
    try:
        return _validate(spec, layer, lookup)
    except _StopError as stop:
        return stop.outcome


def _validate(spec: MartSpec, layer: SemanticLayer, lookup: ValueLookup) -> Validation:
    metrics: list[str] = []
    facts: set[str] = set()
    for name in spec.metrics:
        metric = layer.metric(name)
        if metric is None or metric.hidden:
            raise _unknown(layer, "Métrique", name, _metric_choices(layer))
        if metric.name not in metrics:
            metrics.append(metric.name)
            facts.add(metric.fact)
    if len(facts) > 1:
        raise _StopError(
            Validation(
                refusal="Ces métriques viennent de faits différents "
                f"({', '.join(sorted(facts))}) : demandez-les dans deux data marts."
            )
        )
    fact = facts.pop()
    axes = list(dict.fromkeys(_resolve_axis(layer, a, fact) for a in spec.axes))

    time_dimension = spec.time_dimension
    if spec.time_grain is not None or spec.period is not None or time_dimension is not None:
        candidates = [d for d in layer.time_dimensions() if d.fact == fact]
        if time_dimension is None:
            default = layer.default_time_dimension
            chosen = next((d for d in candidates if d.name == default), None) or (
                candidates[0] if candidates else None
            )
            if chosen is None:
                raise _StopError(
                    Validation(
                        refusal="Ces mesures n'ont pas de date : pas d'axe temporel possible."
                    )
                )
            time_dimension = chosen.name
        elif all(d.name != time_dimension for d in candidates):
            raise _unknown(
                layer, "Date", time_dimension, {d.label: f"time:{d.name}" for d in candidates}
            )

    if (
        spec.period
        and spec.period.start
        and spec.period.end
        and spec.period.start > spec.period.end
    ):
        raise _StopError(Validation(refusal="La période demandée se termine avant de commencer."))

    filters = [_filter(layer, f, fact, metrics, lookup) for f in spec.filters]

    outputs = set(metrics) | {a.split(".")[-1] for a in axes} | set(axes)
    if spec.time_grain:
        outputs.add(spec.time_grain.value)
    order_by: list[OrderBy] = []
    for item in spec.order_by:
        field_name = item.field
        if field_name not in outputs:
            metric = layer.metric(field_name)
            if metric is not None and not metric.hidden and metric.fact == fact:
                metrics.append(metric.name)
            else:
                continue  # an order on something absent is dropped, not guessed
        order_by.append(item)

    validated = spec.model_copy(
        update={
            "metrics": metrics,
            "axes": axes,
            "filters": filters,
            "time_dimension": time_dimension,
            "order_by": order_by,
        }
    )
    return Validation(spec=validated, fact=fact)
