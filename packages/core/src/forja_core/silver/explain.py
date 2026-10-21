"""French explanations of plan rules, shown as-is in the user interface.

Explanations are recomputed from the plan state after every change, so they
always describe what the Silver build will actually do.
"""

from __future__ import annotations

from forja_core.profiling.models import ConfidenceLevel, PiiType
from forja_core.profiling.types import ISO8601
from forja_core.silver.plan import (
    ColumnPlan,
    Normalization,
    PiiTreatment,
    RuleKind,
    SilverType,
    TransformationPlan,
    ValidityRule,
)

_TYPE_LABELS: dict[SilverType, str] = {
    SilverType.BIGINT: "entier",
    SilverType.DOUBLE: "nombre décimal",
    SilverType.BOOLEAN: "booléen",
    SilverType.DATE: "date",
    SilverType.TIMESTAMP: "date et heure",
    SilverType.VARCHAR: "texte",
}
_PII_LABELS: dict[PiiType, str] = {
    PiiType.EMAIL: "email",
    PiiType.PHONE: "téléphone",
    PiiType.IBAN: "IBAN",
    PiiType.FIRST_NAME: "prénom",
    PiiType.LAST_NAME: "nom",
    PiiType.FULL_NAME: "nom complet",
}
_LEVEL_LABELS: dict[ConfidenceLevel, str] = {
    ConfidenceLevel.HIGH: "confiance élevée",
    ConfidenceLevel.MEDIUM: "confiance moyenne",
    ConfidenceLevel.LOW: "confiance faible",
}
_TREATMENT_LABELS: dict[PiiTreatment, str] = {
    PiiTreatment.HASH: "pseudonymisée (HMAC-SHA256)",
    PiiTreatment.MASK: "partiellement masquée",
    PiiTreatment.DROP: "retirée",
    PiiTreatment.NONE: "laissée en clair",
}
_NORMALIZATION_SENTENCES: dict[Normalization, str] = {
    Normalization.NONE: "",
    Normalization.TRIM: "Espaces en début et fin retirés.",
    Normalization.COLLAPSE_WHITESPACE: "Espaces superflus retirés.",
    Normalization.LOWERCASE: "Mise en minuscules, espaces retirés.",
    Normalization.COMPACT_UPPERCASE: "Espaces retirés, mise en majuscules.",
}
_FORMAT_TOKENS = (
    ("%Y", "AAAA"),
    ("%y", "AA"),
    ("%m", "MM"),
    ("%d", "JJ"),
    ("%H", "hh"),
    ("%M", "mm"),
    ("%S", "ss"),
    ("%f", "ffffff"),
)


def type_label(target_type: SilverType) -> str:
    return _TYPE_LABELS[target_type]


def format_label(date_format: str | None) -> str:
    if date_format is None or date_format == ISO8601:
        return "ISO 8601"
    label = date_format
    for token, replacement in _FORMAT_TOKENS:
        label = label.replace(token, replacement)
    return label


