"""Generation of the semantic layer from the applied Gold plan.

Deterministic: the same Gold plan gives the same layer, so a regeneration only
creates a version when the model or the overrides changed.
"""

from __future__ import annotations

from forja_core.gold.context import GoldContext, is_numeric, is_temporal
from forja_core.gold.heuristic import AMOUNT_TOKENS, QUANTITY_TOKENS, entity_name
from forja_core.gold.plan import DATE_DIMENSION, Aggregation, Fact, GoldPlan, Measure
from forja_core.profiling.models import PiiType
from forja_core.semantic import labels
from forja_core.semantic.models import (
    Additivity,
    Attribute,
    Hierarchy,
    Metric,
    MetricAggregation,
    MetricFormat,
    SemanticDimension,
)

SEMI_ADDITIVE_TOKENS = frozenset({"stock", "solde", "balance", "encours", "effectif", "inventaire"})
PRICE_TOKENS = frozenset({"prix", "price", "tarif"})
_ID_TOKENS = frozenset({"id", "code", "ref", "num", "numero", "no"})
_DISPLAY_TOKENS = ("libelle", "label", "designation", "nom", "name", "intitule")


def _data_type(column_type: str) -> str:
    upper = column_type.upper()
    if upper == "BOOLEAN":
        return "boolean"
    if is_temporal(column_type):
        return "date"
    if is_numeric(column_type):
        return "number"
    return "text"


def _pii(ctx: GoldContext, source: str, column: str) -> PiiType | None:
    silver = ctx.sources.get(source)
    if silver is None:
        return None
    for plan_column in silver.plan.columns:
        if plan_column.target_column == column:
            return plan_column.pii_type
    return None


def _attribute(ctx: GoldContext, source: str, column: str, name: str) -> Attribute:
    column_type = ctx.sources[source].columns.get(column, "VARCHAR")
    data_type = _data_type(column_type)
    pii = _pii(ctx, source, column)
    return Attribute(
        name=name,
        column=name,
        label=labels.label(name),
        data_type=data_type,
        pii=pii,
        synonyms=labels.attribute_synonyms(name),
        filterable=data_type in ("text", "boolean") and pii is None,
    )


def _hierarchies(attributes: list[Attribute]) -> list[Hierarchy]:
    names = {a.name for a in attributes}
    found = []
    for name, label, levels in labels.HIERARCHIES:
        present = [level for level in levels if level in names]
        if len(present) >= 2:
            found.append(Hierarchy(name=name, label=label, levels=present))
    return found


def _display(attributes: list[Attribute], natural_key: list[str]) -> str | None:
    usable = [a for a in attributes if a.pii is None and a.data_type == "text"]
    for token in _DISPLAY_TOKENS:
        for attribute in usable:
            if token in attribute.name.split("_"):
                return attribute.name
    return natural_key[0] if natural_key else None


def _standard_dimensions(plan: GoldPlan, fact: Fact, ctx: GoldContext) -> list[SemanticDimension]:
    dims = {d.name: d for d in plan.dimensions}
    result: list[SemanticDimension] = []
    for fk in fact.foreign_keys:
        dim = dims[fk.dimension]
        entity = entity_name(dim.source)
        many = len([f for f in fact.foreign_keys if f.dimension == dim.name]) > 1
        name = fk.name.removesuffix("_key") if many else entity
        attributes = [_attribute(ctx, dim.source, c, c) for c in dim.natural_key]
        attributes += [_attribute(ctx, dim.source, a.column, a.name) for a in dim.attributes]
        result.append(
            SemanticDimension(
                name=name,
                label=labels.entity_label(name),
                kind="standard",
                fact=fact.name,
                table=dim.name,
                fact_key=fk.name,
                table_key=dim.surrogate_key,
                display_attribute=_display(attributes, dim.natural_key),
                historized=dim.scd.value == "scd2",
                attributes=attributes,
                hierarchies=_hierarchies(attributes),
                synonyms=labels.dimension_synonyms(entity),
            )
        )
    return result


