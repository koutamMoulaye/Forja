"""Time columns of a fact: which ones link to the date dimension, at which level, and
which one is the main date.

A date or timestamp column links at the day. An integer column named as a period
(``annee``, ``year``, ``exercice``, ``mois``, ``trimestre``) whose values are
plausible periods (2023; 202301; 20231) links at the year, month or quarter: its key
is the first day of the period. When a fact has several dates, the main one is the
one a period filters on: part of the grain first, then the most filled. Each date gets
a business role, said in labels: « Année de fréquentation », « Date d'appellation ».
"""

from __future__ import annotations

from forja_core.gold.context import SilverSource, is_integer, is_temporal
from forja_core.gold.plan import DateGrain, DateKey, Fact
from forja_core.profiling.models import ColumnProfile
from forja_core.profiling.naming import PERIOD_TOKENS, name_words, period_level

FIRST_YEAR = 1900
LAST_YEAR = 2100
# Below this share of filled rows a date cannot be the main one when another is filled.
MAIN_DATE_MIN_FILL = 0.5


def _number(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _year(value: float) -> bool:
    return FIRST_YEAR <= value <= LAST_YEAR and value == int(value)


def period_grain(source: SilverSource, column: str) -> DateGrain | None:
    """The level at which a column links to the date dimension; None when it does not."""
    return column_period(column, source.columns.get(column, ""), source.profiles.get(column))


def column_period(column: str, column_type: str, profile: ColumnProfile | None) -> DateGrain | None:
    """``day`` for a date, ``year``/``month``/``quarter`` for an integer period column
    whose values are plausible periods (read from the profile's range, never shown)."""
    if is_temporal(column_type):
        return "day"
    if not is_integer(column_type):
        return None
    level = period_level(column)
    if level is None:
        return None
    if profile is None:
        return None
    low, high = _number(profile.min), _number(profile.max)
    if low is None or high is None:
        return None
    if _year(low) and _year(high):
        return "year" if level == "year" else None
    if _year(low // 100) and _year(high // 100) and 1 <= low % 100 <= 12 and 1 <= high % 100 <= 12:
        return "month"
    if _year(low // 10) and _year(high // 10) and 1 <= low % 10 <= 4 and 1 <= high % 10 <= 4:
        return "quarter"
    return None


def date_key_sql(grain: DateGrain, column_sql: str) -> str:
    """The YYYYMMDD key of the first day of the period, or -1."""
    match grain:
        case "day":
            return f"coalesce(cast(strftime({column_sql}, '%Y%m%d') as integer), -1)"
        case "year":
            return f"coalesce(cast({column_sql} as integer) * 10000 + 101, -1)"
        case "month":
            return f"coalesce(cast({column_sql} as integer) * 100 + 1, -1)"
        case "quarter":
            value = f"cast({column_sql} as integer)"
            return f"coalesce(({value} // 10) * 10000 + (({value} % 10) * 3 - 2) * 100 + 1, -1)"


def first_day_sql(grain: DateGrain, column_sql: str) -> str:
    """The first day of the period, as a DATE (for the calendar of dim_date)."""
    match grain:
        case "day":
            return f"cast({column_sql} as date)"
        case "year":
            return f"make_date(cast({column_sql} as integer), 1, 1)"
        case "month":
            value = f"cast({column_sql} as integer)"
            return f"make_date({value} // 100, {value} % 100, 1)"
        case "quarter":
            value = f"cast({column_sql} as integer)"
            return f"make_date({value} // 10, ({value} % 10) * 3 - 2, 1)"


def role_words(column: str) -> list[str]:
    """What a date is the date of: ``dateappellation`` → appellation, ``annee`` → none."""
    return [w for w in name_words(column) if w not in PERIOD_TOKENS and not w.isdigit()]


def complete_dates(fact: Fact, source: SilverSource | None, process: str) -> Fact:
    """A proposed fact (by a language model, say) with its main date and the roles of
    its dates filled in: what the proposal left out is decided as the heuristic does."""
    if not fact.date_keys:
        return fact
    keys = [k.model_copy() for k in fact.date_keys]

    def rank(key: DateKey) -> tuple[int, int, float]:
        fill = source.fill_rate(key.column) if source and key.source == source.name else 1.0
        return (0 if key.column in fact.grain else 1, 0 if fill >= MAIN_DATE_MIN_FILL else 1, -fill)

    best = min(keys, key=rank)
    chosen = next((k for k in keys if k.name == fact.primary_date), None)
    # The main date is part of the grain and well filled: a proposal choosing a sparse
    # secondary date (a date of appellation filled for a third of the rows) is corrected.
    sound = chosen is not None and rank(chosen)[:2] <= rank(best)[:2]
    primary = chosen.name if sound and chosen is not None else best.name
    for key in keys:
        if not key.role:
            words = role_words(key.column)
            key.role = " ".join(words) if words else (process if key.name == primary else "")
    keys.sort(key=lambda k: k.name != primary)
    return fact.model_copy(update={"date_keys": keys, "primary_date": primary})


def date_keys(
    source: SilverSource, columns: list[str], grain: list[str], process: str
) -> list[DateKey]:
    """Date keys of these columns, the main date first, each with its role."""
    found: list[tuple[str, DateGrain]] = []
    for column in columns:
        level = period_grain(source, column)
        if level is not None:
            found.append((column, level))

    def rank(item: tuple[str, DateGrain]) -> tuple[int, int, float]:
        column, _ = item
        fill = source.fill_rate(column)
        return (
            0 if column in grain else 1,
            0 if fill >= MAIN_DATE_MIN_FILL else 1,
            -fill,
        )

    found.sort(key=rank)
    keys: list[DateKey] = []
    for index, (column, level) in enumerate(found):
        words = role_words(column)
        role = " ".join(words) if words else (process if index == 0 else column)
        keys.append(
            DateKey(name=f"{column}_key", source=source.name, column=column, grain=level, role=role)
        )
    return keys
