"""Checks of a Gold model before approval, with French explanations.

Errors block approval:

- names: snake_case, unique, dimension and fact prefixes;
- dimensions: built source, existing natural key that is unique (primary key), existing
  attributes, referenced by at least one fact (no orphan dimension);
- facts: built source, grain containing the source primary key, joins and foreign
  keys backed by confirmed relations, read in the many-to-one direction only;
- fan-out: a join that would multiply fact rows, or an additive measure read from a
  joined table (whose values repeat on each fact row);
- measures: expressions accepted by the allowlist, numeric columns for SUM / AVG.
"""

from __future__ import annotations

import re

from forja_core.gold.context import GoldContext, is_numeric, is_temporal
from forja_core.gold.expressions import ExpressionError, check_expression
from forja_core.gold.plan import (
    Aggregation,
    Dimension,
    Fact,
    GoldModel,
    ValidationIssue,
)

_NAME_RE = re.compile(r"[a-z][a-z0-9_]*")
_ADDITIVE = frozenset({Aggregation.SUM, Aggregation.COUNT})


class _Issues:
    def __init__(self) -> None:
        self.items: list[ValidationIssue] = []

    def error(self, code: str, message: str, location: str = "") -> None:
        self.items.append(
            ValidationIssue(severity="error", code=code, message=message, location=location)
        )

    def warning(self, code: str, message: str, location: str = "") -> None:
        self.items.append(
            ValidationIssue(severity="warning", code=code, message=message, location=location)
        )


def _check_name(issues: _Issues, name: str, location: str, taken: set[str]) -> None:
    if not _NAME_RE.fullmatch(name):
        issues.error("invalid_name", f"« {name} » n'est pas un nom snake_case valide", location)
    if name in taken:
        issues.error("duplicate_name", f"le nom « {name} » est utilisé deux fois", location)
    taken.add(name)


def _check_dimension(issues: _Issues, dim: Dimension, ctx: GoldContext, taken: set[str]) -> None:
    location = f"dimensions.{dim.name}"
    _check_name(issues, dim.name, location, taken)
    if not dim.name.startswith("dim_"):
        issues.warning("dimension_prefix", f"{dim.name} : préfixe dim_ attendu", location)
    source = ctx.sources.get(dim.source)
    if source is None:
        issues.error(
            "unknown_source",
            f"{dim.name} : la source « {dim.source} » n'a pas de table Silver construite",
            location,
        )
        return
    for column in dim.natural_key:
        if column not in source.columns:
            issues.error(
                "unknown_column", f"{dim.name} : colonne inconnue {dim.source}.{column}", location
            )
    if tuple(dim.natural_key) != source.key:
        key = ", ".join(source.key) or "aucune"
        issues.error(
            "natural_key_not_unique",
            f"{dim.name} : la clé naturelle ({', '.join(dim.natural_key)}) doit être la clé "
            f"primaire de {dim.source} ({key}), sans quoi la dimension aurait des doublons",
            location,
        )
    columns: set[str] = {dim.surrogate_key}
    if dim.surrogate_key in source.columns:
        issues.error(
            "surrogate_key_collision",
            f"{dim.name} : la clé de substitution {dim.surrogate_key} existe déjà dans la source",
            location,
        )
    for attribute in dim.attributes:
        if attribute.column not in source.columns:
            issues.error(
                "unknown_column",
                f"{dim.name} : attribut sur une colonne inconnue {dim.source}.{attribute.column}",
                location,
            )
        _check_name(issues, attribute.name, f"{location}.{attribute.name}", columns)


