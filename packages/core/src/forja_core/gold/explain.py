"""French explanations of a Gold plan, recomputed from its decisions after every change."""

from __future__ import annotations

from forja_core.gold.plan import (
    DATE_DIMENSION,
    UNKNOWN_KEY,
    Aggregation,
    Dimension,
    Fact,
    GoldPlan,
    ScdType,
)

_AGGREGATIONS = {
    Aggregation.SUM: "somme",
    Aggregation.AVG: "moyenne",
    Aggregation.MIN: "minimum",
    Aggregation.MAX: "maximum",
    Aggregation.COUNT: "comptage",
    Aggregation.COUNT_DISTINCT: "comptage distinct",
    Aggregation.NONE: "aucune (valeur unitaire non additive)",
}


def _dimension(dim: Dimension) -> str:
    key = ", ".join(dim.natural_key)
    text = (
        f"Dimension issue de {dim.source} : une ligne par {key}"
        + (" et par version" if dim.scd is ScdType.SCD2 else "")
        + f", clé de substitution {dim.surrogate_key} (empreinte déterministe de la clé "
        f"naturelle), membre « inconnu » ({UNKNOWN_KEY}) pour les clés absentes des faits. "
    )
    if dim.scd is ScdType.SCD2:
        return text + (
            "Historisée en SCD2 (valid_from, valid_to, is_current) : chaque changement "
            "d'attribut crée une nouvelle version et les faits pointent vers la version "
            "valide à leur date."
        )
    if dim.extracted:
        order = f" (selon {dim.latest_by})" if dim.latest_by else ""
        text = (
            f"Entité extraite de {dim.source}, qui répète ses attributs sur chaque ligne : une "
            f"ligne par {key}, attributs de la ligne la plus récente{order}, clé de "
            f"substitution {dim.surrogate_key}, membre « inconnu » ({UNKNOWN_KEY}). "
        )
        levels = _hierarchy(dim)
        if levels:
            text += f"Hiérarchie géographique : {' > '.join(levels)}. "
    return text + "SCD1 : les attributs sont écrasés par leur dernière valeur."


_GEOGRAPHY = ("ville", "commune", "departement", "region", "pays")


def _hierarchy(dim: Dimension) -> list[str]:
    """Geographic levels among the attributes, from the finest to the coarsest."""
    names = {a.name for a in dim.attributes}
    return [level for level in _GEOGRAPHY if level in names]


def _fact(fact: Fact) -> str:
    grain = ", ".join(fact.grain)
    parts = [f"Fait au grain {fact.grain_description or grain} ({grain})."]
    if fact.joins:
        joined = ", ".join(j.source for j in fact.joins)
        parts.append(f"Enrichi par {joined} le long de relations N-1, sans démultiplication.")
    parts.append(
        f"Les clés étrangères sans correspondance sont rattachées au membre inconnu "
        f"({UNKNOWN_KEY}) : aucune ligne de fait n'est perdue."
    )
    return " ".join(parts)


_LEVELS = {
    "day": "au jour",
    "month": "au mois (premier jour du mois)",
    "quarter": "au trimestre (premier jour du trimestre)",
    "year": "à l'année (1er janvier de l'année)",
}


def refresh_explanations(plan: GoldPlan) -> GoldPlan:
    dimensions = {d.name: d for d in plan.dimensions}
    for dim in plan.dimensions:
        dim.explanation = _dimension(dim)
    for fact in plan.facts:
        fact.explanation = _fact(fact)
        for join in fact.joins:
            join.explanation = (
                f"{join.source} joint via {join.from_source}.{join.from_column} → "
                f"{join.source}.{join.to_column} : une seule ligne de {join.source} par ligne "
                "du fait."
            )
        for fk in fact.foreign_keys:
            target_dim = dimensions.get(fk.dimension)
            target = (
                f"{target_dim.source}.{', '.join(target_dim.natural_key)}"
                if target_dim
                else fk.dimension
            )
            fk.explanation = (
                f"{fk.name} → {fk.dimension} par {fk.source}.{fk.column} (entité extraite de la "
                "même source)."
                if target_dim is not None and target_dim.extracted
                else f"{fk.name} → {fk.dimension} via la relation confirmée "
                f"{fk.source}.{fk.column} → {target}."
            )
        for date_key in fact.date_keys:
            level = _LEVELS[date_key.grain]
            main = " Date principale du fait." if date_key.name == fact.primary_date else ""
            role = f" ({date_key.role})" if date_key.role else ""
            date_key.explanation = (
                f"{date_key.name}{role} → {DATE_DIMENSION} (clé AAAAMMJJ) à partir de "
                f"{date_key.source}.{date_key.column}, {level}.{main}"
            )
        for measure in fact.measures:
            measure.explanation = (
                f"{measure.name} = {measure.expression}, agrégée par "
                f"{_AGGREGATIONS[measure.aggregation]} par défaut."
            )
    plan.date_dimension.explanation = (
        "Dimension date générée : un jour par ligne de la plus ancienne à la plus récente "
        "date des faits, avec année, trimestre, mois, semaine et jour en français, et un "
        f"membre inconnu ({UNKNOWN_KEY})."
        if plan.date_dimension.enabled
        else "Pas de dimension date."
    )
    errors = sum(1 for i in plan.issues if i.severity == "error")
    warnings = len(plan.issues) - errors
    plan.summary = (
        f"{len(plan.dimensions)} dimension(s), {len(plan.facts)} fait(s), dimension date "
        f"{'générée' if plan.date_dimension.enabled else 'absente'}. Validation : "
        f"{errors} erreur(s), {warnings} avertissement(s)."
    )
    return plan
