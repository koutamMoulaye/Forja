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


_TIME_WORDS = PERIOD_TOKENS | {"timestamp", "ts", "at", "on", "time", "heure", "datetime", "dt"}
# What a date is the date of, from the words of its name (English or French), with its
# place in the life of a record: 0 the event itself (a purchase, a creation), 1 a step
# after it (a validation, a delivery), 2 a planned or limit date (estimated, due).
# The first phrase whose words are all in the name wins.
_ROLES: tuple[tuple[frozenset[str], str, int], ...] = (
    (frozenset({"estimated", "delivery"}), "livraison estimée", 2),
    (frozenset({"estimee", "livraison"}), "livraison estimée", 2),
    (frozenset({"delivered", "carrier"}), "remise transporteur", 1),
    (frozenset({"shipping", "limit"}), "limite d'expédition", 2),
    (frozenset({"delivered"}), "livraison", 1),
    (frozenset({"delivery"}), "livraison", 1),
    (frozenset({"livraison"}), "livraison", 1),
    (frozenset({"purchase"}), "achat", 0),
    (frozenset({"achat"}), "achat", 0),
    (frozenset({"approved"}), "validation", 1),
    (frozenset({"approval"}), "validation", 1),
    (frozenset({"validation"}), "validation", 1),
    (frozenset({"creation"}), "création", 0),
    (frozenset({"created"}), "création", 0),
    (frozenset({"answer"}), "réponse", 1),
    (frozenset({"reponse"}), "réponse", 1),
    (frozenset({"shipped"}), "expédition", 1),
    (frozenset({"payment"}), "paiement", 1),
    (frozenset({"paiement"}), "paiement", 1),
    (frozenset({"estimated"}), "estimée", 2),
    (frozenset({"expected"}), "prévue", 2),
    (frozenset({"prevue"}), "prévue", 2),
    (frozenset({"due"}), "échéance", 2),
    (frozenset({"echeance"}), "échéance", 2),
    (frozenset({"deadline"}), "échéance", 2),
    (frozenset({"limit"}), "limite", 2),
    (frozenset({"limite"}), "limite", 2),
)
# Words naming the record rather than the step (« order » in order_purchase_timestamp).
_RECORD_WORDS = frozenset(
    {"order", "orders", "commande", "review", "avis", "item", "ligne", "sale", "vente"}
)


def role_words(column: str) -> list[str]:
    """What a date is the date of: ``dateappellation`` → appellation, ``annee`` → none."""
    return [w for w in name_words(column) if w not in _TIME_WORDS and not w.isdigit()]


def date_role(column: str) -> tuple[str, int]:
    """The business role of a date column in French and its place in the life of the
    record: ``order_purchase_timestamp`` → (« achat », 0), ``order_estimated_delivery_date``
    → (« livraison estimée », 2), ``dateappellation`` → (« appellation », 1)."""
    words = set(name_words(column))
    for needed, label, stage in _ROLES:
        if needed <= words:
            return label, stage
    words_of_role = role_words(column)
    # « order » in order_status_date names the record, not the step; alone
    # (date_commande) it is the step.
    rest = [w for w in words_of_role if w not in _RECORD_WORDS] or words_of_role
    return " ".join(rest), 1


def complete_dates(fact: Fact, source: SilverSource | None, process: str) -> Fact:
    """A proposed fact (by a language model, say) with its main date and the roles of
    its dates filled in: what the proposal left out is decided as the heuristic does."""
    if not fact.date_keys:
        return fact
    keys = [k.model_copy() for k in fact.date_keys]

    def rank(key: DateKey) -> tuple[int, int, int, float]:
        fill = source.fill_rate(key.column) if source and key.source == source.name else 1.0
        return (
            0 if key.column in fact.grain else 1,
            0 if fill >= MAIN_DATE_MIN_FILL else 1,
            date_role(key.column)[1],
            -fill,
        )

    best = min(keys, key=rank)
    chosen = next((k for k in keys if k.name == fact.primary_date), None)
    # The main date is part of the grain and well filled: a proposal choosing a sparse
    # secondary date (a date of appellation filled for a third of the rows) is corrected.
    sound = chosen is not None and rank(chosen)[:2] <= rank(best)[:2]
    primary = chosen.name if sound and chosen is not None else best.name
    for key in keys:
        if not key.role:
            role = date_role(key.column)[0]
            key.role = role or (process if key.name == primary else "")
    keys.sort(key=lambda k: k.name != primary)
    return fact.model_copy(update={"date_keys": keys, "primary_date": primary})


def date_keys(
    source: SilverSource, columns: list[str], grain: list[str], process: str
) -> list[DateKey]:
    """Date keys of these columns, the main date first, each with its role."""
    return rank_dates([(source, columns)], grain, process)


def rank_dates(
    tables: list[tuple[SilverSource, list[str]]], grain: list[str], process: str
) -> list[DateKey]:
    """Date keys of the columns of a fact and of the tables joined to it, the main date
    first: part of the grain, then well filled, then the event itself before the later
    steps and the planned dates (a purchase before a delivery, an estimated delivery
    last), then the fact's own table before a joined one, then the most filled."""
    found: list[tuple[tuple[int, int, int, int, float], DateKey]] = []
    for position, (source, columns) in enumerate(tables):
        for column in columns:
            level = period_grain(source, column)
            if level is None:
                continue
            fill = source.fill_rate(column)
            role, stage = date_role(column)
            rank = (
                0 if position == 0 and column in grain else 1,
                0 if fill >= MAIN_DATE_MIN_FILL else 1,
                stage,
                position,
                -fill,
            )
            key = DateKey(
                name=f"{column}_key", source=source.name, column=column, grain=level, role=role
            )
            found.append((rank, key))
    found.sort(key=lambda item: item[0])
    keys = [key for _, key in found]
    for index, key in enumerate(keys):
        if not key.role:
            key.role = process if index == 0 else key.column
    return keys
