"""Generation of the semantic layer from the applied Gold plan.

Deterministic: the same Gold plan gives the same layer, so a regeneration only
creates a version when the model or the overrides changed.
"""

from __future__ import annotations

from forja_core.gold.context import GoldContext, is_integer, is_numeric, is_temporal
from forja_core.gold.heuristic import QUANTITY_TOKENS
from forja_core.gold.naming import Process, entity_of_source, process_of
from forja_core.gold.plan import DATE_DIMENSION, Aggregation, Fact, GoldPlan, Measure
from forja_core.profiling.models import PiiType
from forja_core.relations.naming import singular
from forja_core.semantic import labels
from forja_core.semantic.models import (
    Additivity,
    Attribute,
    Bridge,
    DimensionLink,
    Hierarchy,
    Metric,
    MetricAggregation,
    MetricFormat,
    SemanticDimension,
    TimeGrain,
)
from forja_core.utils import strip_accents

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


def _attribute(
    ctx: GoldContext, source: str, column: str, name: str, entity: str | None = None
) -> Attribute:
    column_type = ctx.sources[source].columns.get(column, "VARCHAR")
    data_type = _data_type(column_type)
    pii = _pii(ctx, source, column)
    label = labels.column_label(name, entity)
    synonyms = labels.attribute_synonyms(name)
    if label != labels.label(name):
        # A column named in English: its French label is how it is asked for.
        french = label.lower()
        synonyms += [french, *labels.attribute_synonyms(strip_accents(french).replace(" ", "_"))]
        if entity:
            synonyms.append(f"{french} {labels.of_entity(entity)}")
    return Attribute(
        name=name,
        column=name,
        label=label,
        data_type=data_type,
        pii=pii,
        synonyms=list(dict.fromkeys(synonyms)),
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


def _display(
    attributes: list[Attribute], natural_key: list[str], entity: str | None = None
) -> str | None:
    """The attribute naming a member: ``nom_du_musee``, ``product_name``, ``libelle``; not
    ``product_category_name``, which names the category of a product."""
    usable = [a for a in attributes if a.pii is None and a.data_type == "text"]
    own = labels.ENTITY_ENGLISH.get(entity or "", frozenset())
    for token in _DISPLAY_TOKENS:
        for attribute in usable:
            # The words naming the entity itself left out (« product » in product_name):
            # « name » first or alone names the member; « category name » names another
            # thing (« libelle_produit », « nom_du_musee » are the member's name).
            words = [w for w in attribute.name.split("_") if w and w not in own]
            if words and (words[0] == token or words == [token]):
                return attribute.name
    return natural_key[0] if natural_key else None


def _standard_dimensions(plan: GoldPlan, fact: Fact, ctx: GoldContext) -> list[SemanticDimension]:
    dims = {d.name: d for d in plan.dimensions}
    result: list[SemanticDimension] = []
    for fk in fact.foreign_keys:
        dim = dims[fk.dimension]
        # A dimension is named by its content (dim_musee, dim_client), not by the file
        # it was read from.
        entity = dim_entity(dim.name)
        many = len([f for f in fact.foreign_keys if f.dimension == dim.name]) > 1
        name = fk.name.removesuffix("_key") if many else entity
        attributes = [_attribute(ctx, dim.source, c, c, entity) for c in dim.natural_key]
        attributes += [
            _attribute(ctx, dim.source, a.column, a.name, entity) for a in dim.attributes
        ]
        for lookup in dim.lookups:
            attributes += [
                _attribute(ctx, lookup.source, a.column, a.name, entity) for a in lookup.attributes
            ]
        result.append(
            SemanticDimension(
                name=name,
                label=labels.entity_label(name),
                kind="standard",
                fact=fact.name,
                table=dim.name,
                fact_key=fk.name,
                table_key=dim.surrogate_key,
                display_attribute=_display(attributes, dim.natural_key, entity),
                historized=dim.scd.value == "scd2",
                attributes=attributes,
                hierarchies=_hierarchies(attributes),
                synonyms=labels.dimension_synonyms(entity),
            )
        )
    return result


def dim_entity(name: str) -> str:
    return name.removeprefix("dim_")


def _degenerate(fact: Fact, ctx: GoldContext) -> SemanticDimension | None:
    if not fact.degenerate_dimensions:
        return None
    header = fact.joins[0].source if fact.joins else fact.source
    entity = entity_of_source(header, ctx.sources)
    attributes = [
        _attribute(ctx, d.source, d.column, d.name, entity) for d in fact.degenerate_dimensions
    ]
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


# Calendar attributes that make sense at each level: a year column holds no month.
_LEVEL_ATTRIBUTES = {
    "day": tuple(labels.DATE_ATTRIBUTES),
    "month": ("annee", "trimestre", "mois", "nom_mois"),
    "quarter": ("annee", "trimestre"),
    "year": ("annee",),
}
_LEVEL_GRAINS = {
    "day": TimeGrain.DAY,
    "month": TimeGrain.MONTH,
    "quarter": TimeGrain.QUARTER,
    "year": TimeGrain.YEAR,
}
_CALENDAR = ("annee", "trimestre", "mois", "date")


def _date_attributes(level: str = "day") -> list[Attribute]:
    kept = _LEVEL_ATTRIBUTES[level]
    return [
        Attribute(name=name, column=name, label=label, data_type=data_type)
        for name, (label, data_type) in labels.DATE_ATTRIBUTES.items()
        if name in kept
    ]


def _time_dimensions(fact: Fact) -> list[SemanticDimension]:
    keys = sorted(fact.date_keys, key=lambda k: k.name != fact.primary_date)
    dimensions = []
    for key in keys:
        name = key.name.removesuffix("_key")
        label = labels.time_label(key.grain, key.role, key.column)
        attributes = _date_attributes(key.grain)
        levels = [level for level in _CALENDAR if any(a.name == level for a in attributes)]
        dimensions.append(
            SemanticDimension(
                name=name,
                label=label,
                description=f"{label} : colonne {key.column} du fait {fact.name}.",
                kind="time",
                fact=fact.name,
                table=DATE_DIMENSION,
                fact_key=key.name,
                table_key="date_key",
                display_attribute="date" if key.grain == "day" else "annee",
                time_level=_LEVEL_GRAINS[key.grain],
                column=key.column,
                primary=key.name == fact.primary_date,
                attributes=attributes,
                hierarchies=(
                    [Hierarchy(name="calendrier", label="Calendrier", levels=levels)]
                    if len(levels) > 1
                    else []
                ),
                synonyms=list(dict.fromkeys([label.lower(), "date", "période"])),
            )
        )
    return dimensions


# A measure is money only when its name says so: a « total » of entries is a number.
MONEY_TOKENS = frozenset(
    {"montant", "prix", "price", "amount", "ca", "chiffre", "cout", "cost", "euro", "euros",
     "eur", "tarif", "frais", "fee", "fees", "revenu", "revenue", "recette", "recettes",
     "budget", "salaire", "salary", "remise", "discount", "ht", "ttc", "tva", "vat", "marge",
     "margin", "solde", "balance", "paiement", "payment", "depense", "depenses", "subvention",
     "loyer", "achat", "achats", "freight", "usd", "dollar", "dollars", "brl", "reais"}
)  # fmt: skip
# The currency of an amount, when its name says it; otherwise none is assumed.
CURRENCY_TOKENS: dict[str, str] = {
    "eur": "EUR", "euro": "EUR", "euros": "EUR", "usd": "USD", "dollar": "USD",
    "dollars": "USD", "gbp": "GBP", "brl": "BRL", "reais": "BRL", "real": "BRL",
    "chf": "CHF", "cad": "CAD", "jpy": "JPY", "mad": "MAD", "xof": "XOF",
}  # fmt: skip


def is_money(name: str) -> bool:
    return bool(labels.tokens(name) & MONEY_TOKENS) or "chiffre_affaires" in name


def currency(name: str) -> str | None:
    """« EUR » for ``montant_eur``; None for ``montant``: an amount is never assumed to
    be in euros."""
    for token in labels.tokens(name):
        if token in CURRENCY_TOKENS:
            return CURRENCY_TOKENS[token]
    return None


def _format(
    measure: str, column_type: str | None = None, process: Process | None = None
) -> tuple[MetricFormat, str | None]:
    tokens = labels.tokens(measure)
    if is_money(measure):
        return MetricFormat.CURRENCY, currency(measure)
    if tokens & QUANTITY_TOKENS:
        return MetricFormat.INTEGER, "unités"
    if column_type is not None and is_integer(column_type):
        return MetricFormat.INTEGER, process.count_unit or None if process else None
    return MetricFormat.DECIMAL, None


_AGGREGATIONS = {
    Aggregation.SUM: MetricAggregation.SUM,
    Aggregation.COUNT: MetricAggregation.COUNT,
    Aggregation.COUNT_DISTINCT: MetricAggregation.COUNT_DISTINCT,
    Aggregation.MIN: MetricAggregation.MIN,
    Aggregation.MAX: MetricAggregation.MAX,
}


def _measure_metric(
    fact: Fact,
    measure: Measure,
    time_dims: list[str],
    ctx: GoldContext | None = None,
    process: Process | None = None,
) -> Metric | None:
    aggregation = _AGGREGATIONS.get(measure.aggregation)
    if aggregation is None:
        return None  # avg or none: exposed as a ratio of additive metrics instead
    tokens = labels.tokens(measure.name)
    source = ctx.sources.get(fact.source) if ctx else None
    column_type = source.columns.get(measure.expression.strip()) if source else None
    fmt, unit = _format(measure.name, column_type, process)
    additivity = Additivity.ADDITIVE
    non_additive: list[str] = []
    if aggregation in (MetricAggregation.SUM, MetricAggregation.COUNT):
        if tokens & SEMI_ADDITIVE_TOKENS:
            additivity, non_additive = Additivity.SEMI_ADDITIVE, list(time_dims)
    else:
        additivity = Additivity.NON_ADDITIVE
    synonyms = list(labels.METRIC_SYNONYMS.get(measure.name, []))
    technical = False
    if measure.expression.strip() == "1":
        fmt, unit = MetricFormat.INTEGER, "lignes"
        # Named by the grain (« Nombre d'enregistrements musée-année ») and kept for
        # engineers: a count of rows means little to an analyst.
        grain = _grain_words(fact)
        label = f"Nombre d'enregistrements {grain}" if grain else "Nombre de lignes"
        description = (
            f"Nombre de lignes du fait, une par {grain.replace('-', ' et par ')}."
            if grain
            else "Nombre de lignes du fait."
        )
        technical = True
    else:
        label = labels.METRIC_LABELS.get(measure.name) or labels.column_label(measure.name)
        description = _sentence(label, aggregation, fmt, unit)
        if process is not None and process.count_unit and unit == process.count_unit:
            label = labels.qualified_count(process.count_unit, measure.name)
            description = (
                f"Nombre {labels.of(process.count_unit)} {labels.qualifier(measure.name)} "
                "sur la période."
            )
            synonyms += labels.qualified_synonyms(
                process.count_unit, measure.name, list(process.count_synonyms)
            )
    return Metric(
        name=measure.name,
        label=label,
        description=measure.description or description,
        fact=fact.name,
        aggregation=aggregation,
        column=measure.name,
        formula=f"{aggregation.value}({measure.name})",
        additivity=additivity,
        non_additive_dimensions=non_additive,
        unit=unit,
        format=fmt,
        synonyms=list(dict.fromkeys(synonyms)),
        technical=technical,
    )


def _sentence(
    label: str, aggregation: MetricAggregation, fmt: MetricFormat, unit: str | None
) -> str:
    """What a metric measures, in a business sentence; the formula stays in ``formula``."""
    text = label[:1].lower() + label[1:] if label[1:2] != label[1:2].upper() else label
    match aggregation:
        case MetricAggregation.SUM if fmt is MetricFormat.CURRENCY and unit:
            return f"{label} cumulé sur la période, en {unit}."
        case MetricAggregation.SUM if fmt is MetricFormat.CURRENCY:
            return f"{label} cumulé sur la période (montant, devise non précisée)."
        case MetricAggregation.SUM if unit:
            return f"Nombre {labels.of(unit)} ({text}) sur la période."
        case MetricAggregation.SUM:
            return f"Somme {labels.of(text)} sur la période."
        case MetricAggregation.COUNT:
            return f"Nombre de valeurs renseignées de {text} sur la période."
        case MetricAggregation.COUNT_DISTINCT:
            return f"Nombre de valeurs distinctes de {text} sur la période."
        case MetricAggregation.MIN:
            return f"Plus petite valeur de {text} sur la période."
        case MetricAggregation.MAX:
            return f"Plus grande valeur de {text} sur la période."


_LEVEL_WORDS = {"day": "jour", "month": "mois", "quarter": "trimestre", "year": "année"}


def _grain_words(fact: Fact) -> str:
    """« musée-année » for a fact with one row per museum and per year."""
    entities = {
        fk.column.lower(): fk.dimension.removeprefix("dim_").replace("_", " ")
        for fk in fact.foreign_keys
    }
    dates = {k.column.lower(): k.grain for k in fact.date_keys}
    words = []
    for column in fact.grain:
        lowered = column.lower()
        if lowered in entities:
            words.append(labels.entity_label(entities[lowered]).lower())
        elif lowered in dates:
            words.append(_LEVEL_WORDS.get(dates[lowered], "date"))
        else:
            words.append(labels.column_label(lowered).lower())
    return "-".join(words)


def _entity_counts(plan: GoldPlan, fact: Fact, taken: set[str]) -> list[Metric]:
    """« Nombre de musées »: for each entity the fact refers to, the number of distinct
    members present (the unknown member left out), with its business names."""
    dims = {d.name: d for d in plan.dimensions}
    counts: list[Metric] = []
    for fk in fact.foreign_keys:
        dim = dims.get(fk.dimension)
        if dim is None or len([f for f in fact.foreign_keys if f.dimension == dim.name]) > 1:
            continue  # two roles of one entity (buyer, seller): which one to count?
        entity = dim_entity(dim.name)
        nouns = labels.plural(labels.entity_label(entity).lower())
        name = f"nb_{labels.plural(entity)}"
        if name in taken:
            continue
        taken.add(name)
        counts.append(
            Metric(
                name=name,
                label=f"Nombre {labels.of(nouns)}",
                description=f"Nombre {labels.of(nouns)} distincts présents sur la période.",
                fact=fact.name,
                aggregation=MetricAggregation.COUNT_DISTINCT,
                column=fk.name,
                formula=f"count_distinct({fk.name})",
                additivity=Additivity.NON_ADDITIVE,
                unit=nouns,
                format=MetricFormat.INTEGER,
                entity=entity,
                synonyms=list(
                    dict.fromkeys(
                        [
                            f"nombre {labels.of(nouns)}",
                            f"nb {nouns}",
                            f"nombre {labels.of(nouns)} distincts",
                        ]
                    )
                ),
            )
        )
    return counts


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
        format=(
            MetricFormat.CURRENCY
            if numerator.format is MetricFormat.CURRENCY
            else MetricFormat.DECIMAL
        ),
        synonyms=list(labels.METRIC_SYNONYMS.get(name, [])),
    )


