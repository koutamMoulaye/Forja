"""The grain a table is kept at: which columns identify one row.

A row of an export is often one entity for one period (a museum for a year, a store
for a month): the key is the entity identifier with the period column, never two
measures that happen to be unique together (``total`` and ``payant``). Candidate keys
are ranked by the role of their columns, read from their names and types.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from enum import IntEnum

from forja_core.profiling.models import ColumnProfile, InferredType
from forja_core.profiling.naming import is_identifier_name, is_period_name, is_sequence_name


class KeyRole(IntEnum):
    """Lower is a better key part."""

    IDENTIFIER = 0
    SEQUENCE = 1
    """A rank within a parent (a line number, the n-th payment of an order): with the
    parent identifier it makes a key, it is never a measure."""
    PERIOD = 2
    TEXT = 3
    OTHER = 4
    MEASURE = 8


_NUMBERS = frozenset({InferredType.INTEGER, InferredType.DECIMAL})
_TIMES = frozenset({InferredType.DATE, InferredType.DATETIME})


# A rank counts from 0 or 1 without gaps, and stays small.
_RANK_MAX = 999


def _is_rank(column: ColumnProfile) -> bool:
    """Integers 1, 2, 3... (or from 0) without a gap: the rank of a row in its parent."""
    if column.inferred.inferred_type is not InferredType.INTEGER or column.null_count:
        return False
    try:
        low, high = int(float(str(column.min))), int(float(str(column.max)))
    except (TypeError, ValueError):
        return False
    return low in (0, 1) and 1 < high <= _RANK_MAX and column.distinct_count == high - low + 1


def key_role(column: ColumnProfile) -> KeyRole:
    if is_identifier_name(column.name):
        return KeyRole.IDENTIFIER
    if column.inferred.inferred_type is InferredType.INTEGER and is_sequence_name(column.name):
        return KeyRole.SEQUENCE
    if column.inferred.inferred_type in _TIMES or is_period_name(column.name):
        return KeyRole.PERIOD
    if column.inferred.inferred_type is InferredType.STRING:
        return KeyRole.TEXT
    if _is_rank(column):
        return KeyRole.SEQUENCE
    if column.inferred.inferred_type in _NUMBERS:
        return KeyRole.MEASURE
    return KeyRole.OTHER


def is_entity_period(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> bool:
    """An identifier and a period: one row per entity and period."""
    roles = sorted(key_role(by_name[c]) for c in columns if c in by_name)
    return roles == [KeyRole.IDENTIFIER, KeyRole.PERIOD]


def key_rank(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> tuple[int, int, int]:
    """Order of preference of a candidate key: identifiers first (an order and its line
    number, an order and the rank of its payment), then an entity with its period (a
    museum and its year), measures last. Between two keys of identifiers, the one with a
    rank (an order and its line number rather than an order and its product, which a
    line may repeat)."""
    profiles = [by_name[c] for c in columns if c in by_name]
    roles = [key_role(p) for p in profiles]
    ranks = sum(1 for p in profiles if _is_rank(p) or is_sequence_name(p.name))
    return (sum(roles), 0 if is_entity_period(columns, by_name) else 1, -ranks)


def is_measure_key(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> bool:
    """A key made of numbers that are no identifier nor period: unique by chance."""
    return any(key_role(by_name[c]) is KeyRole.MEASURE for c in columns if c in by_name)