def _degenerate(fact: Fact, ctx: GoldContext) -> SemanticDimension | None:
    if not fact.degenerate_dimensions:
        return None
    header = fact.joins[0].source if fact.joins else fact.source
    entity = entity_name(header)
    attributes = [_attribute(ctx, d.source, d.column, d.name) for d in fact.degenerate_dimensions]
    for attribute in attributes:
        if labels.tokens(attribute.name) & _ID_TOKENS:
            attribute.filterable = False  # identifiers: too many values to resolve
    return SemanticDimension(
        name=entity,
        label=labels.entity_label(entity),
        kind="degenerate",
        fact=fact.name,
        table=fact.name,
        display_attribute=next(
            (a.name for a in attributes if labels.tokens(a.name) & _ID_TOKENS), None
        ),
        attributes=attributes,
        synonyms=labels.dimension_synonyms(entity),
    )


def _date_attributes() -> list[Attribute]:
    return [
        Attribute(name=name, column=name, label=label, data_type=data_type)
        for name, (label, data_type) in labels.DATE_ATTRIBUTES.items()
    ]


def _time_dimensions(fact: Fact) -> list[SemanticDimension]:
    return [
        SemanticDimension(
            name=key.name.removesuffix("_key"),
            label=labels.label(key.name.removesuffix("_key")),
            kind="time",
            fact=fact.name,
            table=DATE_DIMENSION,
            fact_key=key.name,
            table_key="date_key",
            display_attribute="date",
            attributes=_date_attributes(),
            hierarchies=[
                Hierarchy(
                    name="calendrier",
                    label="Calendrier",
                    levels=["annee", "trimestre", "mois", "date"],
                )
            ],
            synonyms=[labels.label(key.name.removesuffix("_key")).lower(), "date", "période"],
        )
        for key in fact.date_keys
    ]


def _format(measure: str) -> tuple[MetricFormat, str | None]:
    tokens = labels.tokens(measure)
    if tokens & AMOUNT_TOKENS or tokens & PRICE_TOKENS or "frais" in tokens:
        return MetricFormat.CURRENCY, "EUR"
    if tokens & QUANTITY_TOKENS:
        return MetricFormat.INTEGER, "unités"
    return MetricFormat.DECIMAL, None


_AGGREGATIONS = {
    Aggregation.SUM: MetricAggregation.SUM,
    Aggregation.COUNT: MetricAggregation.COUNT,
    Aggregation.COUNT_DISTINCT: MetricAggregation.COUNT_DISTINCT,
    Aggregation.MIN: MetricAggregation.MIN,
    Aggregation.MAX: MetricAggregation.MAX,
}


def _measure_metric(fact: Fact, measure: Measure, time_dims: list[str]) -> Metric | None:
    aggregation = _AGGREGATIONS.get(measure.aggregation)
    if aggregation is None:
        return None  # avg or none: exposed as a ratio of additive metrics instead
    tokens = labels.tokens(measure.name)
    fmt, unit = _format(measure.name)
    additivity = Additivity.ADDITIVE
    non_additive: list[str] = []
    if aggregation in (MetricAggregation.SUM, MetricAggregation.COUNT):
        if tokens & SEMI_ADDITIVE_TOKENS:
            additivity, non_additive = Additivity.SEMI_ADDITIVE, list(time_dims)
    else:
        additivity = Additivity.NON_ADDITIVE
    if measure.expression.strip() == "1":
        fmt, unit = MetricFormat.INTEGER, "lignes"
        label = f"Nombre de lignes ({fact.source.replace('_', ' ')})"
    else:
        label = labels.METRIC_LABELS.get(measure.name) or labels.label(measure.name)
    return Metric(
        name=measure.name,
        label=label,
        description=measure.description or f"{aggregation.value}({measure.name}) sur {fact.name}",
        fact=fact.name,
        aggregation=aggregation,
        column=measure.name,
        formula=f"{aggregation.value}({measure.name})",
        additivity=additivity,
        non_additive_dimensions=non_additive,
        unit=unit,
        format=fmt,
        synonyms=list(labels.METRIC_SYNONYMS.get(measure.name, [])),
    )


def _ratio(
    name: str, label: str, numerator: Metric, denominator: Metric, description: str
) -> Metric:
    return Metric(
        name=name,
        label=label,
        description=description,
        fact=numerator.fact,
        kind="ratio",
        numerator=numerator.name,
        denominator=denominator.name,
        formula=f"{numerator.formula} / {denominator.formula}",
        additivity=Additivity.NON_ADDITIVE,
        unit=numerator.unit if numerator.unit != denominator.unit else None,
        format=MetricFormat.CURRENCY if numerator.unit == "EUR" else MetricFormat.DECIMAL,
        synonyms=list(labels.METRIC_SYNONYMS.get(name, [])),
    )


