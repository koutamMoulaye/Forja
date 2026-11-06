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
from forja_core.profiling.naming import is_identifier_name, is_period_name


class KeyRole(IntEnum):
    """Lower is a better key part."""

    IDENTIFIER = 0
    PERIOD = 1
    TEXT = 2
    OTHER = 3
    MEASURE = 6


_NUMBERS = frozenset({InferredType.INTEGER, InferredType.DECIMAL})
_TIMES = frozenset({InferredType.DATE, InferredType.DATETIME})


def key_role(column: ColumnProfile) -> KeyRole:
    if is_identifier_name(column.name):
        return KeyRole.IDENTIFIER
    if column.inferred.inferred_type in _TIMES or is_period_name(column.name):
        return KeyRole.PERIOD
    if column.inferred.inferred_type is InferredType.STRING:
        return KeyRole.TEXT
    if column.inferred.inferred_type in _NUMBERS:
        return KeyRole.MEASURE
    return KeyRole.OTHER


def is_entity_period(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> bool:
    """An identifier and a period: one row per entity and period."""
    roles = sorted(key_role(by_name[c]) for c in columns if c in by_name)
    return roles == [KeyRole.IDENTIFIER, KeyRole.PERIOD]


def key_rank(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> tuple[int, int]:
    """Order of preference of a candidate key: identifiers first (an order and its line
    number), then an entity with its period (a museum and its year), measures last."""
    roles = [key_role(by_name[c]) for c in columns if c in by_name]
    return (sum(roles), 0 if is_entity_period(columns, by_name) else 1)


def is_measure_key(columns: Sequence[str], by_name: Mapping[str, ColumnProfile]) -> bool:
    """A key made of numbers that are no identifier nor period: unique by chance."""
    return any(key_role(by_name[c]) is KeyRole.MEASURE for c in columns if c in by_name)
