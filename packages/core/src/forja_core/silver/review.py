"""Rule-by-rule review of a transformation plan.

A plan is stored column by column; a person reviews it as a list of rules: a type
conversion, a normalization shared by several columns, a pseudonymization, the
deduplication, the primary key. Each rule has a stable id derived from what it
acts on, a French title and explanation, a confidence level, and the patch that
undoes it. Decisions (validated or rejected) are kept on the draft plan; approving
the plan applies the rejections first.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forja_core.profiling.models import ConfidenceLevel, PiiType
from forja_core.silver.explain import cast_sentence, format_label
from forja_core.silver.plan import (
    ColumnPatch,
    ColumnPlan,
    Normalization,
    PiiTreatment,
    PlanPatch,
    RuleKind,
    SilverType,
    TransformationPlan,
)

ReviewDecision = Literal["validated", "rejected"]


class ReviewRuleKind(StrEnum):
    CAST = "cast"
    NORMALIZE = "normalize"
    PII = "pii"
    FORMAT = "format"
    EXCLUDE = "exclude"
    DEDUPLICATE = "deduplicate"
    PRIMARY_KEY = "primary_key"


class ReviewRule(BaseModel):
    id: str = Field(description="Stable id, e.g. cast:date_inscription or normalize:trim")
    kind: ReviewRuleKind
    title: str
    explanation: str
    columns: list[str] = Field(description="Source columns the rule acts on")
    confidence: ConfidenceLevel
    decision: ReviewDecision | None = None
    rejectable: bool = Field(
        default=True, description="False when the rule may only be edited (personal data)"
    )
    affected: int | None = Field(
        default=None, description="Values or rows concerned at profiling, when known"
    )


class PlanReview(BaseModel):
    source_id: str
    plan_version: int
    status: str
    rules: list[ReviewRule]
    pending: int
    validated: int
    rejected: int


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decisions: dict[str, ReviewDecision | None] = Field(
        description="Decision by rule id; null puts the rule back to review"
    )


_PII_NOUNS: dict[PiiType, str] = {
    PiiType.EMAIL: "l'email",
    PiiType.PHONE: "le téléphone",
    PiiType.IBAN: "l'IBAN",
    PiiType.FIRST_NAME: "le prénom",
    PiiType.LAST_NAME: "le nom",
    PiiType.FULL_NAME: "le nom complet",
}
_PII_VERBS: dict[PiiTreatment, str] = {
    PiiTreatment.HASH: "Pseudonymiser",
    PiiTreatment.MASK: "Masquer partiellement",
    PiiTreatment.DROP: "Retirer des exports",
    PiiTreatment.NONE: "Laisser en clair",
}
_PII_SENTENCES: dict[PiiTreatment, str] = {
    PiiTreatment.HASH: "Remplacée par un identifiant stable (HMAC-SHA256) dans serving et les "
    "exports : les jointures restent possibles, les valeurs réelles restent sur ce poste.",
    PiiTreatment.MASK: "Partiellement masquée dans serving et les exports : la forme reste "
    "reconnaissable, la valeur ne l'est plus.",
    PiiTreatment.DROP: "Retirée de serving et des exports ; elle reste dans la table Silver.",
    PiiTreatment.NONE: "Laissée en clair dans serving et les exports. Un analyst la verra "
    "toujours pseudonymisée.",
}
_NORMALIZATION_TITLES: dict[Normalization, str] = {
    Normalization.COLLAPSE_WHITESPACE: "Supprimer les espaces superflus",
    Normalization.LOWERCASE: "Mettre en minuscules, sans espaces",
    Normalization.COMPACT_UPPERCASE: "Retirer les espaces, mettre en majuscules",
}
_NORMALIZATION_SENTENCES: dict[Normalization, str] = {
    Normalization.COLLAPSE_WHITESPACE: "Espaces en début et en fin retirés, espaces multiples "
    "ramenés à un seul.",
    Normalization.LOWERCASE: "Valeurs mises en minuscules, espaces retirés : « J.Dupont@Mail.fr "
    "» devient « j.dupont@mail.fr ».",
    Normalization.COMPACT_UPPERCASE: "Espaces retirés et lettres en majuscules : « fr76 3000 » "
    "devient « FR763000 ».",
}
_CAST_TITLES: dict[SilverType, str] = {
    SilverType.BIGINT: "Convertir en entier",
    SilverType.DOUBLE: "Convertir en nombre décimal",
    SilverType.DECIMAL: "Convertir en montant décimal",
    SilverType.BOOLEAN: "Convertir en booléen",
    SilverType.DATE: "Convertir en date",
    SilverType.TIMESTAMP: "Convertir en date et heure",
    SilverType.VARCHAR: "Garder en texte",
}
_FORMAT_TITLES: dict[RuleKind, str] = {
    RuleKind.EMAIL_FORMAT: "Écarter les emails mal formés",
    RuleKind.PHONE_FORMAT: "Écarter les téléphones mal formés",
    RuleKind.IBAN_FORMAT: "Écarter les IBAN mal formés",
}


def _cast_confidence(column: ColumnPlan) -> ConfidenceLevel:
    if column.stats.invalid_count is None:
        return ConfidenceLevel.HIGH  # chosen by a person
    ratio = column.stats.match_ratio
    if ratio >= 0.99:
        return ConfidenceLevel.HIGH
    if ratio >= 0.9:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def _converts(column: ColumnPlan) -> bool:
    """A visible type change: text read as another type, or a physical type changed."""
    if column.from_text:
        return column.target_type is not SilverType.VARCHAR
    return column.target_type.value != column.source_type.lower()


def _cast_explanation(column: ColumnPlan) -> str:
    sentence = cast_sentence(column)
    castable = column.rule(RuleKind.CASTABLE)
    invalid = column.stats.invalid_count or 0
    if castable is not None and invalid:
        if castable.enabled:
            sentence += " Les lignes concernées iront en quarantaine, pas dans la table."
        else:
            sentence += " Les valeurs invalides seront mises à vide et les lignes conservées."
    return sentence


def _cast_rule(column: ColumnPlan) -> ReviewRule:
    title = _CAST_TITLES[column.target_type]
    if column.target_type in (SilverType.DATE, SilverType.TIMESTAMP) and column.from_text:
        title += f" ({format_label(column.cast.date_format)})"
    return ReviewRule(
        id=f"cast:{column.source_column}",
        kind=ReviewRuleKind.CAST,
        title=title,
        explanation=_cast_explanation(column),
        columns=[column.source_column],
        confidence=_cast_confidence(column),
        affected=column.stats.invalid_count,
    )


def _pii_rule(column: ColumnPlan) -> ReviewRule:
    assert column.pii_type is not None
    noun = _PII_NOUNS[column.pii_type]
    return ReviewRule(
        id=f"pii:{column.source_column}",
        kind=ReviewRuleKind.PII,
        title=f"{_PII_VERBS[column.pii_treatment]} {noun}",
        explanation=_PII_SENTENCES[column.pii_treatment],
        columns=[column.source_column],
        confidence=column.pii_level or ConfidenceLevel.MEDIUM,
        rejectable=False,
    )


def review_rules(plan: TransformationPlan) -> list[ReviewRule]:
    """The rules of a plan, in reading order, with their decisions."""
    rules: list[ReviewRule] = []
    included = plan.included_columns()

    for column in included:
        if _converts(column):
            rules.append(_cast_rule(column))

    by_normalization: dict[Normalization, list[ColumnPlan]] = {}
    for column in included:
        if (
            column.from_text
            and column.target_type is SilverType.VARCHAR
            and column.normalization in _NORMALIZATION_TITLES
        ):
            by_normalization.setdefault(column.normalization, []).append(column)
    for normalization, columns in by_normalization.items():
        rules.append(
            ReviewRule(
                id=f"normalize:{normalization.value}",
                kind=ReviewRuleKind.NORMALIZE,
                title=_NORMALIZATION_TITLES[normalization],
                explanation=_NORMALIZATION_SENTENCES[normalization],
                columns=[c.source_column for c in columns],
                confidence=ConfidenceLevel.HIGH,
            )
        )

    for column in included:
        if column.pii_type is not None:
            rules.append(_pii_rule(column))
        for validity in column.rules:
            if validity.kind in _FORMAT_TITLES and validity.enabled:
                rules.append(
                    ReviewRule(
                        id=f"format:{column.source_column}:{validity.kind.value}",
                        kind=ReviewRuleKind.FORMAT,
                        title=_FORMAT_TITLES[validity.kind],
                        explanation=f"{validity.explanation} Colonne {column.target_column}.",
                        columns=[column.source_column],
                        confidence=column.pii_level or ConfidenceLevel.MEDIUM,
                    )
                )

    for column in plan.columns:
        if not column.included and column.present_in_latest:
            empty = column.stats.null_count == column.stats.row_count
            rules.append(
                ReviewRule(
                    id=f"exclude:{column.source_column}",
                    kind=ReviewRuleKind.EXCLUDE,
                    title=f"Exclure la colonne {column.source_column}",
                    explanation=(
                        "Colonne entièrement vide : elle n'apporte rien à la table nettoyée."
                        if empty
                        else "Colonne écartée de la table nettoyée."
                    ),
                    columns=[column.source_column],
                    confidence=ConfidenceLevel.HIGH if empty else ConfidenceLevel.MEDIUM,
                )
            )

    if plan.deduplication.enabled:
        rules.append(
            ReviewRule(
                id="deduplicate",
                kind=ReviewRuleKind.DEDUPLICATE,
                title="Supprimer les doublons exacts",
                explanation=plan.deduplication.explanation,
                columns=[],
                confidence=ConfidenceLevel.HIGH,
                affected=plan.deduplication.duplicate_rows,
            )
        )

    if plan.primary_key is not None:
        names = ", ".join(c.target_column for c in plan.key_columns())
        rules.append(
            ReviewRule(
                id="primary_key",
                kind=ReviewRuleKind.PRIMARY_KEY,
                title=f"Clé primaire : {names}",
                explanation=plan.primary_key.explanation,
                columns=list(plan.primary_key.columns),
                confidence=(
                    ConfidenceLevel.MEDIUM
                    if plan.primary_key.quasi_unique
                    else ConfidenceLevel.HIGH
                ),
            )
        )

    for rule in rules:
        rule.decision = plan.reviews.get(rule.id)
    return rules


def plan_review(plan: TransformationPlan) -> PlanReview:
    rules = review_rules(plan)
    return PlanReview(
        source_id=plan.source_id,
        plan_version=plan.version,
        status=plan.status.value,
        rules=rules,
        pending=sum(1 for r in rules if r.decision is None),
        validated=sum(1 for r in rules if r.decision == "validated"),
        rejected=sum(1 for r in rules if r.decision == "rejected"),
    )


def rejection_patch(plan: TransformationPlan) -> PlanPatch | None:
    """What undoes the rejected rules; None when nothing is rejected."""
    rules = {rule.id: rule for rule in review_rules(plan)}
    rejected = [rules[i] for i, d in plan.reviews.items() if d == "rejected" and i in rules]
    if not rejected:
        return None
    patch = PlanPatch()

    def column(name: str) -> ColumnPatch:
        return patch.columns.setdefault(name, ColumnPatch())

    for rule in rejected:
        match rule.kind:
            case ReviewRuleKind.CAST:
                column(rule.columns[0]).target_type = SilverType.VARCHAR
            case ReviewRuleKind.NORMALIZE:
                for name in rule.columns:
                    column(name).normalization = Normalization.TRIM
            case ReviewRuleKind.FORMAT:
                kind = RuleKind(rule.id.rsplit(":", 1)[1])
                column(rule.columns[0]).rules = {kind: False}
            case ReviewRuleKind.EXCLUDE:
                column(rule.columns[0]).included = True
            case ReviewRuleKind.DEDUPLICATE:
                patch.deduplicate = False
            case ReviewRuleKind.PRIMARY_KEY:
                patch.primary_key = []
            case ReviewRuleKind.PII:  # pragma: no cover - refused when recorded
                pass
    return patch