def _fact_metrics(fact: Fact, time_dims: list[str]) -> list[Metric]:
    metrics = [m for m in (_measure_metric(fact, x, time_dims) for x in fact.measures) if m]
    by_name = {m.name: m for m in metrics}
    summed = [m for m in metrics if m.aggregation is MetricAggregation.SUM]
    amount = next((m for m in summed if labels.tokens(m.name) & AMOUNT_TOKENS), None)
    quantity = next((m for m in summed if labels.tokens(m.name) & QUANTITY_TOKENS), None)
    lines = next((m for m in summed if m.unit == "lignes"), None)

    # Header identifiers kept on the fact: number of orders, of invoices...
    degenerate = {d.column for d in fact.degenerate_dimensions if d.source == fact.source}
    for join in fact.joins:
        if join.from_source != fact.source or join.from_column not in degenerate:
            continue
        entity = entity_name(join.source)
        name = f"nb_{labels.plural(entity)}"
        if name in by_name:
            continue
        counted = Metric(
            name=name,
            label=f"Nombre de {labels.plural(labels.entity_label(entity).lower())}",
            description=f"count(distinct {join.from_column}) sur {fact.name}",
            fact=fact.name,
            aggregation=MetricAggregation.COUNT_DISTINCT,
            column=join.from_column,
            formula=f"count_distinct({join.from_column})",
            additivity=Additivity.NON_ADDITIVE,
            unit=labels.plural(entity),
            format=MetricFormat.INTEGER,
            synonyms=[
                f"nombre de {labels.plural(entity)}",
                labels.plural(entity),
                f"nb {labels.plural(entity)}",
            ],
            default=True,
        )
        metrics.append(counted)
        by_name[name] = counted
        if amount is not None:
            is_order = entity in ("commande", "order", "vente", "facture", "ticket")
            ratio_name = "panier_moyen" if is_order else f"{amount.name}_moyen_par_{entity}"
            metrics.append(
                _ratio(
                    ratio_name,
                    "Panier moyen" if is_order else f"{amount.label} moyen par {entity}",
                    amount,
                    counted,
                    f"{amount.label} divisé par le nombre de {labels.plural(entity)}",
                )
            )

    # Unit values are never averaged: a price is the ratio of an amount by a quantity.
    for measure in fact.measures:
        if measure.aggregation not in (Aggregation.AVG, Aggregation.NONE):
            continue
        tokens = labels.tokens(measure.name)
        if tokens & PRICE_TOKENS and amount is not None and quantity is not None:
            name = "prix_moyen"
            if name not in by_name:
                metrics.append(
                    _ratio(
                        name,
                        "Prix moyen unitaire",
                        amount,
                        quantity,
                        f"{amount.label} divisé par la {quantity.label.lower()} : prix pondéré "
                        f"par les quantités (et non moyenne de {measure.name})",
                    )
                )
        elif lines is not None:
            total = Metric(
                name=f"total_{measure.name}",
                label=f"Total {labels.label(measure.name).lower()}",
                fact=fact.name,
                aggregation=MetricAggregation.SUM,
                column=measure.name,
                formula=f"sum({measure.name})",
                additivity=Additivity.ADDITIVE,
                hidden=True,
            )
            metrics.append(total)
            metrics.append(
                _ratio(
                    f"{measure.name}_moyen",
                    f"{labels.label(measure.name)} moyen",
                    total,
                    lines,
                    f"Moyenne de {measure.name} par ligne de {fact.source}",
                )
            )
    for metric in metrics:
        if metric is amount:
            metric.default = True
    return metrics


def generate_layer(
    plan: GoldPlan, ctx: GoldContext
) -> tuple[list[Metric], list[SemanticDimension], str | None]:
    """Metrics, dimensions and default time dimension of the applied Gold plan."""
    metrics: list[Metric] = []
    dimensions: list[SemanticDimension] = []
    for fact in plan.facts:
        time_dims = _time_dimensions(fact)
        metrics += _fact_metrics(fact, [t.name for t in time_dims])
        dimensions += _standard_dimensions(plan, fact, ctx)
        degenerate = _degenerate(fact, ctx)
        if degenerate is not None and all(d.name != degenerate.name for d in dimensions):
            dimensions.append(degenerate)
        dimensions += time_dims
    default_time = next((d.name for d in dimensions if d.kind == "time"), None)
    return metrics, dimensions, default_time
