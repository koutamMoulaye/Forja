"""Deterministic, rule-based generation and editing of transformation plans.

No language model is involved: the same profile always yields the same plan.
"""

from __future__ import annotations

import json
import re
from datetime import datetime

from forja_core.config import Settings
from forja_core.errors import PlanValidationError
from forja_core.models import Source
from forja_core.profiling.models import (
    ColumnProfile,
    ConfidenceLevel,
    InferredType,
    PiiType,
    ProfileReport,
)
from forja_core.profiling.pii import column_tokens
from forja_core.profiling.types import BOOLEAN_FALSE, BOOLEAN_TRUE, ISO8601, inferred_from_physical
from forja_core.silver.explain import refresh_explanations
from forja_core.silver.plan import (
    DEFAULT_NULL_VALUES,
    CastSpec,
    ColumnPlan,
    ColumnStats,
    DeduplicationPlan,
    Normalization,
    PiiTreatment,
    PlanPatch,
    PlanStatus,
    PrimaryKeyPlan,
    RuleKind,
    SilverType,
    TransformationPlan,
    ValidityRule,
)
from forja_core.utils import strip_accents, unique_name

FORMAT_RULE_MIN_RATIO = 0.9
ACCEPTED_VALUES_MAX_RATIO = 0.2

_FREE_TEXT_TOKENS = frozenset(
    {
        "comment", "comments", "commentaire", "commentaires", "description", "desc", "note",
        "notes", "remarque", "remarques", "observation", "observations", "message", "texte",
        "text", "libelle", "label", "details", "detail",
    }
)  # fmt: skip

_TARGET_TYPES: dict[InferredType, SilverType] = {
    InferredType.INTEGER: SilverType.BIGINT,
    InferredType.DECIMAL: SilverType.DOUBLE,
    InferredType.BOOLEAN: SilverType.BOOLEAN,
    InferredType.DATE: SilverType.DATE,
    InferredType.DATETIME: SilverType.TIMESTAMP,
    InferredType.STRING: SilverType.VARCHAR,
    InferredType.OTHER: SilverType.VARCHAR,
    InferredType.EMPTY: SilverType.VARCHAR,
}
_FORMAT_RULES: dict[PiiType, RuleKind] = {
    PiiType.EMAIL: RuleKind.EMAIL_FORMAT,
    PiiType.PHONE: RuleKind.PHONE_FORMAT,
    PiiType.IBAN: RuleKind.IBAN_FORMAT,
}
_NORMALIZATIONS: dict[PiiType, Normalization] = {
    PiiType.EMAIL: Normalization.LOWERCASE,
    PiiType.IBAN: Normalization.COMPACT_UPPERCASE,
}
_SNAKE_CASE_RE = re.compile(r"[a-z][a-z0-9_]*")


def to_snake_case(name: str) -> str:
    value = strip_accents(name).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    if not value:
        return "column"
    return f"c_{value}" if value[0].isdigit() else value


def natural_type(column: ColumnPlan) -> SilverType:
    """Type the column has without any cast."""
    if column.from_text:
        return SilverType.VARCHAR
    return _TARGET_TYPES[inferred_from_physical(column.source_type)]


def needs_cast(column: ColumnPlan) -> bool:
    return column.target_type is not natural_type(column)


def _stats(column: ColumnProfile, row_count: int) -> ColumnStats:
    non_null = row_count - column.null_count
    typed = column.inferred.from_text and column.inferred.inferred_type not in (
        InferredType.STRING,
        InferredType.EMPTY,
        InferredType.OTHER,
    )
    invalid = round((1 - column.inferred.match_ratio) * non_null) if typed else 0
    return ColumnStats(
        row_count=row_count,
        null_count=column.null_count,
        null_pct=column.null_pct,
        distinct_count=column.distinct_count,
        invalid_count=invalid,
        match_ratio=column.inferred.match_ratio,
    )


def _boolean_values(column: ColumnProfile) -> tuple[list[str], list[str]]:
    seen = sorted({v.value.strip().lower() for v in column.top_values})
    trues = [v for v in seen if v in BOOLEAN_TRUE] or sorted(BOOLEAN_TRUE)
    falses = [v for v in seen if v in BOOLEAN_FALSE] or sorted(BOOLEAN_FALSE)
    return trues, falses


