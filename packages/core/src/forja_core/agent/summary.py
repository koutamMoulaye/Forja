"""What the agent understood, in French, from a validated MartSpec.

« Montant des ventes et nombre de commandes par mois et par ville, sur 2024,
clients segment professionnel. »

Each element of the spec (metric, grain, axis, period, filter, limit) is a term of the
summary: the verification preview underlines it and offers to correct it.
"""

from __future__ import annotations

from forja_core.agent.models import SummaryPart, SummaryTerm, TermKind
from forja_core.agent.spec import FilterOperator, MartFilter, MartSpec
from forja_core.semantic.models import SemanticLayer, TimeGrain

_GRAINS = {
    TimeGrain.DAY: "jour",
    TimeGrain.WEEK: "semaine",
    TimeGrain.MONTH: "mois",
    TimeGrain.QUARTER: "trimestre",
    TimeGrain.YEAR: "année",
}
_COMPARISONS = {
    FilterOperator.GT: "supérieur à",
    FilterOperator.GTE: "d'au moins",
    FilterOperator.LT: "inférieur à",
    FilterOperator.LTE: "d'au plus",
    FilterOperator.CONTAINS: "contenant",
}


def _join(items: list[str], last: str = "et") -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} {last} {items[-1]}"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text[:2] != text[:2].upper() else text


def _values(item: MartFilter) -> list[str]:
    values = item.value if isinstance(item.value, list) else [item.value]
    return [("oui" if v else "non") if isinstance(v, bool) else str(v) for v in values]


def _filter(layer: SemanticLayer, item: MartFilter) -> str:
    metric = layer.metric(item.field)
    if metric is not None:
        comparison = _COMPARISONS.get(item.operator, "égal à")
        return f"{_lower_first(metric.label)} {comparison} {_values(item)[0]}"
    found = layer.attribute(item.field)
    if found is None:
        return item.field
    dim, attribute = found
    values = _values(item)
    joined = _join(values, "ou")
    if item.operator in (FilterOperator.NEQ, FilterOperator.NOT_IN):
        joined = f"hors {_join(values, 'et')}"
    elif item.operator in _COMPARISONS:
        joined = f"{_COMPARISONS[item.operator]} {values[0]}"
    plural = dim.label.lower() + ("" if dim.label.lower().endswith("s") else "s")
    if attribute.name == dim.display_attribute:
        return f"{plural} {joined}"
    return f"{plural} {attribute.label.lower()} {joined}"


def _period(spec: MartSpec) -> str | None:
    period = spec.period
    if period is None:
        return None
    if period.label:
        label = period.label
        if label[:1].isdigit() or label.startswith(("T", "S")):
            return f"sur {label}"
        return f"en {label}"
    start = period.start.strftime("%d/%m/%Y") if period.start else "le début"
    end = period.end.strftime("%d/%m/%Y") if period.end else "aujourd'hui"
    return f"du {start} au {end}"


def _term(text: str, kind: TermKind, index: int = 0) -> SummaryPart:
    return SummaryPart(text=text, term=SummaryTerm(kind=kind, index=index))


def _joined(parts: list[SummaryPart], last: str = "et") -> list[SummaryPart]:
    """The parts with « , » between them and « et » before the last one."""
    out: list[SummaryPart] = []
    for i, part in enumerate(parts):
        if i:
            out.append(SummaryPart(text=f" {last} " if i == len(parts) - 1 else ", "))
        out.append(part)
    return out


def describe(spec: MartSpec, layer: SemanticLayer) -> list[SummaryPart]:
    """The summary as parts; each element of the spec is a term the user can correct."""
    labels = [layer.metric(m).label if layer.metric(m) else m for m in spec.metrics]  # type: ignore[union-attr]
    parts = _joined(
        [
            _term(label if i == 0 else _lower_first(label), "metric", i)
            for i, label in enumerate(labels)
        ]
    )
    axes: list[SummaryPart] = []
    if spec.time_grain is not None:
        axes.append(_term(f"par {_GRAINS[spec.time_grain]}", "grain"))
    for index, ref in enumerate(spec.axes):
        found = layer.attribute(ref)
        if found is None:
            continue
        dim, attribute = found
        label = dim.label if attribute.name == dim.display_attribute else attribute.label
        axes.append(_term(f"par {label.lower()}", "axis", index))
    if axes:
        parts += [SummaryPart(text=" "), *_joined(axes)]
    if spec.time_dimension and spec.time_dimension != layer.default_time_dimension:
        time_dim = layer.dimension(spec.time_dimension)
        if time_dim is not None:
            parts.append(SummaryPart(text=f" (selon la {time_dim.label.lower()})"))
    details: list[SummaryPart] = []
    period = _period(spec)
    if period:
        details.append(_term(period, "period"))
    details += [_term(_filter(layer, f), "filter", i) for i, f in enumerate(spec.filters)]
    for detail in details:
        parts += [SummaryPart(text=", "), detail]
    if spec.limit:
        direction = (
            "premiers" if not spec.order_by or spec.order_by[0].direction == "desc" else "derniers"
        )
        target = spec.order_by[0].field if spec.order_by else spec.metrics[0]
        metric = layer.metric(target)
        by = _lower_first(metric.label) if metric else target
        if spec.limit == 1:
            first = "le premier" if direction == "premiers" else "le dernier"
            text = f"{first} par {by}"
        else:
            text = f"les {spec.limit} {direction} par {by}"
        parts += [SummaryPart(text=", "), _term(text, "limit")]
    parts.append(SummaryPart(text="."))
    return parts


def summarize(spec: MartSpec, layer: SemanticLayer) -> str:
    return "".join(part.text for part in describe(spec, layer))