def _decimal(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def _count(value: int, singular: str, plural: str) -> str:
    return f"{value} {singular if value <= 1 else plural}"


def _invalid_suffix(column: ColumnPlan) -> str:
    invalid = column.stats.invalid_count
    if invalid is None:
        return "valeurs invalides non évaluées (type choisi manuellement)"
    if invalid == 0:
        return "aucune valeur invalide détectée"
    return _count(invalid, "valeur invalide détectée", "valeurs invalides détectées")


def cast_sentence(column: ColumnPlan) -> str:
    target = column.target_type
    if not column.from_text:
        if target.value == column.source_type.lower():
            return f"Type {type_label(target)} conservé."
        return f"Conversion du type {column.source_type} en {type_label(target)}."
    match target:
        case SilverType.VARCHAR:
            return "Texte conservé."
        case SilverType.DATE | SilverType.TIMESTAMP:
            label = type_label(target)
            fmt = format_label(column.cast.date_format)
            return f"Conversion en {label} au format {fmt}, {_invalid_suffix(column)}."
        case SilverType.DOUBLE:
            separator = (
                "virgule décimale, séparateurs de milliers retirés"
                if column.cast.decimal_separator == ","
                else "point décimal"
            )
            return f"Conversion en nombre décimal ({separator}), {_invalid_suffix(column)}."
        case SilverType.BOOLEAN:
            trues = "/".join(column.cast.true_values) or "true"
            falses = "/".join(column.cast.false_values) or "false"
            return (
                f"Conversion en booléen ({trues} → vrai, {falses} → faux), "
                f"{_invalid_suffix(column)}."
            )
        case SilverType.BIGINT:
            return f"Conversion en entier, {_invalid_suffix(column)}."


def column_explanation(column: ColumnPlan) -> str:
    if not column.included:
        if column.stats.null_count == column.stats.row_count:
            return "Colonne entièrement vide : exclue de la couche Silver."
        return "Colonne exclue de la couche Silver."
    parts = [cast_sentence(column)]
    if column.from_text and column.target_type is SilverType.VARCHAR:
        sentence = _NORMALIZATION_SENTENCES[column.normalization]
        if sentence:
            parts.append(sentence)
    if column.from_text and column.cast.null_values:
        shown = ", ".join(f"« {v} »" for v in column.cast.null_values[:4])
        parts.append(f"Valeurs vides ou {shown}… traitées comme nulles.")
    if column.target_column != column.source_column:
        parts.append(f"Renommée en « {column.target_column} » (snake_case).")
    if not column.present_in_latest:
        parts.append("Absente de la dernière version : valeurs nulles pour les nouvelles lignes.")
    if column.pii_type is not None:
        level = f", {_LEVEL_LABELS[column.pii_level]}" if column.pii_level else ""
        parts.append(
            f"Donnée personnelle ({_PII_LABELS[column.pii_type]}{level}) : en clair en Silver, "
            f"{_TREATMENT_LABELS[column.pii_treatment]} dans serving et les exports."
        )
    return " ".join(parts)


def rule_explanation(column: ColumnPlan, rule: ValidityRule) -> str:
    status = "" if rule.enabled else " (règle désactivée)"
    match rule.kind:
        case RuleKind.CASTABLE:
            text = (
                f"Les valeurs non convertibles en {type_label(column.target_type)} "
                "sont mises en quarantaine"
            )
        case RuleKind.NOT_NULL:
            text = "Clé primaire : les lignes sans valeur sont mises en quarantaine"
        case RuleKind.EMAIL_FORMAT:
            text = "Les adresses email mal formées sont mises en quarantaine"
        case RuleKind.PHONE_FORMAT:
            text = "Les numéros de téléphone mal formés sont mis en quarantaine"
        case RuleKind.IBAN_FORMAT:
            text = "Les IBAN mal formés sont mis en quarantaine"
    return f"{text}{status}."


def reject_reason(column: ColumnPlan, kind: RuleKind) -> str:
    """Message stored in ``_reject_reason`` for a row failing ``kind`` on ``column``."""
    name = column.target_column
    match kind:
        case RuleKind.CASTABLE:
            detail = type_label(column.target_type)
            if column.target_type in (SilverType.DATE, SilverType.TIMESTAMP):
                detail += f" ({format_label(column.cast.date_format)})"
            return f"{name} : valeur non convertible en {detail}"
        case RuleKind.NOT_NULL:
            return f"{name} : clé primaire manquante"
        case RuleKind.EMAIL_FORMAT:
            return f"{name} : format d'email invalide"
        case RuleKind.PHONE_FORMAT:
            return f"{name} : format de téléphone invalide"
        case RuleKind.IBAN_FORMAT:
            return f"{name} : format d'IBAN invalide"


DUPLICATE_KEY_REASON = "clé primaire en double dans le lot"


def column_description(column: ColumnPlan) -> str:
    """Description written in the dbt ``schema.yml``."""
    stats = column.stats
    parts = [f"{type_label(column.target_type).capitalize()}."]
    if column.from_text and column.target_type in (SilverType.DATE, SilverType.TIMESTAMP):
        parts.append(f"Source au format {format_label(column.cast.date_format)}.")
    parts.append(
        f"{_decimal(stats.null_pct)} % de valeurs nulles, "
        f"{_count(stats.distinct_count, 'valeur distincte', 'valeurs distinctes')} au profiling."
    )
    if column.pii_type is not None:
        parts.append(f"Donnée personnelle : {_PII_LABELS[column.pii_type]}.")
    if column.source_column != column.target_column:
        parts.append(f"Colonne source : « {column.source_column} ».")
    return " ".join(parts)


def refresh_explanations(plan: TransformationPlan) -> TransformationPlan:
    for column in plan.columns:
        column.description = column_description(column)
        column.explanation = column_explanation(column)
        for rule in column.rules:
            rule.explanation = rule_explanation(column, rule)

    if plan.primary_key is None:
        plan_key = (
            "Aucune clé primaire retenue : l'unicité et l'incrémental reposent sur _row_hash."
        )
    else:
        names = ", ".join(c.target_column for c in plan.key_columns())
        quasi = (
            " (quasi unique au profiling : les lignes sans clé ou en conflit iront en quarantaine)"
            if plan.primary_key.quasi_unique
            else ""
        )
        plan_key = (
            f"Clé primaire retenue : {names}{quasi}. Une ligne plus récente de même clé "
            "remplace l'ancienne ; deux lignes d'un même lot avec la même clé sont mises "
            "en quarantaine."
        )
        plan.primary_key.explanation = plan_key

    dedup = plan.deduplication
    if not dedup.enabled:
        dedup.explanation = "Déduplication exacte désactivée."
    elif dedup.duplicate_rows:
        dedup.explanation = (
            "Déduplication exacte : "
            f"{_count(dedup.duplicate_rows, 'doublon détecté', 'doublons détectés')} "
            "au profiling, une seule occurrence conservée."
        )
    else:
        dedup.explanation = (
            "Déduplication exacte : aucun doublon au profiling, une seule occurrence "
            "conservée si des doublons apparaissent."
        )

    included = plan.included_columns()
    quarantined = sum(len(c.enabled_rules()) for c in included)
    pii = sum(1 for c in included if c.pii_type is not None)
    plan.summary = (
        f"{len(included)} colonne(s) publiée(s) sur {len(plan.columns)}, "
        f"{quarantined} règle(s) de validité, {pii} colonne(s) personnelle(s). {plan_key}"
    )
    return plan