def _cast_spec(column: ColumnProfile, target: SilverType) -> CastSpec:
    inferred = column.inferred
    # Null markers such as "N/A" only make sense where a value is parsed: in a text
    # column, "NA" may well be data (the country code of Namibia).
    if not inferred.from_text or target is SilverType.VARCHAR:
        return CastSpec(null_values=[])
    spec = CastSpec()
    if target in (SilverType.DATE, SilverType.TIMESTAMP):
        spec.date_format = inferred.format
    elif target is SilverType.DOUBLE:
        spec.decimal_separator = inferred.decimal_separator or "."
    elif target is SilverType.BOOLEAN:
        spec.true_values, spec.false_values = _boolean_values(column)
    return spec


def _accepted_values(
    column: ColumnProfile,
    row_count: int,
    target: SilverType,
    normalization: Normalization,
    settings: Settings,
) -> list[str] | None:
    """Closed list of values for code-like columns, checked by a dbt test (warning)."""
    if target is not SilverType.VARCHAR or column.pii is not None:
        return None
    distinct = column.distinct_count
    known = len(column.top_values)
    if not 1 <= distinct <= settings.accepted_values_max or distinct != known:
        return None
    non_null = row_count - column.null_count
    if column.is_unique or non_null == 0 or distinct / non_null > ACCEPTED_VALUES_MAX_RATIO:
        return None
    _, tokens = column_tokens(column.name)
    if tokens & _FREE_TEXT_TOKENS:
        return None
    values = {v.value.strip() for v in column.top_values}
    if normalization is Normalization.LOWERCASE:
        values = {v.lower() for v in values}
    elif normalization is Normalization.COLLAPSE_WHITESPACE:
        values = {" ".join(v.split()) for v in values}
    return sorted(values)


def _default_column(
    column: ColumnProfile, row_count: int, target_name: str, settings: Settings
) -> ColumnPlan:
    inferred = column.inferred
    target = (
        _TARGET_TYPES[inferred.inferred_type]
        if inferred.from_text
        else _TARGET_TYPES[inferred_from_physical(column.physical_type)]
    )
    pii = column.pii
    normalization = Normalization.NONE
    if inferred.from_text and target is SilverType.VARCHAR:
        normalization = (
            _NORMALIZATIONS.get(pii.pii_type, Normalization.COLLAPSE_WHITESPACE)
            if pii is not None
            else Normalization.COLLAPSE_WHITESPACE
        )

    plan_column = ColumnPlan(
        source_column=column.name,
        target_column=target_name,
        included=inferred.inferred_type is not InferredType.EMPTY,
        source_type=column.physical_type,
        from_text=inferred.from_text,
        inferred_type=inferred.inferred_type,
        target_type=target,
        cast=_cast_spec(column, target),
        normalization=normalization,
        pii_type=pii.pii_type if pii else None,
        pii_level=pii.level if pii else None,
        accepted_values=_accepted_values(column, row_count, target, normalization, settings),
        stats=_stats(column, row_count),
    )
    if pii is not None and pii.level in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM):
        plan_column.pii_treatment = PiiTreatment(settings.pii_default_treatment)
    if needs_cast(plan_column):
        plan_column.rules.append(ValidityRule(kind=RuleKind.CASTABLE))
    if pii is not None and pii.pii_type in _FORMAT_RULES:
        plan_column.rules.append(
            ValidityRule(
                kind=_FORMAT_RULES[pii.pii_type],
                enabled=pii.match_ratio >= FORMAT_RULE_MIN_RATIO,
            )
        )
    return plan_column


def _key_rank(column: ColumnPlan, position: int) -> tuple[int, int, int]:
    name = column.target_column
    if name == "id":
        name_rank = 0
    elif name.endswith("_id") or name.startswith("id_"):
        name_rank = 1
    elif any(token in name for token in ("code", "ref", "num", "key", "cle")):
        name_rank = 2
    else:
        name_rank = 3
    type_rank = 0 if column.target_type is SilverType.BIGINT else 1
    return name_rank, type_rank, position


def choose_primary_key(profile: ProfileReport, columns: list[ColumnPlan]) -> PrimaryKeyPlan | None:
    by_name = {c.source_column: c for c in columns}
    position = {c.source_column: i for i, c in enumerate(columns)}

    def usable(names: list[str]) -> bool:
        return all(
            name in by_name and by_name[name].included and by_name[name].pii_type is None
            for name in names
        )

    simple = [
        k.columns[0] for k in profile.candidate_keys if k.kind == "simple" and usable(k.columns)
    ]
    if simple:
        best = min(simple, key=lambda name: _key_rank(by_name[name], position[name]))
        return PrimaryKeyPlan(columns=[best])
    for key in profile.candidate_keys:
        if key.kind == "composite" and usable(key.columns):
            return PrimaryKeyPlan(columns=list(key.columns))
    return None


