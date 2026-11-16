"""Deterministic Gold model proposal: fast (a few seconds at most), always available, and
the reference a language model's proposal is compared with.

The relations between sources form a graph, read along the many-to-one direction (from
the table holding the reference to the table whose key it is). Relations confirmed by a
person are used, and so are relations still suggested with a high confidence: they are
then flagged « to confirm », which approval requires. A one-to-one relation is oriented
towards the table whose primary key it reads, whichever way it was stored.

- A **fact** is an event table at the end of the many-to-one relations: it references
  others and no other table references it (order lines, payments, reviews). Tables at
  different grains are different facts; they are never joined to each other.
- A **header** is a referenced table that is itself an event: its key is part of the
  key of the table referencing it (an order for its lines, its payments, its reviews),
  or it has dates and references other tables. It is joined to each fact along its
  many-to-one relation and lends it its dates, statuses and references; it is never a
  dimension, and its numbers are never summed at the grain of the fact.
- A **dimension** is a referenced table describing an entity (customers, products).
  When its key is an attachment key (read once per event, one-to-one) and the table
  also holds a stable identifier of the entity (a customer identifier repeated across
  orders), the dimension has one row per stable identifier.
- A **reference table** referenced by a dimension (a translation of category names) is
  merged into it, never proposed on its own.
- A source tied to nothing while others are tied (a table of coordinates repeated per
  postal code) is left out and the reason given.
- Without any relation (a project of one file), a source with numbers is a fact by
  itself: its texts are degenerate dimensions, its dates date keys, the entities stored
  on its rows dimensions.

Numbers are not all measures: a column of codes (a nomenclature such as lighting or
severity codes, a month, a department number) is grouped by, never summed. It is
recognised by its name (code, num, id, type, cat...) or, from the profile, by a few
short integers; a name that reads as a measure (quantite, montant...) always wins.

Dimensions are SCD1 unless their source changed between two of its versions (SCD2).
Names are business names without the source prefix, unique in the model.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from forja_core.gold.context import (
    GoldContext,
    SilverSource,
    is_integer,
    is_numeric,
    is_temporal,
)
from forja_core.gold.dates import date_keys as dated
from forja_core.gold.dates import period_grain, rank_dates
from forja_core.gold.naming import entity_name as business_entity
from forja_core.gold.naming import (
    entity_of_source,
    entity_phrase,
    fact_name,
    process_label,
    process_of,
)
from forja_core.gold.plan import (
    Aggregation,
    DateDimension,
    DateKey,
    DegenerateDimension,
    Dimension,
    DimensionAttribute,
    DimensionLookup,
    Fact,
    FactJoin,
    ForeignKey,
    GoldModel,
    Measure,
    ScdType,
)
from forja_core.profiling.naming import is_identifier_name
from forja_core.profiling.pii import column_tokens
from forja_core.relations.models import Relation, RelationStatus
from forja_core.relations.naming import singular

QUANTITY_TOKENS = frozenset({"quantite", "qte", "qty", "quantity", "nombre", "nb"})
PRICE_TOKENS = frozenset({"prix", "price", "tarif"})
AMOUNT_TOKENS = frozenset({"montant", "amount", "total", "ca"})
# Unit values: averaging them gives a line-weighted mean (the semantic layer computes a
# quantity-weighted price as sum(montant) / sum(quantite) instead).
AVERAGED_TOKENS = frozenset(
    {"prix", "price", "tarif", "taux", "rate", "pourcentage", "pct", "ratio", "unitaire", "unit"}
)
# Scores given on a scale: their mean is what is read, their sum means nothing.
SCORE_TOKENS = frozenset({"score", "note", "rating", "notation", "satisfaction", "stars"})
# Names that read as a measure: never taken for a code, whatever the values.
MEASURE_TOKENS = (
    QUANTITY_TOKENS | PRICE_TOKENS | AMOUNT_TOKENS | AVERAGED_TOKENS | SCORE_TOKENS
    | {"count", "compte", "poids", "weight", "stock", "unites", "units", "duree", "duration",
       "cout", "cost", "revenu", "revenue", "remise", "discount", "marge", "margin", "solde",
       "balance", "valeur", "value", "volume", "distance", "km", "minutes", "secondes",
       "freight", "fret", "frais", "fee", "fees"}
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
# Free text (a comment, a message) is no axis of analysis.
FREE_TEXT_TOKENS = frozenset(
    {"comment", "commentaire", "commentaires", "message", "description", "texte", "text",
     "remarque", "observation", "title", "titre", "body", "contenu", "content"}
)  # fmt: skip
# An entity is worth a dimension with at least two attributes besides its key.
ENTITY_MIN_ATTRIBUTES = 2
# A few short integers (at most two digits, -1 for "unknown") look like a nomenclature.
CODE_MAX_DISTINCT = 30
CODE_MAX_VALUE = 99
# A reference table merged into a dimension: a key and a few labels.
LOOKUP_MAX_COLUMNS = 4
# A stable identifier of an entity repeats on a few rows of its table only.
STABLE_ID_MIN_RATIO = 0.5
STABLE_ID_TOKENS = frozenset({"unique", "stable", "global", "master", "unifie", "person"})


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


def _is_free_text(source: SilverSource, column: str) -> bool:
    if source.columns.get(column, "").upper() != "VARCHAR":
        return False
    if _tokens(column) & FREE_TEXT_TOKENS:
        return True
    profile = source.profiles.get(column)
    return profile is not None and (profile.max_length or 0) > 200


def _code_warning(source: str, codes: list[str]) -> str:
    return (
        f"{source} : {', '.join(codes)} "
        + ("est un code, gardé" if len(codes) == 1 else "sont des codes, gardés")
        + " comme dimension dégénérée et non sommé ; vérifiez avant d'approuver"
    )


def entity_name(source: str) -> str:
    return "_".join(singular(t) for t in source.split("_") if t)


def _is_personal(source: SilverSource, column: str) -> bool:
    return any(c.target_column == column and c.pii_type is not None for c in source.plan.columns)


def _thousands(value: int) -> str:
    return f"{value:,}".replace(",", " ")


# --- Measures -----------------------------------------------------------------------------


def _measures(base: SilverSource, excluded: set[str]) -> list[Measure]:
    numeric = [c for c in base.columns if c not in excluded and is_numeric(base.columns[c])]
    quantity = next((c for c in numeric if _tokens(c) & QUANTITY_TOKENS), None)
    price = next((c for c in numeric if _tokens(c) & PRICE_TOKENS), None)
    has_amount = any(_tokens(c) & AMOUNT_TOKENS for c in numeric)

    def aggregation(column: str) -> Aggregation:
        tokens = _tokens(column)
        if tokens & SCORE_TOKENS:
            return Aggregation.AVG
        # A price is a unit value only beside a quantity; alone on a line, it is the
        # amount of the line, and adds up.
        if tokens & PRICE_TOKENS and quantity is None:
            return Aggregation.SUM
        if tokens & AVERAGED_TOKENS:
            return Aggregation.NONE
        return Aggregation.SUM

    measures = [
        Measure(name=column, expression=column, aggregation=aggregation(column))
        for column in numeric
    ]
    if quantity and price and not has_amount:
        measures.append(
            Measure(name="montant", expression=f"{quantity} * {price}", aggregation=Aggregation.SUM)
        )
    measures.append(Measure(name="nb_lignes", expression="1", aggregation=Aggregation.SUM))
    return measures


def _additive_candidates(source: SilverSource, excluded: set[str]) -> list[str]:
    """Numbers of a table that would be measures at its own grain."""
    return [
        c
        for c, t in source.columns.items()
        if is_numeric(t)
        and c not in excluded
        and c not in source.key
        and not is_code(source, c)
        and c not in _coordinates(source)
    ]


# --- One file, no relation ----------------------------------------------------------------


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
        and not _is_free_text(source, column)
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
        name=fact_name(source.name, source.columns),
        source=source.name,
        grain=grain,
        grain_description=_entity_grain(source, grain, entities, dates),
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


def _entity_grain(
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


# --- The relation graph -------------------------------------------------------------------


@dataclass(frozen=True)
class Edge:
    """``child.column`` references the key ``parent.key`` (many-to-one or one-to-one)."""

    child: str
    column: str
    parent: str
    key: str
    relation: Relation
    one_to_one: bool

    @property
    def to_confirm(self) -> bool:
        return self.relation.status is RelationStatus.SUGGESTED


@dataclass
class Graph:
    edges: list[Edge] = field(default_factory=list)
    outgoing: dict[str, list[Edge]] = field(default_factory=lambda: defaultdict(list))
    incoming: dict[str, list[Edge]] = field(default_factory=lambda: defaultdict(list))

    def add(self, edge: Edge) -> None:
        if any((e.child, e.column, e.parent) == (edge.child, edge.column, edge.parent)
               for e in self.edges):  # fmt: skip
            return
        self.edges.append(edge)
        self.outgoing[edge.child].append(edge)
        self.incoming[edge.parent].append(edge)

    def connected(self) -> set[str]:
        return {e.child for e in self.edges} | {e.parent for e in self.edges}


def _orient(relation: Relation, sources: dict[str, SilverSource]) -> Edge | None:
    """The relation read towards the table whose primary key it reads, or None when
    neither side is a primary key (the relation is stale: a key changed since)."""
    a, b = sources[relation.from_source], sources[relation.to_source]
    one = relation.cardinality == "1-1"
    if b.key == (relation.to_column,):
        return Edge(
            relation.from_source, relation.from_column, relation.to_source,
            relation.to_column, relation, one,
        )  # fmt: skip
    if one and a.key == (relation.from_column,):
        return Edge(
            relation.to_source, relation.to_column, relation.from_source,
            relation.from_column, relation, one,
        )  # fmt: skip
    return None


def _graph(ctx: GoldContext, warnings: list[str]) -> Graph:
    graph = Graph()
    weak = 0
    for relation in sorted(ctx.relations, key=lambda r: r.key):
        if relation.from_source not in ctx.sources or relation.to_source not in ctx.sources:
            continue
        if relation.status is RelationStatus.REJECTED:
            continue
        if relation.status is RelationStatus.SUGGESTED and relation not in ctx.strong_suggestions:
            weak += 1
            continue
        edge = _orient(relation, ctx.sources)
        if edge is None:
            key = ", ".join(ctx.sources[relation.to_source].key) or "aucune"
            warnings.append(
                f"relation {relation.from_source}.{relation.from_column} → "
                f"{relation.to_source}.{relation.to_column} ignorée : "
                f"{relation.to_column} n'est pas la clé de {relation.to_source} (clé : {key}) ; "
                "rejetez-la ou relancez la détection des relations"
            )
            continue
        graph.add(edge)
    if weak:
        warnings.append(
            f"{weak} relation(s) suggérée(s) à confiance moyenne n'ont pas été utilisées : "
            "confirmez-les pour les intégrer au modèle"
        )
    return graph


def _has_dates(source: SilverSource) -> bool:
    return any(period_grain(source, c) is not None for c in source.columns)


def _small_reference(name: str, sources: dict[str, SilverSource]) -> bool:
    """A key and a few labels, no date: a translation, a list of statuses."""
    source = sources[name]
    descriptive = [c for c in source.columns if c not in source.key]
    return (
        len(source.key) == 1
        and len(source.columns) <= LOOKUP_MAX_COLUMNS
        and bool(descriptive)
        and not _has_dates(source)
        and all(source.columns[c].upper() == "VARCHAR" for c in descriptive)
    )


def _is_header(name: str, graph: Graph, sources: dict[str, SilverSource]) -> bool:
    """A referenced table recording an event at a coarser grain (an order): its key is
    part of the key of a table referencing it (the lines, the payments of an order), or
    it has dates and references an entity table itself."""
    if not graph.incoming[name]:
        return False
    for edge in graph.incoming[name]:
        child = sources[edge.child]
        if len(child.key) > 1 and edge.column in child.key:
            return True
    return _has_dates(sources[name]) and any(
        not _small_reference(e.parent, sources) for e in graph.outgoing[name]
    )


def _merged(name: str, graph: Graph, headers: set[str]) -> bool:
    """A table referenced only by entity tables, and referencing nothing: its attributes
    are merged into the dimensions reading it (a reference table, or the outer branch
    of a snowflake), never a dimension of its own."""
    children = {e.child for e in graph.incoming[name]}
    return (
        bool(children)
        and not graph.outgoing[name]
        and all(graph.incoming[c] and c not in headers for c in children)
    )


def _stable_identifier(name: str, graph: Graph, sources: dict[str, SilverSource]) -> str | None:
    """A column identifying the entity across the rows of its table, when the key of the
    table is only an attachment key: ``customer_unique_id`` beside ``customer_id``, each
    order having its own customer_id."""
    source = sources[name]
    if len(source.key) != 1 or not source.row_count:
        return None
    attached = any(e.one_to_one for e in graph.incoming[name])
    references = {e.column for e in graph.outgoing[name]}
    best: tuple[int, str] | None = None
    for column, column_type in source.columns.items():
        if column in source.key or column in references or column_type.upper() not in (
            "VARCHAR", "BIGINT", "INTEGER"
        ):  # fmt: skip
            continue
        if not is_identifier_name(column) or _is_personal(source, column):
            continue
        profile = source.profiles.get(column)
        if profile is None or profile.null_count:
            continue
        ratio = profile.distinct_count / source.row_count
        if not STABLE_ID_MIN_RATIO <= ratio < 1:
            continue
        named = bool(_tokens(column) & STABLE_ID_TOKENS)
        if not (named or attached):
            continue
        rank = 0 if named else 1
        if best is None or rank < best[0]:
            best = (rank, column)
    return best[1] if best else None


@dataclass
class _Names:
    """Business names of the sources, unique in the model."""

    sources: list[str]
    taken: set[str] = field(default_factory=set)

    def entity(self, source: str) -> str:
        return entity_of_source(source, self.sources)

    def unique(self, name: str, hint: str) -> str:
        candidate = name
        if candidate in self.taken:
            candidate = f"{name}_{hint}" if hint and f"{name}_{hint}" not in self.taken else name
        index = 2
        while candidate in self.taken:
            candidate = f"{name}_{index}"
            index += 1
        self.taken.add(candidate)
        return candidate


def _scd(source: SilverSource, dimension: str, warnings: list[str]) -> ScdType:
    """SCD2 only when the source changed between two of its versions."""
    if source.changed_keys:
        warnings.append(
            f"{dimension} : historisée (SCD2), {_thousands(source.changed_keys)} clé(s) de "
            f"{source.name} ont changé d'attributs entre deux versions de la source"
        )
        return ScdType.SCD2
    return ScdType.SCD1


def _dimension(
    name: str,
    graph: Graph,
    ctx: GoldContext,
    lookups: set[str],
    names: _Names,
    warnings: list[str],
) -> tuple[Dimension, str]:
    """The dimension of a referenced table, and the column the facts read its key from
    (the table key, or its stable identifier)."""
    source = ctx.sources[name]
    entity = names.entity(name)
    dim_name = names.unique(f"dim_{entity}", "")
    stable = _stable_identifier(name, graph, ctx.sources)
    merged: list[DimensionLookup] = []
    merged_columns: set[str] = set()
    for edge in graph.outgoing[name]:
        if edge.parent not in lookups:
            continue
        reference = ctx.sources[edge.parent]
        attributes = [
            DimensionAttribute(
                column=c, name=c if c not in source.columns and c not in merged_columns
                else f"{names.entity(edge.parent)}_{c}",
            )
            for c in reference.columns
            if c not in reference.key
        ]  # fmt: skip
        merged_columns |= {a.name for a in attributes}
        merged.append(
            DimensionLookup(
                source=edge.parent,
                from_column=edge.column,
                to_column=edge.key,
                attributes=attributes,
            )
        )
        kind = (
            "une table de référence"
            if _small_reference(edge.parent, ctx.sources)
            else "décrite par la seule table " + name
        )
        warnings.append(
            f"{edge.parent} est {kind} : ses attributs "
            f"({', '.join(a.name for a in attributes)}) sont fusionnés dans {dim_name}, "
            "pas de dimension à part"
        )
    # The attachment key differs on each row of a stable identifier: not an attribute.
    excluded = {stable, *source.key} if stable else set(source.key)
    attributes = [
        DimensionAttribute(column=c, name=c)
        for c in source.columns
        if c not in excluded and not _is_free_text(source, c)
    ]
    if stable is not None:
        warnings.append(
            f"{dim_name} : clé métier {stable} (identifiant stable, "
            f"{_thousands(source.profiles[stable].distinct_count)} valeurs pour "
            f"{_thousands(source.row_count)} lignes) ; {source.key[0]} sert de clé de "
            "rattachement aux faits, la ligne la plus récente de chaque "
            f"{stable} décrit l'entité"
        )
        dimension = Dimension(
            name=dim_name,
            source=name,
            natural_key=[stable],
            surrogate_key=f"{entity}_key",
            attributes=attributes,
            lookups=merged,
            scd=ScdType.SCD1,
            extracted=True,
        )
        return dimension, stable
    dimension = Dimension(
        name=dim_name,
        source=name,
        natural_key=list(source.key),
        surrogate_key=f"{entity}_key",
        attributes=attributes,
        lookups=merged,
        scd=_scd(source, dim_name, warnings),
    )
    return dimension, source.key[0]


def _excluded_source(source: SilverSource) -> str:
    """Why a source tied to nothing is left out of the model."""
    if not source.key:
        rows = source.row_count or source.table.row_count or 0
        codes = [
            (c, p) for c, p in source.profiles.items() if is_identifier_name(c) and p.distinct_count
        ]
        detail = ""
        if codes and rows:
            column, profile = max(codes, key=lambda item: item[1].distinct_count)
            per_value = rows / profile.distinct_count
            detail = (
                f" ({_thousands(rows)} lignes pour {_thousands(profile.distinct_count)} "
                f"valeurs de {column}, soit {per_value:.0f} lignes par valeur en moyenne)"
            )
        return (
            f"la source {source.name} est exclue du modèle : elle n'a pas de clé unique, ses "
            f"lignes se répètent{detail} et aucune relation ne la lie aux autres sources. "
            "Pour l'utiliser, dédoublonnez-la (une ligne par code) puis reliez-la à une "
            "dimension"
        )
    return (
        f"la source {source.name} n'est liée par aucune relation exploitable : elle n'est "
        "pas modélisée en Gold"
    )


def _fact(
    base_name: str,
    graph: Graph,
    ctx: GoldContext,
    headers: set[str],
    dimensions: dict[str, tuple[Dimension, str]],
    names: _Names,
    warnings: list[str],
) -> Fact:
    sources = ctx.sources
    base = sources[base_name]
    joins: list[FactJoin] = []
    foreign_keys: list[ForeignKey] = []
    visited = {base_name}
    frontier = [base_name]
    while frontier:
        current = frontier.pop(0)
        for edge in sorted(graph.outgoing[current], key=lambda e: (e.parent, e.column)):
            target = edge.parent
            if target in headers:
                if target in visited:
                    continue
                visited.add(target)
                frontier.append(target)
                joins.append(
                    FactJoin(
                        source=target,
                        from_source=current,
                        from_column=edge.column,
                        to_column=edge.key,
                    )
                )
                key_columns = {e.column for e in graph.outgoing[target]}
                for column in _additive_candidates(sources[target], key_columns):
                    warnings.append(
                        f"{target}.{column} n'est pas repris comme mesure de "
                        f"{names.entity(base_name)} : il est au niveau de {target}, le sommer "
                        f"au grain de {base_name} le multiplierait"
                    )
            elif target in dimensions:
                dimension, column = dimensions[target]
                source, read = current, edge.column
                if column != edge.key:
                    # The stable identifier lives in the dimension table: joined to reach it.
                    if target not in visited:
                        visited.add(target)
                        joins.append(
                            FactJoin(
                                source=target,
                                from_source=current,
                                from_column=edge.column,
                                to_column=edge.key,
                            )
                        )
                    source, read = target, column
                name = dimension.surrogate_key
                if any(fk.name == name for fk in foreign_keys):
                    name = f"{edge.column}_key"
                foreign_keys.append(
                    ForeignKey(
                        name=name,
                        dimension=dimension.name,
                        source=source,
                        column=read,
                        relation_id=edge.relation.id,
                    )
                )

    fk_columns = {(fk.source, fk.column) for fk in foreign_keys}
    joined_dims = {j.source for j in joins if j.source in dimensions}
    edge_columns = {(e.child, e.column) for e in graph.edges}
    label = process_label(base_name, base.columns)
    tables = [base_name, *(j.source for j in joins if j.source not in joined_dims)]
    date_keys = rank_dates(
        [
            (sources[t], [c for c, kind in sources[t].columns.items() if is_temporal(kind)])
            for t in tables
        ],
        list(base.key),
        label,
    )

    degenerate: list[DegenerateDimension] = []

    def keep(source_name: str, column: str) -> None:
        if column not in {d.name for d in degenerate}:
            degenerate.append(DegenerateDimension(name=column, source=source_name, column=column))

    for column in base.key:
        if (base_name, column) not in fk_columns:
            keep(base_name, column)
    # Descriptive text of the fact and of its headers (an order status, a payment type).
    for table in tables:
        table_source = sources[table]
        for column, column_type in table_source.columns.items():
            if (
                column_type.upper() == "VARCHAR"
                and column not in table_source.key
                and (table, column) not in fk_columns
                and (table, column) not in edge_columns
                and not _is_personal(table_source, column)
                and not _is_free_text(table_source, column)
            ):
                keep(table, column)
    free = [c for c in base.columns if _is_free_text(base, c)]
    if free:
        warnings.append(
            f"{base_name} : {', '.join(free)} "
            + (
                "est un texte libre, non repris"
                if len(free) == 1
                else "sont des textes libres, non repris"
            )
            + " comme axe d'analyse"
        )

    excluded = set(base.key) | {c for s, c in fk_columns if s == base_name}
    excluded |= {c for s, c in edge_columns if s == base_name}
    codes = _codes(base, excluded)
    if codes:
        warnings.append(_code_warning(base_name, codes))
        for column in codes:
            keep(base_name, column)
    excluded |= set(codes) | _coordinates(base)
    entity = names.entity(base_name)
    process = process_of(base_name, base.columns)
    name = names.unique(f"fct_{process.fact}" if process else f"fct_{entity}", entity)
    grain = list(base.key) or list(base.columns)
    return Fact(
        name=name,
        source=base_name,
        grain=grain,
        grain_description=f"une ligne par {entity_phrase(entity)} ({', '.join(grain)})",
        joins=joins,
        foreign_keys=foreign_keys,
        date_keys=date_keys,
        primary_date=date_keys[0].name if date_keys else None,
        degenerate_dimensions=degenerate,
        measures=_measures(base, excluded),
    )


def propose_heuristic(ctx: GoldContext) -> tuple[GoldModel, list[str]]:
    """A star schema from the relations, and warnings about what was decided or left out."""
    sources = ctx.sources
    warnings: list[str] = []
    graph = _graph(ctx, warnings)
    names = _Names(sorted(sources))

    headers = {s for s in sources if _is_header(s, graph, sources)}
    lookups = {s for s in sources if _merged(s, graph, headers)}
    bases = sorted(s for s in sources if graph.outgoing[s] and not graph.incoming[s])
    referenced = sorted(
        s for s in sources if graph.incoming[s] and s not in headers and s not in lookups
    )
    dimensions: dict[str, tuple[Dimension, str]] = {}
    for name in referenced:
        dimensions[name] = _dimension(name, graph, ctx, lookups, names, warnings)

    facts = [
        _fact(base, graph, ctx, headers, dimensions, names, warnings)
        for base in bases
        if base not in headers
    ]
    for header in sorted(headers):
        warnings.append(
            f"{header} est un en-tête d'événement (référencé par "
            f"{', '.join(sorted({e.child for e in graph.incoming[header]}))}) : ses dates, "
            "statuts et références sont joints à chaque fait, ce n'est pas une dimension"
        )
    if len(facts) > 1:
        warnings.append(
            "faits de grains différents gardés séparés ("
            + ", ".join(f"{f.name} : {f.grain_description}" for f in facts)
            + ") : les joindre démultiplierait les lignes et fausserait les sommes"
        )

    used = {e.relation.id: e for e in graph.edges if e.to_confirm}
    if used:
        listed = ", ".join(
            f"{e.child}.{e.column} → {e.parent}.{e.key}"
            for e in sorted(used.values(), key=lambda e: (e.child, e.column))
        )
        warnings.append(
            f"{len(used)} relation(s) suggérée(s) à forte confiance utilisée(s), à confirmer "
            f"avant d'approuver le modèle : {listed}"
        )

    modeled = (
        set(dimensions) | lookups | {f.source for f in facts}
        | {j.source for f in facts for j in f.joins}
    )  # fmt: skip
    extracted: dict[str, Dimension] = {}
    if not facts and not graph.edges:
        for name in sorted(set(sources) - modeled):
            standalone = _standalone_fact(sources[name], warnings)
            if standalone is not None:
                fact, entity_dims = standalone
                facts.append(fact)
                for dim in entity_dims:
                    extracted[dim.name] = dim
                modeled.add(name)
    for name in sorted(set(sources) - modeled):
        warnings.append(_excluded_source(sources[name]))
    if not graph.edges and len(sources) > 1:
        warnings.append("aucune relation entre les sources : confirmez-les avant de modéliser")

    used_dims = {fk.dimension for f in facts for fk in f.foreign_keys}
    all_dims = [d for d, _ in dimensions.values() if d.name in used_dims] + list(extracted.values())
    model = GoldModel(
        dimensions=sorted(all_dims, key=lambda d: d.name),
        facts=facts,
        date_dimension=DateDimension(enabled=any(f.date_keys for f in facts)),
    )
    return model, warnings