def _fact_tables(fact: Fact, ctx: GoldContext, issues: _Issues) -> dict[str, set[str]] | None:
    """Tables usable by the fact (base and joins), after checking each join."""
    location = f"facts.{fact.name}"
    base = ctx.sources.get(fact.source)
    if base is None:
        issues.error(
            "unknown_source",
            f"{fact.name} : la source « {fact.source} » n'a pas de table Silver construite",
            location,
        )
        return None
    tables = {fact.source: set(base.columns)}
    for join in fact.joins:
        joined = ctx.sources.get(join.source)
        where = f"{location}.joins.{join.source}"
        if joined is None:
            issues.error(
                "unknown_source",
                f"{fact.name} : jointure sur une source inconnue « {join.source} »",
                where,
            )
            continue
        if join.from_source not in tables:
            issues.error(
                "join_order",
                f"{fact.name} : {join.source} est joint depuis {join.from_source}, qui n'est "
                "ni la source du fait ni une table déjà jointe",
                where,
            )
            continue
        relation = ctx.relation(join.from_source, join.from_column, join.source, join.to_column)
        if relation is None:
            reverse = ctx.relation(join.source, join.to_column, join.from_source, join.from_column)
            if reverse is not None:
                issues.error(
                    "fan_out",
                    f"{fact.name} : joindre {join.source} depuis {join.from_source} suit la "
                    f"relation {join.source}.{join.to_column} → "
                    f"{join.from_source}.{join.from_column} "
                    "à l'envers : chaque ligne du fait serait démultipliée (jointure 1-N), et ses "
                    "mesures comptées plusieurs fois",
                    where,
                )
            else:
                issues.error(
                    "unconfirmed_relation",
                    f"{fact.name} : aucune relation confirmée "
                    f"{join.from_source}.{join.from_column} "
                    f"→ {join.source}.{join.to_column}",
                    where,
                )
            continue
        tables[join.source] = set(joined.columns)
    return tables


def _check_fact(
    issues: _Issues,
    fact: Fact,
    model: GoldModel,
    ctx: GoldContext,
    taken: set[str],
) -> None:
    location = f"facts.{fact.name}"
    _check_name(issues, fact.name, location, taken)
    if not fact.name.startswith("fct_"):
        issues.warning("fact_prefix", f"{fact.name} : préfixe fct_ attendu", location)
    tables = _fact_tables(fact, ctx, issues)
    if tables is None:
        return
    base = ctx.sources[fact.source]

    missing = [c for c in fact.grain if c not in base.columns]
    if missing:
        issues.error(
            "unknown_column",
            f"{fact.name} : grain sur des colonnes inconnues ({', '.join(missing)})",
            location,
        )
    if base.key and not set(base.key) <= set(fact.grain):
        issues.error(
            "inconsistent_grain",
            f"{fact.name} : le grain ({', '.join(fact.grain)}) doit contenir la clé primaire de "
            f"{fact.source} ({', '.join(base.key)}), sinon une même combinaison de grain "
            "désignerait plusieurs lignes",
            location,
        )
    elif not base.key:
        issues.warning(
            "grain_not_guaranteed",
            f"{fact.name} : {fact.source} n'a pas de clé primaire, l'unicité du grain sera "
            "vérifiée par un test dbt",
            location,
        )

    columns: set[str] = set()
    dimensions = {d.name: d for d in model.dimensions}
    for fk in fact.foreign_keys:
        where = f"{location}.foreign_keys.{fk.name}"
        _check_name(issues, fk.name, where, columns)
        dim = dimensions.get(fk.dimension)
        if dim is None:
            issues.error(
                "unknown_dimension", f"{fact.name} : dimension inconnue « {fk.dimension} »", where
            )
            continue
        if fk.source not in tables or fk.column not in tables[fk.source]:
            issues.error(
                "unknown_column",
                f"{fact.name} : la clé étrangère {fk.name} lit {fk.source}.{fk.column}, absente "
                "du fait et de ses jointures",
                where,
            )
            continue
        if (
            len(dim.natural_key) != 1
            or ctx.relation(fk.source, fk.column, dim.source, dim.natural_key[0]) is None
        ):
            issues.error(
                "unconfirmed_relation",
                f"{fact.name} : la clé étrangère {fk.name} ({fk.source}.{fk.column} → "
                f"{dim.source}.{', '.join(dim.natural_key)}) ne repose sur aucune relation "
                "confirmée",
                where,
            )

    for date_key in fact.date_keys:
        where = f"{location}.date_keys.{date_key.name}"
        _check_name(issues, date_key.name, where, columns)
        if not model.date_dimension.enabled:
            issues.error(
                "date_dimension_disabled",
                f"{fact.name} : {date_key.name} demande la dimension date",
                where,
            )
        column_type = (
            ctx.sources[date_key.source].columns.get(date_key.column)
            if date_key.source in tables
            else None
        )
        if column_type is None:
            issues.error(
                "unknown_column",
                f"{fact.name} : colonne de date inconnue {date_key.source}.{date_key.column}",
                where,
            )
        elif not is_temporal(column_type):
            issues.error(
                "not_a_date",
                f"{fact.name} : {date_key.source}.{date_key.column} n'est pas une date "
                f"({column_type})",
                where,
            )

    for degenerate in fact.degenerate_dimensions:
        where = f"{location}.degenerate_dimensions.{degenerate.name}"
        _check_name(issues, degenerate.name, where, columns)
        if degenerate.source not in tables or degenerate.column not in tables[degenerate.source]:
            issues.error(
                "unknown_column",
                f"{fact.name} : colonne inconnue {degenerate.source}.{degenerate.column}",
                where,
            )

    if not fact.measures:
        issues.warning("no_measure", f"{fact.name} : aucune mesure", location)
    for measure in fact.measures:
        where = f"{location}.measures.{measure.name}"
        _check_name(issues, measure.name, where, columns)
        try:
            checked = check_expression(measure.expression, tables, fact.source)
        except ExpressionError as exc:
            issues.error("invalid_expression", f"{fact.name}.{measure.name} : {exc}", where)
            continue
        if measure.aggregation in (Aggregation.SUM, Aggregation.AVG):
            for table, column in checked.columns:
                column_type = ctx.sources[table].columns[column]
                if not is_numeric(column_type):
                    issues.error(
                        "not_numeric",
                        f"{fact.name}.{measure.name} : {table}.{column} ({column_type}) n'est pas "
                        f"numérique, impossible d'en faire la {measure.aggregation.value}",
                        where,
                    )
        joined = sorted({t for t, _ in checked.columns if t != fact.source})
        if joined and measure.aggregation in _ADDITIVE:
            issues.error(
                "fan_out",
                f"{fact.name}.{measure.name} : la mesure lit {', '.join(joined)}, qui est au "
                f"niveau supérieur au grain de {fact.source} ; sa valeur se répète sur chaque "
                f"ligne du fait et sa {measure.aggregation.value} serait multipliée",
                where,
            )
        elif joined and measure.aggregation is Aggregation.AVG:
            issues.warning(
                "weighted_average",
                f"{fact.name}.{measure.name} : la moyenne d'une valeur de {', '.join(joined)} "
                "est pondérée par le nombre de lignes du fait",
                where,
            )