def _main_count(metrics: list[Metric], process: Process) -> Metric | None:
    """The count a process is measured by: ``total``, or a measure named like the process
    (entrees, visiteurs)."""
    counts = [
        m
        for m in metrics
        if m.aggregation is MetricAggregation.SUM and m.unit == process.count_unit
    ]
    for metric in counts:
        if labels.tokens(metric.name) & {"total", "totaux", "ensemble", "global"}:
            return metric
    for metric in counts:
        if {singular(t) for t in labels.tokens(metric.name)} & process.words:
            return metric
    return None


def _fact_metrics(
    fact: Fact,
    time_dims: list[str],
    ctx: GoldContext | None = None,
    plan: GoldPlan | None = None,
) -> list[Metric]:
    source = ctx.sources.get(fact.source) if ctx else None
    process = process_of(fact.source, source.columns if source else [])
    metrics = [
        m for m in (_measure_metric(fact, x, time_dims, ctx, process) for x in fact.measures) if m
    ]
    by_name = {m.name: m for m in metrics}
    summed = [m for m in metrics if m.aggregation is MetricAggregation.SUM]
    amount = next(
        (m for m in summed if is_money(m.name) and m.format is MetricFormat.CURRENCY), None
    )
    if amount is not None and process is not None and process.amount_label:
        # The main amount of a process: « Chiffre d'affaires » of sales, « Montant payé »
        # of payments, with their business names.
        if amount.name not in labels.METRIC_LABELS:
            amount.label = process.amount_label
        amount.synonyms = list(dict.fromkeys([*amount.synonyms, *process.amount_synonyms]))
    main = _main_count(metrics, process) if process and process.count_unit else None
    if main is not None:
        # « Fréquentation totale par région » : the business names of the main count.
        main.label = process.count_label or main.label  # type: ignore[union-attr]
        # « total » alone is a word of many questions (« nombre total de musées »): the
        # main count keeps its business names, not its bare qualifier.
        own = [s for s in main.synonyms if " " in s]
        main.synonyms = list(dict.fromkeys([*own, *process.count_synonyms]))  # type: ignore[union-attr]
        main.default = True
    quantity = next((m for m in summed if labels.tokens(m.name) & QUANTITY_TOKENS), None)
    lines = next((m for m in summed if m.unit == "lignes"), None)

    # Header identifiers kept on the fact: number of orders, of invoices...
    degenerate = {d.column for d in fact.degenerate_dimensions if d.source == fact.source}
    for join in fact.joins:
        if join.from_source != fact.source or join.from_column not in degenerate:
            continue
        entity = entity_of_source(join.source, ctx.sources if ctx else [])
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
            measure_label = labels.column_label(measure.name)
            total = Metric(
                name=f"total_{measure.name}",
                label=f"Total {measure_label.lower()}",
                fact=fact.name,
                aggregation=MetricAggregation.SUM,
                column=measure.name,
                formula=f"sum({measure.name})",
                additivity=Additivity.ADDITIVE,
                hidden=True,
            )
            metrics.append(total)
            average = _ratio(
                f"{measure.name}_moyen",
                f"{measure_label} {labels.adjective('moyen', measure_label)}",
                total,
                lines,
                f"Moyenne {labels.of(measure_label.lower())} : chaque ligne du fait compte une "
                "fois.",
            )
            lowered = measure_label.lower()
            average.synonyms = list(
                dict.fromkeys(
                    [
                        average.label.lower(),
                        f"moyenne {labels.of(lowered)}",
                        f"{lowered} {labels.adjective('moyen', measure_label)}",
                        *labels.SCORE_SYNONYMS.get(strip_accents(lowered), []),
                    ]
                )
            )
            metrics.append(average)
    for metric in metrics:
        if metric is amount:
            metric.default = True
    if source is not None:
        for composition in source.compositions:
            whole = by_name.get(composition.total)
            parts = [by_name[p].name for p in composition.parts if p in by_name]
            if whole is not None and len(parts) == len(composition.parts):
                whole.parts = parts
    if plan is not None:
        metrics += _entity_counts(plan, fact, {m.name for m in metrics})
    return metrics