def sync_key_rules(plan: TransformationPlan) -> None:
    """NOT_NULL rules exist exactly on primary key columns."""
    keys = set(plan.primary_key.columns) if plan.primary_key else set()
    for column in plan.columns:
        rule = column.rule(RuleKind.NOT_NULL)
        if column.source_column in keys and rule is None:
            column.rules.insert(0, ValidityRule(kind=RuleKind.NOT_NULL))
        elif column.source_column not in keys and rule is not None:
            column.rules.remove(rule)


def build_plan(
    source: Source,
    profile: ProfileReport,
    settings: Settings,
    *,
    plan_id: str,
    version: int,
    now: datetime,
) -> TransformationPlan:
    taken: set[str] = set()
    columns: list[ColumnPlan] = []
    for column in profile.columns:
        target_name = unique_name(to_snake_case(column.name), taken)
        taken.add(target_name)
        columns.append(_default_column(column, profile.row_count, target_name, settings))

    plan = TransformationPlan(
        id=plan_id,
        project_id=source.project_id,
        source_id=source.id,
        source_name=source.name,
        model_name=f"stg_{source.name}",
        version=version,
        status=PlanStatus.APPROVED if settings.auto_approve_silver else PlanStatus.DRAFT,
        based_on_source_version=profile.version or source.version,
        created_at=now,
        updated_at=now,
        columns=columns,
        deduplication=DeduplicationPlan(
            enabled=True, duplicate_rows=profile.duplicates.duplicate_rows
        ),
    )
    plan.primary_key = choose_primary_key(profile, columns)
    sync_key_rules(plan)
    return refresh_explanations(plan)


def refresh_plan(
    previous: TransformationPlan,
    source: Source,
    profile: ProfileReport,
    settings: Settings,
    *,
    plan_id: str,
    now: datetime,
) -> TransformationPlan:
    """Plan for a new source version that keeps the decisions taken on the previous plan."""
    fresh = build_plan(
        source, profile, settings, plan_id=plan_id, version=previous.version + 1, now=now
    )
    kept = {c.source_column: c for c in previous.columns}
    taken = {c.target_column for c in previous.columns}
    warnings: list[str] = []
    columns: list[ColumnPlan] = []

    for column in fresh.columns:
        old = kept.pop(column.source_column, None)
        if old is None:
            column.target_column = unique_name(column.target_column, taken)
            taken.add(column.target_column)
            columns.append(column)
            warnings.append(
                f"Nouvelle colonne « {column.source_column} » ajoutée en version "
                f"{fresh.based_on_source_version}, à vérifier."
            )
            continue
        updated = old.model_copy(deep=True)
        updated.stats = column.stats
        updated.present_in_latest = True
        if old.inferred_type is not column.inferred_type:
            warnings.append(
                f"La colonne « {column.source_column} » est désormais détectée comme "
                f"{column.inferred_type.value} (au lieu de {old.inferred_type.value}) ; "
                "la règle approuvée est conservée, les valeurs non conformes iront en quarantaine."
            )
            updated.inferred_type = column.inferred_type
            updated.stats.invalid_count = None
        columns.append(updated)

    for old in kept.values():
        missing = old.model_copy(deep=True)
        missing.present_in_latest = False
        columns.append(missing)
        warnings.append(
            f"La colonne « {old.source_column} » est absente de la version "
            f"{fresh.based_on_source_version} ; elle est conservée avec des valeurs nulles."
        )

    fresh.columns = columns
    fresh.status = PlanStatus.APPROVED if settings.auto_approve_silver else PlanStatus.DRAFT
    fresh.created_at = previous.created_at
    fresh.deduplication.enabled = previous.deduplication.enabled
    if previous.primary_key is not None and all(
        (c := fresh.column(name)) is not None and c.included
        for name in previous.primary_key.columns
    ):
        fresh.primary_key = PrimaryKeyPlan(columns=list(previous.primary_key.columns))
    fresh.warnings = warnings
    sync_key_rules(fresh)
    return refresh_explanations(fresh)


def plan_signature(plan: TransformationPlan) -> str:
    """Everything that changes the generated SQL; used to avoid empty plan versions."""
    columns = [
        c.model_dump(mode="json", exclude={"stats", "description", "explanation", "inferred_type"})
        for c in plan.columns
    ]
    for column in columns:
        column["rules"] = [{"kind": r["kind"], "enabled": r["enabled"]} for r in column["rules"]]
    payload = {
        "columns": columns,
        "primary_key": plan.primary_key.columns if plan.primary_key else None,
        "deduplication": plan.deduplication.enabled,
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)


