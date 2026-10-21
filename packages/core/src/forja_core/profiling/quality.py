"""Global quality score (0-100) with a transparent breakdown."""

from __future__ import annotations

from collections.abc import Sequence

from forja_core.profiling.models import (
    CandidateKey,
    ColumnProfile,
    DuplicateStats,
    InferredType,
    PiiDetection,
    QualityComponent,
    QualityScore,
)

WEIGHTS: dict[str, float] = {
    "completeness": 35.0,
    "uniqueness": 25.0,
    "validity": 25.0,
    "identifiability": 15.0,
}
COMPOSITE_KEY_SCORE = 0.7
HIGH_NULL_THRESHOLD = 0.5

FORMULA = (
    "score = 35 x completeness + 25 x uniqueness + 25 x validity + 15 x identifiability; "
    "completeness = 1 - mean null rate; uniqueness = 1 - duplicate row rate; "
    "validity = mean share of values matching each column's type; "
    f"identifiability = 1 (simple key), {COMPOSITE_KEY_SCORE} (composite key) or 0 (none)"
)


def _column_validity(column: ColumnProfile) -> float:
    inferred = column.inferred
    if inferred.inferred_type is InferredType.EMPTY:
        return 1.0
    if inferred.near_type_ratio is not None:
        return inferred.near_type_ratio
    return inferred.match_ratio


def compute_quality(
    columns: Sequence[ColumnProfile],
    duplicates: DuplicateStats,
    candidate_keys: Sequence[CandidateKey],
    pii: Sequence[PiiDetection],
) -> QualityScore:
    issues: list[str] = []

    null_rates = [c.null_pct / 100 for c in columns]
    completeness = 1 - (sum(null_rates) / len(null_rates)) if null_rates else 0.0
    for column in columns:
        if column.inferred.inferred_type is InferredType.EMPTY:
            issues.append(f"column '{column.name}' is entirely empty")
        elif column.null_pct / 100 >= HIGH_NULL_THRESHOLD:
            issues.append(f"column '{column.name}' is {column.null_pct:.1f}% null")
        if column.is_constant and column.inferred.inferred_type is not InferredType.EMPTY:
            issues.append(f"column '{column.name}' holds a single constant value")

    uniqueness = 1 - duplicates.duplicate_pct / 100
    if duplicates.duplicate_rows:
        issues.append(
            f"{duplicates.duplicate_rows} exact duplicate row(s) ({duplicates.duplicate_pct:.1f}%)"
        )

    validities = [_column_validity(c) for c in columns]
    validity = sum(validities) / len(validities) if validities else 0.0
    for column in columns:
        inferred = column.inferred
        if inferred.near_type is not None and inferred.near_type_ratio is not None:
            issues.append(
                f"column '{column.name}' looks like {inferred.near_type.value} but only "
                f"{inferred.near_type_ratio:.0%} of values match"
            )
        elif (
            inferred.from_text
            and inferred.match_ratio < 1
            and inferred.inferred_type
            not in (
                InferredType.STRING,
                InferredType.EMPTY,
            )
        ):
            issues.append(
                f"column '{column.name}' ({inferred.inferred_type.value}) has "
                f"{1 - inferred.match_ratio:.1%} of values not matching its type"
            )

    if any(k.kind == "simple" for k in candidate_keys):
        identifiability, key_details = 1.0, "a single-column key exists"
    elif candidate_keys:
        identifiability, key_details = COMPOSITE_KEY_SCORE, "only composite keys exist"
    else:
        identifiability, key_details = 0.0, "no candidate key found"
        issues.append("no candidate primary key found")

    for detection in pii:
        issues.append(
            f"column '{detection.column}' contains personal data "
            f"({detection.pii_type.value}, {detection.level.value} confidence)"
        )

    scores = {
        "completeness": (
            completeness,
            f"mean null rate {1 - completeness:.1%} over {len(columns)} column(s)",
        ),
        "uniqueness": (uniqueness, f"{duplicates.duplicate_pct:.1f}% exact duplicate rows"),
        "validity": (validity, f"mean type conformity {validity:.1%}"),
        "identifiability": (identifiability, key_details),
    }
    components = [
        QualityComponent(
            name=name,
            weight=WEIGHTS[name],
            score=round(max(0.0, min(1.0, value)), 4),
            points=round(WEIGHTS[name] * max(0.0, min(1.0, value)), 2),
            details=details,
        )
        for name, (value, details) in scores.items()
    ]
    total = round(sum(c.points for c in components), 1)
    return QualityScore(score=total, formula=FORMULA, components=components, issues=issues)