def _merge(dimensions: list[SemanticDimension], new: SemanticDimension) -> None:
    """Add a fact's dimension to the layer; the same dimension already used by another
    fact (the same table, the same date column) gains a link instead of a copy."""
    existing = next((d for d in dimensions if d.name == new.name), None)
    if existing is None:
        dimensions.append(new)
        return
    if existing.kind == "degenerate" and new.kind == "degenerate":
        known = {a.name: a for a in existing.attributes}
        for attribute in existing.attributes:
            attribute.facts = attribute.facts or [existing.fact]
            for link in existing.links:
                if link.fact not in attribute.facts:
                    attribute.facts.append(link.fact)
        for attribute in new.attributes:
            if attribute.name in known:
                known[attribute.name].facts.append(new.fact)
            else:
                attribute.facts = [new.fact]
                existing.attributes.append(attribute)
        existing.links.append(DimensionLink(fact=new.fact))
        every = set(existing.facts())
        for attribute in existing.attributes:
            if set(attribute.facts) >= every:
                attribute.facts = []
        return
    same = existing.kind == new.kind and existing.table == new.table
    if new.kind == "time":
        same = same and existing.column == new.column
    if same:
        existing.links.append(
            DimensionLink(fact=new.fact, fact_key=new.fact_key, primary=new.primary)
        )
        return
    new.name = f"{new.name}_{new.fact.removeprefix('fct_')}"
    dimensions.append(new)


