"""Deterministic Gold model proposal, used when no language model is configured.

The confirmed relations give the shape of the star:

- a source that references others and is referenced by none is a fact (the most
  detailed grain, e.g. order lines);
- a referenced source that itself references others is a header (e.g. orders): it
  is joined to the fact along its many-to-one relation and lends it its foreign
  keys, dates and identifiers, never its additive amounts;
- a referenced source that references nothing is a dimension.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from forja_core.gold.context import GoldContext, SilverSource, is_numeric, is_temporal
from forja_core.gold.plan import (
    Aggregation,
    DateDimension,
    DateKey,
    DegenerateDimension,
    Dimension,
    DimensionAttribute,
    Fact,
    FactJoin,
    ForeignKey,
    GoldModel,
    Measure,
    ScdType,
)
from forja_core.profiling.pii import column_tokens
from forja_core.relations.models import Relation
from forja_core.relations.naming import singular

SALES_TOKENS = frozenset(
    {"ligne", "line", "commande", "order", "vente", "sale", "facture", "invoice", "achat"}
)
HISTORIZED_TOKENS = frozenset(
    {"segment", "categorie", "category", "statut", "status", "ville", "city", "region",
     "adresse", "address", "pays", "country", "niveau", "tier", "type", "groupe", "group"}
)  # fmt: skip
QUANTITY_TOKENS = frozenset({"quantite", "qte", "qty", "quantity", "nombre", "nb"})
PRICE_TOKENS = frozenset({"prix", "price", "tarif"})
AMOUNT_TOKENS = frozenset({"montant", "amount", "total", "ca"})
AVERAGED_TOKENS = frozenset(
    {"prix", "price", "tarif", "taux", "rate", "pourcentage", "pct", "ratio", "unitaire", "unit"}
)


def _tokens(name: str) -> set[str]:
    return column_tokens(name)[1]


def entity_name(source: str) -> str:
    return "_".join(singular(t) for t in source.split("_") if t)


def _fact_name(base: str) -> str:
    return "fct_ventes" if _tokens(base) & SALES_TOKENS else f"fct_{base}"


def _scd(source: SilverSource) -> tuple[ScdType, str]:
    personal = [c.target_column for c in source.plan.included_columns() if c.pii_type]
    changing = sorted(
        c for c in source.columns if _tokens(c) & HISTORIZED_TOKENS and c not in source.key
    )
    if changing:
        return ScdType.SCD2, ", ".join(changing)
    if personal:
        return ScdType.SCD2, ", ".join(personal)
    return ScdType.SCD1, ""


def _dimension(source: SilverSource) -> Dimension:
    scd, _ = _scd(source)
    return Dimension(
        name=f"dim_{source.name}",
        source=source.name,
        natural_key=list(source.key),
        surrogate_key=f"{entity_name(source.name)}_key",
        attributes=[
            DimensionAttribute(column=column, name=column)
            for column in source.columns
            if column not in source.key
        ],
        scd=scd,
    )


def _measures(base: SilverSource, excluded: set[str]) -> list[Measure]:
    numeric = [c for c in base.columns if c not in excluded and is_numeric(base.columns[c])]
    measures = [
        Measure(
            name=column,
            expression=column,
            aggregation=Aggregation.AVG if _tokens(column) & AVERAGED_TOKENS else Aggregation.SUM,
        )
        for column in numeric
    ]
    quantity = next((c for c in numeric if _tokens(c) & QUANTITY_TOKENS), None)
    price = next((c for c in numeric if _tokens(c) & PRICE_TOKENS), None)
    has_amount = any(_tokens(c) & AMOUNT_TOKENS for c in numeric)
    if quantity and price and not has_amount:
        measures.append(
            Measure(name="montant", expression=f"{quantity} * {price}", aggregation=Aggregation.SUM)
        )
    key = base.key[0] if base.key else next(iter(base.columns))
    measures.append(Measure(name="nb_lignes", expression=key, aggregation=Aggregation.COUNT))
    return measures


def _index(
    relations: Iterable[Relation], sources: dict[str, SilverSource]
) -> tuple[dict[str, list[Relation]], dict[str, list[Relation]]]:
    outgoing: dict[str, list[Relation]] = defaultdict(list)
    incoming: dict[str, list[Relation]] = defaultdict(list)
    for relation in relations:
        if relation.from_source in sources and relation.to_source in sources:
            outgoing[relation.from_source].append(relation)
            incoming[relation.to_source].append(relation)
    return outgoing, incoming


def propose_heuristic(ctx: GoldContext) -> tuple[GoldModel, list[str]]:
    """A star schema from the confirmed relations, and warnings about what was left out."""
    sources = ctx.sources
    outgoing, incoming = _index(ctx.confirmed, sources)
    warnings: list[str] = []
    dimensions: dict[str, Dimension] = {}
    facts: list[Fact] = []

    for base_name in sorted(s for s in sources if outgoing[s] and not incoming[s]):
        base = sources[base_name]
        joins: list[FactJoin] = []
        foreign_keys: list[ForeignKey] = []
        date_keys: list[DateKey] = []
        degenerate: list[DegenerateDimension] = []
        visited = {base_name}
        frontier = [base_name]
        while frontier:
            current = frontier.pop(0)
            for relation in sorted(outgoing[current], key=lambda r: r.key):
                target = relation.to_source
                if outgoing[target] and target not in visited:
                    visited.add(target)
                    frontier.append(target)
                    joins.append(
                        FactJoin(
                            source=target,
                            from_source=current,
                            from_column=relation.from_column,
                            to_column=relation.to_column,
                        )
                    )
                    for column in sources[target].columns:
                        if is_numeric(sources[target].columns[column]) and column not in {
                            r.from_column for r in outgoing[target]
                        }:
                            warnings.append(
                                f"{target}.{column} n'est pas repris comme mesure : il est au "
                                f"niveau de {target}, le sommer au grain de {base_name} le "
                                "multiplierait"
                            )
                elif not outgoing[target]:
                    dim = dimensions.setdefault(target, _dimension(sources[target]))
                    name = dim.surrogate_key
                    if any(fk.name == name for fk in foreign_keys):
                        name = f"{relation.from_column}_key"
                    foreign_keys.append(
                        ForeignKey(
                            name=name,
                            dimension=dim.name,
                            source=current,
                            column=relation.from_column,
                            relation_id=relation.id,
                        )
                    )

        fk_columns = {(fk.source, fk.column) for fk in foreign_keys}
        for source_name in [base_name, *(j.source for j in joins)]:
            source = sources[source_name]
            for column, column_type in source.columns.items():
                if is_temporal(column_type):
                    date_keys.append(
                        DateKey(name=f"{column}_key", source=source_name, column=column)
                    )
        for column in base.key:
            if (base_name, column) not in fk_columns:
                degenerate.append(DegenerateDimension(name=column, source=base_name, column=column))
        # Descriptive text of joined headers (an order status) is kept on the fact.
        for join in joins:
            header = sources[join.source]
            for column, column_type in header.columns.items():
                if (
                    column_type.upper() == "VARCHAR"
                    and column not in header.key
                    and (join.source, column) not in fk_columns
                    and column not in {d.name for d in degenerate}
                ):
                    degenerate.append(
                        DegenerateDimension(name=column, source=join.source, column=column)
                    )

        excluded = set(base.key) | {c for s, c in fk_columns if s == base_name}
        facts.append(
            Fact(
                name=_fact_name(base_name),
                source=base_name,
                grain=list(base.key) or list(base.columns),
                grain_description=f"une ligne de {base_name}",
                joins=joins,
                foreign_keys=foreign_keys,
                date_keys=date_keys,
                degenerate_dimensions=degenerate,
                measures=_measures(base, excluded),
            )
        )

    modeled = (
        set(dimensions) | {f.source for f in facts} | {j.source for f in facts for j in f.joins}
    )
    for name in sorted(set(sources) - modeled):
        warnings.append(
            f"la source {name} n'est liée par aucune relation confirmée exploitable : "
            "elle n'est pas modélisée en Gold"
        )
    if not ctx.confirmed:
        warnings.append("aucune relation confirmée : confirmez les relations avant de modéliser")

    model = GoldModel(
        dimensions=[dimensions[name] for name in sorted(dimensions)],
        facts=facts,
        date_dimension=DateDimension(enabled=any(f.date_keys for f in facts)),
    )
    return model, warnings
