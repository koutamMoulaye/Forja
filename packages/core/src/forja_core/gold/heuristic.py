"""Deterministic Gold model proposal, used when no language model is configured.

The confirmed relations give the shape of the star:

- a source that references others and is referenced by none is a fact (the most
  detailed grain, e.g. order lines);
- a referenced source that itself references others is a header (e.g. orders): it
  is joined to the fact along its many-to-one relation and lends it its foreign
  keys, dates and identifiers, never its additive amounts;
- a referenced source that references nothing is a dimension;
- when no relation gives a fact and none waits for review (a project of one file), a
  source left alone with numbers is a fact by itself: its texts are degenerate
  dimensions, its dates date keys.

Numbers are not all measures: a column of codes (a nomenclature such as the BAAC
lighting or severity codes, a month, a department number) is grouped by, never summed.
It is recognised by its name (code, num, id, type, cat...) or, from the profile, by a
few short integers; a name that reads as a measure (quantite, montant...) always wins.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from forja_core.gold.context import (
    GoldContext,
    SilverSource,
    is_integer,
    is_numeric,
    is_temporal,
)
from forja_core.gold.dates import date_keys as dated
from forja_core.gold.dates import period_grain
from forja_core.gold.naming import entity_name as business_entity
from forja_core.gold.naming import fact_name, process_label
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
from forja_core.relations.models import Relation, RelationStatus
from forja_core.relations.naming import singular

HISTORIZED_TOKENS = frozenset(
    {"segment", "categorie", "category", "statut", "status", "ville", "city", "region",
     "adresse", "address", "pays", "country", "niveau", "tier", "type", "groupe", "group"}
)  # fmt: skip
QUANTITY_TOKENS = frozenset({"quantite", "qte", "qty", "quantity", "nombre", "nb"})
PRICE_TOKENS = frozenset({"prix", "price", "tarif"})
AMOUNT_TOKENS = frozenset({"montant", "amount", "total", "ca"})
# Unit values: averaging them gives a line-weighted mean (the semantic layer computes a
# quantity-weighted price as sum(montant) / sum(quantite) instead).
AVERAGED_TOKENS = frozenset(
    {"prix", "price", "tarif", "taux", "rate", "pourcentage", "pct", "ratio", "unitaire", "unit"}
)
# Names that read as a measure: never taken for a code, whatever the values.
MEASURE_TOKENS = (
    QUANTITY_TOKENS | PRICE_TOKENS | AMOUNT_TOKENS | AVERAGED_TOKENS
    | {"count", "compte", "poids", "weight", "stock", "unites", "units", "duree", "duration",
       "cout", "cost", "revenu", "revenue", "remise", "discount", "marge", "margin", "solde",
       "balance", "valeur", "value", "volume", "distance", "km", "minutes", "secondes"}
)  # fmt: skip
CODE_TOKENS = frozenset(
    {"code", "cd", "num", "numero", "no", "id", "ident", "identifiant", "type", "cat",
     "categorie", "category", "classe", "class", "nature", "statut", "status", "sexe", "sex",
     "genre", "dep", "departement", "com", "commune", "insee", "postal", "cp", "zip",
     "nomenclature", "an", "annee", "year", "mois", "month", "jour", "day", "semaine", "week",
     "heure", "hour", "trimestre", "quarter"}
)  # fmt: skip
CODE_PREFIXES = ("cat", "code", "num", "typ", "id")  # catu, catv, numveh, typeroute...
# Coordinates are numbers no aggregation makes sense of.
COORDINATE_TOKENS = frozenset({"lat", "latitude", "lon", "lng", "long", "longitude"})
# An entity is worth a dimension with at least two attributes besides its key.
ENTITY_MIN_ATTRIBUTES = 2
# A few short integers (at most two digits, -1 for "unknown") look like a nomenclature.
CODE_MAX_DISTINCT = 30
CODE_MAX_VALUE = 99


def _tokens(name: str) -> set[str]:
    return column_tokens(name)[1]


def _number(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def is_code(source: SilverSource, column: str) -> bool:
    """Whether a numeric column holds codes to group by rather than a quantity to add."""
    if not is_numeric(source.columns.get(column, "")):
        return False
    tokens = _tokens(column)
    if tokens & MEASURE_TOKENS:
        return False
    if tokens & CODE_TOKENS or any(t.startswith(CODE_PREFIXES) for t in tokens):
        return True
    profile = source.profiles.get(column)
    if profile is None or not is_integer(source.columns[column]):
        return False
    low, high = _number(profile.min), _number(profile.max)
    return (
        low is not None
        and high is not None
        and low >= -1
        and high <= CODE_MAX_VALUE
        and 0 < profile.distinct_count <= CODE_MAX_DISTINCT
    )


def _codes(source: SilverSource, excluded: set[str]) -> list[str]:
    return [c for c in source.columns if c not in excluded and is_code(source, c)]


def _coordinates(source: SilverSource) -> set[str]:
    return {
        c
        for c, t in source.columns.items()
        if is_numeric(t) and _tokens(c) & COORDINATE_TOKENS and not _tokens(c) & MEASURE_TOKENS
    }


def _code_warning(source: str, codes: list[str]) -> str:
    return (
        f"{source} : {', '.join(codes)} "
        + ("est un code, gardé" if len(codes) == 1 else "sont des codes, gardés")
        + " comme dimension dégénérée et non sommé ; vérifiez avant d'approuver"
    )


def entity_name(source: str) -> str:
    return "_".join(singular(t) for t in source.split("_") if t)


def _fact_name(base: SilverSource) -> str:
    return fact_name(base.name, base.columns)


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
            aggregation=Aggregation.NONE if _tokens(column) & AVERAGED_TOKENS else Aggregation.SUM,
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
    measures.append(Measure(name="nb_lignes", expression="1", aggregation=Aggregation.SUM))
    return measures


def _entity_dimensions(
    source: SilverSource, grain: list[str], warnings: list[str]
) -> list[tuple[Dimension, str]]:
    """Entities stored on every row of a denormalized source, as dimensions with the
    fact column holding their key.

    A key whose attributes repeat (a museum's name, city, region on each year) becomes
    ``dim_<entity>`` with those attributes; the fact keeps the key and the measures.
    """
    found: list[tuple[Dimension, str]] = []
    taken: set[str] = set()
    period = next((c for c in grain if period_grain(source, c) is not None), None)
    for entity in sorted(source.entities, key=lambda e: (e.key not in grain, -len(e.attributes))):
        if entity.key in taken or entity.key not in source.columns:
            continue
        attributes = [
            a
            for a in entity.attributes
            if a in source.columns and a not in grain and a not in taken and a != entity.key
        ]
        if len(attributes) < ENTITY_MIN_ATTRIBUTES:
            continue
        name = business_entity(entity.key, attributes)
        dimension = Dimension(
            name=f"dim_{name}",
            source=source.name,
            natural_key=[entity.key],
            surrogate_key=f"{name}_key",
            attributes=[DimensionAttribute(column=a, name=a) for a in attributes],
            scd=ScdType.SCD1,
            extracted=True,
            latest_by=period,
        )
        found.append((dimension, entity.key))
        taken |= {entity.key, *attributes}
        if entity.conflicts:
            listed = ", ".join(f"{c} ({n})" for c, n in sorted(entity.conflicts.items()))
            warnings.append(
                f"{dimension.name} : quelques {entity.key} ont plusieurs valeurs de {listed} ; "
                "la valeur de la ligne la plus récente est retenue"
            )
    return found


def _standalone_fact(
    source: SilverSource, warnings: list[str]
) -> tuple[Fact, list[Dimension]] | None:
    """A source with numbers and no relation, as its own fact (with the entities stored on
    its rows as dimensions); None without numbers."""
    key = set(source.key)
    if not any(
        is_numeric(column_type)
        for column, column_type in source.columns.items()
        if column not in key
    ):
        return None
    grain = list(source.key) or list(source.columns)
    entities = _entity_dimensions(source, grain, warnings)
    in_dimensions = {
        c for dim, _ in entities for c in [*dim.natural_key, *(a.column for a in dim.attributes)]
    }
    process = process_label(source.name, source.columns)
    # A date of the entity (its opening, its labelling) stays a date of the fact too,
    # under its own role; a period number of the entity (a closure year) does not.
    dates = dated(
        source,
        [c for c in source.columns if c not in in_dimensions or period_grain(source, c) == "day"],
        grain,
        process,
    )
    date_columns = {d.column for d in dates}
    texts = [
        column
        for column, column_type in source.columns.items()
        # Personal data is never a degenerate dimension: it would reach Gold as is.
        if column_type.upper() == "VARCHAR"
        and not _is_personal(source, column)
        and column not in in_dimensions
    ]
    codes = _codes(source, key | in_dimensions | date_columns)
    if codes:
        warnings.append(_code_warning(source.name, codes))
    degenerate = [
        DegenerateDimension(name=c, source=source.name, column=c) for c in [*texts, *codes]
    ]
    foreign_keys = [
        ForeignKey(name=dim.surrogate_key, dimension=dim.name, source=source.name, column=column)
        for dim, column in entities
    ]
    excluded = key | set(texts) | set(codes) | _coordinates(source) | in_dimensions | date_columns
    fact = Fact(
        name=_fact_name(source),
        source=source.name,
        grain=grain,
        grain_description=_grain_description(source, grain, entities, dates),
        foreign_keys=foreign_keys,
        date_keys=dates,
        primary_date=dates[0].name if dates else None,
        degenerate_dimensions=degenerate,
        measures=_measures(source, excluded),
    )
    if len(dates) > 1:
        others = ", ".join(f"{d.column} ({d.role})" for d in dates[1:])
        warnings.append(
            f"{fact.name} : date principale {dates[0].column} ({dates[0].role}), la plus "
            f"remplie et liée au grain ; autres dates : {others}"
        )
    return fact, [dim for dim, _ in entities]


_GRAIN_WORDS = {"day": "jour", "month": "mois", "quarter": "trimestre", "year": "année"}


def _grain_description(
    source: SilverSource,
    grain: list[str],
    entities: list[tuple[Dimension, str]],
    dates: list[DateKey],
) -> str:
    if not source.key:
        return f"une ligne de {source.name}"
    names = {column: dim.name.removeprefix("dim_") for dim, column in entities}
    levels = {d.column: _GRAIN_WORDS[d.grain] for d in dates}
    parts = [names.get(c) or levels.get(c) or c for c in grain]
    return "une ligne par " + " et par ".join(p.replace("_", " ") for p in parts)


def _is_personal(source: SilverSource, column: str) -> bool:
    return any(c.target_column == column and c.pii_type is not None for c in source.plan.columns)


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
                        if (
                            is_numeric(sources[target].columns[column])
                            and column not in {r.from_column for r in outgoing[target]}
                            and not is_code(sources[target], column)
                        ):
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
        process = process_label(base_name, base.columns)
        for source_name in [base_name, *(j.source for j in joins)]:
            source = sources[source_name]
            temporal = [c for c, t in source.columns.items() if is_temporal(t)]
            date_keys.extend(dated(source, temporal, list(base.key), process))
        # The main date: the most filled (an order date before a delivery date).
        date_keys.sort(key=lambda d: -sources[d.source].fill_rate(d.column))
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
        codes = _codes(base, excluded)
        if codes:
            warnings.append(_code_warning(base_name, codes))
            degenerate.extend(
                DegenerateDimension(name=c, source=base_name, column=c)
                for c in codes
                if c not in {d.name for d in degenerate}
            )
        excluded |= set(codes) | _coordinates(base)
        facts.append(
            Fact(
                name=_fact_name(base),
                source=base_name,
                grain=list(base.key) or list(base.columns),
                grain_description=f"une ligne de {base_name}",
                joins=joins,
                foreign_keys=foreign_keys,
                date_keys=date_keys,
                primary_date=date_keys[0].name if date_keys else None,
                degenerate_dimensions=degenerate,
                measures=_measures(base, excluded),
            )
        )

    modeled = (
        set(dimensions) | {f.source for f in facts} | {j.source for f in facts for j in f.joins}
    )
    # Relations waiting for review come first: modelling without them would ignore them.
    pending = any(r.status is RelationStatus.SUGGESTED for r in ctx.relations)
    if not facts and not pending:
        for name in sorted(set(sources) - modeled):
            standalone = _standalone_fact(sources[name], warnings)
            if standalone is not None:
                fact, extracted = standalone
                facts.append(fact)
                for dim in extracted:
                    dimensions[dim.name] = dim
                modeled.add(name)
    for name in sorted(set(sources) - modeled):
        warnings.append(
            f"la source {name} n'est liée par aucune relation confirmée exploitable : "
            "elle n'est pas modélisée en Gold"
        )
    if not ctx.confirmed and len(sources) > 1:
        warnings.append("aucune relation confirmée : confirmez les relations avant de modéliser")

    model = GoldModel(
        dimensions=[dimensions[name] for name in sorted(dimensions)],
        facts=facts,
        date_dimension=DateDimension(enabled=any(f.date_keys for f in facts)),
    )
    return model, warnings