def _bridges(plan: GoldPlan, dimensions: list[SemanticDimension]) -> None:
    """A fact reaches the dimensions of another fact sharing its header (the reviews of
    an order reach the products of the order through its lines)."""
    headers = {
        fact.name: {(j.source, j.from_column) for j in fact.joins if j.from_source == fact.source}
        for fact in plan.facts
    }
    for fact in plan.facts:
        for dim in dimensions:
            if dim.kind != "standard" or dim.serves(fact.name):
                continue
            for other in plan.facts:
                link = dim.link(other.name)
                if other is fact or link is None or link.bridge or not link.fact_key:
                    continue
                shared = sorted(headers[fact.name] & headers[other.name])
                if not shared:
                    continue
                _, key = shared[0]
                dim.links.append(
                    DimensionLink(
                        fact=fact.name,
                        bridge=Bridge(fact=other.name, key=key, fact_key=link.fact_key),
                    )
                )
                break


def _unique_metrics(metrics: list[Metric], fact_metrics: list[Metric], fact: Fact) -> None:
    """Metric names are unique in the layer: a second fact's « nb_lignes » becomes
    « nb_lignes_paiements »; a count of an entity already given by a fact is not
    repeated (one « Nombre de clients »)."""
    taken = {m.name for m in metrics}
    suffix = fact.name.removeprefix("fct_")
    renamed: dict[str, str] = {}
    kept: list[Metric] = []
    labels_taken = {m.label for m in metrics if not m.technical and not m.hidden}
    for metric in fact_metrics:
        if metric.label in labels_taken and not metric.technical and not metric.hidden:
            continue  # one « Panier moyen » in the layer, from the first fact giving it
        if (
            metric.name in taken
            and (metric.entity or metric.name.startswith("nb_"))
            and (metric.name != "nb_lignes")
        ):
            continue
        if metric.name in taken:
            renamed[metric.name] = f"{metric.name}_{suffix}"
            metric.name = renamed[metric.name]
        kept.append(metric)
    for metric in kept:
        if metric.numerator in renamed:
            metric.numerator = renamed[metric.numerator]
        if metric.denominator in renamed:
            metric.denominator = renamed[metric.denominator]
        if metric.kind == "ratio" and renamed:
            metric.formula = (
                f"{_formula(kept, metric.numerator)} / {_formula(kept, metric.denominator)}"
            )
    fact_metrics[:] = kept


