"""Type inference for text columns and the matching DuckDB cast expressions.

Values are passed as ``(value, count)`` pairs so ratios are weighted by row count.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from forja_core.profiling.models import InferredType, TypeInference
from forja_core.utils import sql_literal

ValueCounts = Sequence[tuple[str, int]]
DecimalSeparator = Literal[",", "."]

BOOLEAN_TRUE = frozenset({"true", "vrai", "oui", "yes", "y", "t"})
BOOLEAN_FALSE = frozenset({"false", "faux", "non", "no", "n", "f"})

DATE_FORMATS: tuple[str, ...] = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%Y/%m/%d",
    "%d/%m/%y",
)
DATETIME_FORMATS: tuple[str, ...] = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
)
ISO8601 = "iso8601"
KNOWN_FORMATS = frozenset({*DATE_FORMATS, *DATETIME_FORMATS, ISO8601})

NEAR_TYPE_THRESHOLD = 0.6

_THOUSANDS_FR = " \u00a0\u202f."
_INT_RE = re.compile(r"[+-]?\d+")
_LEADING_ZERO_RE = re.compile(r"[+-]?0\d")
_NUMBER_FR_RE = re.compile(r"[+-]?(?:\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d+)(?:,\d+)?")
_NUMBER_EN_RE = re.compile(r"[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")
_SIMPLE_DECIMAL_RE = re.compile(r"[+-]?(\d+)([.,])(\d+)")


@dataclass(frozen=True, slots=True)
class _Candidate:
    inferred_type: InferredType
    ratio: float
    format: str | None = None
    decimal_separator: DecimalSeparator | None = None


def _weighted_ratio(values: ValueCounts, predicate: Callable[[str], bool], total: int) -> float:
    """Share of rows matching ``predicate``; stops early once below the near-type threshold."""
    budget = (1 - NEAR_TYPE_THRESHOLD) * total
    matched = failed = 0
    for value, count in values:
        if predicate(value):
            matched += count
        else:
            failed += count
            if failed > budget:
                break
    return matched / total


def _is_boolean(value: str) -> bool:
    lowered = value.lower()
    return lowered in BOOLEAN_TRUE or lowered in BOOLEAN_FALSE


def _is_integer(value: str) -> bool:
    return _INT_RE.fullmatch(value) is not None


def _is_code_like(value: str) -> bool:
    """Integers with a leading zero or an explicit plus sign are identifiers, not numbers."""
    return _is_integer(value) and (
        _LEADING_ZERO_RE.match(value) is not None or value.startswith("+")
    )


def _separator_evidence(value: str) -> DecimalSeparator | None:
    if "," in value and "." in value:
        return "," if value.rfind(",") > value.rfind(".") else "."
    if any(ch in value for ch in " \u00a0\u202f"):
        return ","
    match = _SIMPLE_DECIMAL_RE.fullmatch(value)
    if match is None:
        return None
    integer_part, separator, fraction = match.groups()
    if len(fraction) != 3 or len(integer_part) > 3:
        return "," if separator == "," else "."
    return None


def detect_decimal_separator(values: ValueCounts) -> DecimalSeparator:
    votes = {",": 0, ".": 0}
    for value, count in values:
        evidence = _separator_evidence(value)
        if evidence is not None:
            votes[evidence] += count
    if votes[","] != votes["."]:
        return "," if votes[","] > votes["."] else "."
    return "," if any("," in value for value, _ in values) else "."


def _matches_number(separator: DecimalSeparator) -> Callable[[str], bool]:
    pattern = _NUMBER_FR_RE if separator == "," else _NUMBER_EN_RE
    return lambda value: pattern.fullmatch(value) is not None


def max_fraction_digits(values: ValueCounts, separator: DecimalSeparator) -> int:
    """Most digits after the decimal separator among the values that are numbers."""
    matches = _matches_number(separator)
    digits = 0
    for value, _ in values:
        if matches(value) and separator in value:
            digits = max(digits, len(value.rsplit(separator, 1)[1]))
    return digits


def parse_number(value: str, separator: DecimalSeparator) -> float | None:
    """Parse a number written with the given decimal separator (used by tests and previews)."""
    if not _matches_number(separator)(value):
        return None
    if separator == ",":
        cleaned = value.translate({ord(ch): None for ch in _THOUSANDS_FR}).replace(",", ".")
    else:
        cleaned = value.replace(",", "")
    return float(cleaned)


def _matches_format(fmt: str) -> Callable[[str], bool]:
    def predicate(value: str) -> bool:
        if not value[:1].isdigit() or len(value) > 40:
            return False
        try:
            if fmt == ISO8601:
                datetime.fromisoformat(value)
                return "-" in value[:10]
            datetime.strptime(value, fmt)
        except ValueError:
            return False
        return True

    return predicate


def _best_format(values: ValueCounts, formats: Sequence[str], total: int) -> tuple[str, float]:
    best_fmt, best_ratio = formats[0], -1.0
    for fmt in formats:
        ratio = _weighted_ratio(values, _matches_format(fmt), total)
        if ratio > best_ratio:
            best_fmt, best_ratio = fmt, ratio
        if ratio == 1.0:
            break
    return best_fmt, best_ratio


def infer_text_type(values: ValueCounts, threshold: float = 0.95) -> TypeInference:
    """Infer the semantic type of a text column from its trimmed non-blank values."""
    total = sum(count for _, count in values)
    if total == 0:
        return TypeInference(
            inferred_type=InferredType.EMPTY, physical_type="VARCHAR", from_text=True, match_ratio=0
        )

    candidates: list[_Candidate] = []

    distinct_booleans = {v.lower() for v, _ in values if _is_boolean(v)}
    bool_ratio = _weighted_ratio(values, _is_boolean, total)
    if bool_ratio >= threshold and len(distinct_booleans) <= 2:
        return _result(_Candidate(InferredType.BOOLEAN, bool_ratio))
    candidates.append(_Candidate(InferredType.BOOLEAN, bool_ratio))

    code_like = any(_is_code_like(value) for value, _ in values)
    if not code_like:
        int_ratio = _weighted_ratio(values, _is_integer, total)
        if int_ratio >= threshold:
            return _result(_Candidate(InferredType.INTEGER, int_ratio))
        candidates.append(_Candidate(InferredType.INTEGER, int_ratio))

        separator = detect_decimal_separator(values)
        dec_ratio = _weighted_ratio(values, _matches_number(separator), total)
        decimal = _Candidate(InferredType.DECIMAL, dec_ratio, decimal_separator=separator)
        if dec_ratio >= threshold:
            result = _result(decimal)
            result.max_decimals = max_fraction_digits(values, separator)
            if separator == "," and result.max_decimals == 0:
                # Whole numbers grouped by thousands ("155 781 758"): integers, the groups
                # joined when parsed.
                return _result(_Candidate(InferredType.INTEGER, dec_ratio, decimal_separator=","))
            return result
        candidates.append(decimal)

    date_fmt, date_ratio = _best_format(values, DATE_FORMATS, total)
    if date_ratio >= threshold:
        return _result(_Candidate(InferredType.DATE, date_ratio, format=date_fmt))
    candidates.append(_Candidate(InferredType.DATE, date_ratio, format=date_fmt))

    dt_fmt, dt_ratio = _best_format(values, (*DATETIME_FORMATS, ISO8601), total)
    if dt_ratio >= threshold:
        return _result(_Candidate(InferredType.DATETIME, dt_ratio, format=dt_fmt))
    candidates.append(_Candidate(InferredType.DATETIME, dt_ratio, format=dt_fmt))

    near = max(candidates, key=lambda c: c.ratio)
    has_near = near.ratio >= NEAR_TYPE_THRESHOLD
    return TypeInference(
        inferred_type=InferredType.STRING,
        physical_type="VARCHAR",
        from_text=True,
        match_ratio=1.0,
        near_type=near.inferred_type if has_near else None,
        near_type_ratio=round(near.ratio, 4) if has_near else None,
    )


def _result(candidate: _Candidate) -> TypeInference:
    return TypeInference(
        inferred_type=candidate.inferred_type,
        physical_type="VARCHAR",
        from_text=True,
        match_ratio=round(candidate.ratio, 4),
        format=candidate.format,
        decimal_separator=candidate.decimal_separator,
    )


_INTEGER_TYPES = frozenset(
    {
        "TINYINT",
        "SMALLINT",
        "INTEGER",
        "BIGINT",
        "HUGEINT",
        "UTINYINT",
        "USMALLINT",
        "UINTEGER",
        "UBIGINT",
        "UHUGEINT",
    }
)


def inferred_from_physical(physical_type: str) -> InferredType:
    upper = physical_type.upper()
    if upper in _INTEGER_TYPES:
        return InferredType.INTEGER
    if upper in {"FLOAT", "DOUBLE", "REAL"} or upper.startswith("DECIMAL"):
        return InferredType.DECIMAL
    if upper == "BOOLEAN":
        return InferredType.BOOLEAN
    if upper == "DATE":
        return InferredType.DATE
    if upper.startswith("TIMESTAMP"):
        return InferredType.DATETIME
    if upper == "VARCHAR":
        return InferredType.STRING
    return InferredType.OTHER


def typed_expression(column_sql: str, inference: TypeInference) -> str:
    """DuckDB expression converting a column to its inferred type (NULL when not parseable)."""
    if not inference.from_text:
        return column_sql
    value = f"trim({column_sql})"
    match inference.inferred_type:
        case InferredType.INTEGER if inference.decimal_separator == ",":
            stripped = f"regexp_replace({value}, '[{_THOUSANDS_FR}]', '', 'g')"
            return f"TRY_CAST({stripped} AS BIGINT)"
        case InferredType.INTEGER:
            return f"TRY_CAST({value} AS BIGINT)"
        case InferredType.DECIMAL if inference.decimal_separator == ",":
            stripped = f"regexp_replace({value}, '[{_THOUSANDS_FR}]', '', 'g')"
            return f"TRY_CAST(replace({stripped}, ',', '.') AS DOUBLE)"
        case InferredType.DECIMAL:
            return f"TRY_CAST(replace({value}, ',', '') AS DOUBLE)"
        case InferredType.BOOLEAN:
            trues = ", ".join(sql_literal(v) for v in sorted(BOOLEAN_TRUE))
            falses = ", ".join(sql_literal(v) for v in sorted(BOOLEAN_FALSE))
            return (
                f"CASE WHEN lower({value}) IN ({trues}) THEN TRUE "
                f"WHEN lower({value}) IN ({falses}) THEN FALSE END"
            )
        case InferredType.DATE if inference.format:
            return f"CAST(try_strptime({value}, {sql_literal(inference.format)}) AS DATE)"
        case InferredType.DATETIME if inference.format == ISO8601:
            return f"TRY_CAST({value} AS TIMESTAMP)"
        case InferredType.DATETIME if inference.format:
            return f"try_strptime({value}, {sql_literal(inference.format)})"
        case _:
            return column_sql