def validate_model(model: GoldModel, ctx: GoldContext) -> list[ValidationIssue]:
    issues = _Issues()
    taken: set[str] = set()
    if not model.facts:
        issues.error("no_fact", "le modèle Gold doit contenir au moins un fait")
    for dimension in model.dimensions:
        _check_dimension(issues, dimension, ctx, taken)
    for fact in model.facts:
        _check_fact(issues, fact, model, ctx, taken)

    referenced = {fk.dimension for fact in model.facts for fk in fact.foreign_keys}
    for dimension in model.dimensions:
        if dimension.name not in referenced:
            issues.error(
                "orphan_dimension",
                f"{dimension.name} n'est référencée par aucun fait : une dimension orpheline "
                "ne sert à aucune analyse",
                f"dimensions.{dimension.name}",
            )
    uses_dates = any(f.date_keys for f in model.facts)
    if model.date_dimension.enabled and not uses_dates:
        issues.warning("unused_date_dimension", "la dimension date n'est utilisée par aucun fait")
    return issues.items


def link_relations(model: GoldModel, ctx: GoldContext) -> GoldModel:
    """Fill each foreign key's relation_id from the confirmed relations."""
    linked = model.model_copy(deep=True)
    dimensions = {d.name: d for d in linked.dimensions}
    for fact in linked.facts:
        for fk in fact.foreign_keys:
            dim = dimensions.get(fk.dimension)
            if dim is None or len(dim.natural_key) != 1:
                continue
            relation = ctx.relation(fk.source, fk.column, dim.source, dim.natural_key[0])
            fk.relation_id = relation.id if relation else None
    return linked