def _formula(metrics: list[Metric], name: str | None) -> str:
    found = next((m for m in metrics if m.name == name), None)
    return found.formula if found else str(name)


def generate_layer(
    plan: GoldPlan, ctx: GoldContext
) -> tuple[list[Metric], list[SemanticDimension], str | None]:
    """Metrics, dimensions and default time dimension of the applied Gold plan.

    Facts sharing a dimension (customers of sales and of payments) share one semantic
    dimension with a link per fact; metric names are unique in the layer."""
    metrics: list[Metric] = []
    dimensions: list[SemanticDimension] = []
    for fact in plan.facts:
        time_dims = _time_dimensions(fact)
        fact_metrics = _fact_metrics(fact, [t.name for t in time_dims], ctx, plan)
        _unique_metrics(metrics, fact_metrics, fact)
        metrics += fact_metrics
        for dim in _standard_dimensions(plan, fact, ctx):
            _merge(dimensions, dim)
        degenerate = _degenerate(fact, ctx)
        if degenerate is not None:
            _merge(dimensions, degenerate)
        for dim in time_dims:
            _merge(dimensions, dim)
    _bridges(plan, dimensions)
    default_time = next((d.name for d in dimensions if d.kind == "time" and d.primary), None)
    default_time = default_time or next((d.name for d in dimensions if d.kind == "time"), None)
    return metrics, dimensions, default_time