def _apply_type_change(column: ColumnPlan, target: SilverType) -> None:
    if target is column.target_type:
        return
    column.target_type = target
    column.stats.invalid_count = None
    column.accepted_values = None
    if target in (SilverType.DATE, SilverType.TIMESTAMP):
        default = "%Y-%m-%d" if target is SilverType.DATE else ISO8601
        column.cast.date_format = column.cast.date_format or default
    if target is SilverType.DOUBLE:
        column.cast.decimal_separator = column.cast.decimal_separator or "."
    if target is SilverType.BOOLEAN and not column.cast.true_values:
        column.cast.true_values = sorted(BOOLEAN_TRUE)
        column.cast.false_values = sorted(BOOLEAN_FALSE)
    if target is not SilverType.VARCHAR:
        column.normalization = Normalization.NONE
        if column.from_text and not column.cast.null_values:
            column.cast.null_values = list(DEFAULT_NULL_VALUES)
    elif column.from_text and column.normalization is Normalization.NONE:
        column.normalization = Normalization.COLLAPSE_WHITESPACE

    castable = column.rule(RuleKind.CASTABLE)
    if needs_cast(column) and castable is None:
        column.rules.append(ValidityRule(kind=RuleKind.CASTABLE))
    elif not needs_cast(column) and castable is not None:
        column.rules.remove(castable)


def apply_patch(
    plan: TransformationPlan, patch: PlanPatch, *, plan_id: str, now: datetime
) -> TransformationPlan:
    """Return a new draft version of ``plan`` with ``patch`` applied."""
    updated = plan.model_copy(deep=True)
    updated.id = plan_id
    updated.version = plan.version + 1
    updated.status = PlanStatus.DRAFT
    updated.updated_at = now

    for name, change in patch.columns.items():
        column = updated.column(name)
        if column is None:
            raise PlanValidationError(f"unknown column '{name}'", details={"column": name})
        if change.included is not None:
            column.included = change.included
        if change.target_column is not None:
            if not _SNAKE_CASE_RE.fullmatch(change.target_column):
                raise PlanValidationError(
                    f"'{change.target_column}' is not a valid snake_case column name",
                    details={"column": name},
                )
            column.target_column = change.target_column
        if change.target_type is not None:
            _apply_type_change(column, change.target_type)
        if change.date_format is not None:
            column.cast.date_format = change.date_format
        if change.decimal_separator is not None:
            column.cast.decimal_separator = change.decimal_separator
        if change.normalization is not None:
            column.normalization = change.normalization
        if change.pii_treatment is not None:
            column.pii_treatment = change.pii_treatment
        if change.null_values is not None:
            column.cast.null_values = [v.strip().lower() for v in change.null_values]
        for kind, enabled in (change.rules or {}).items():
            rule = column.rule(kind)
            if rule is None:
                raise PlanValidationError(
                    f"rule '{kind.value}' does not apply to column '{name}'",
                    details={"column": name, "rule": kind.value},
                )
            rule.enabled = enabled

    if patch.primary_key is not None:
        if not patch.primary_key:
            updated.primary_key = None
        else:
            for name in patch.primary_key:
                key_column = updated.column(name)
                if key_column is None or not key_column.included:
                    raise PlanValidationError(
                        f"primary key column '{name}' is unknown or excluded",
                        details={"column": name},
                    )
            updated.primary_key = PrimaryKeyPlan(columns=list(patch.primary_key))
    if patch.deduplicate is not None:
        updated.deduplication.enabled = patch.deduplicate

    validate_plan(updated)
    sync_key_rules(updated)
    return refresh_explanations(updated)


def validate_plan(plan: TransformationPlan) -> None:
    included = plan.included_columns()
    if not included:
        raise PlanValidationError("a plan must keep at least one column")
    names = [c.target_column for c in included]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise PlanValidationError(
            "target column names must be unique", details={"columns": duplicates}
        )
    for column in plan.key_columns():
        if not column.included:
            raise PlanValidationError(
                f"primary key column '{column.source_column}' cannot be excluded",
                details={"column": column.source_column},
            )
        if column.pii_treatment is PiiTreatment.DROP:
            raise PlanValidationError(
                f"primary key column '{column.source_column}' cannot be dropped from exports",
                details={"column": column.source_column},
            )
