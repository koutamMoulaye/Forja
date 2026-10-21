"""Schema drift between two versions of a source."""

from __future__ import annotations

from forja_core.models import ColumnSchema, SchemaDrift, TypeChange
from forja_core.profiling.models import ProfileReport


def _data_columns(columns: list[ColumnSchema]) -> dict[str, str]:
    return {c.name: c.type for c in columns if not c.technical}


def _inferred_types(profile: ProfileReport | None) -> dict[str, str]:
    if profile is None:
        return {}
    return {c.name: c.inferred.inferred_type.value for c in profile.columns}


def compute_drift(
    *,
    previous_version: int,
    previous_columns: list[ColumnSchema],
    current_columns: list[ColumnSchema],
    previous_profile: ProfileReport | None,
    current_profile: ProfileReport | None,
) -> SchemaDrift:
    """Columns added, removed, or whose physical or inferred type changed."""
    before = _data_columns(previous_columns)
    after = _data_columns(current_columns)
    inferred_before = _inferred_types(previous_profile)
    inferred_after = _inferred_types(current_profile)

    changes: list[TypeChange] = []
    for name in (n for n in after if n in before):
        if before[name] != after[name]:
            changes.append(
                TypeChange(
                    column=name,
                    previous_type=before[name],
                    new_type=after[name],
                    level="physical",
                )
            )
            continue
        old, new = inferred_before.get(name), inferred_after.get(name)
        # An empty column carries no type information: becoming filled is not a drift.
        if old and new and old != new and "empty" not in (old, new):
            changes.append(
                TypeChange(column=name, previous_type=old, new_type=new, level="inferred")
            )

    return SchemaDrift(
        previous_version=previous_version,
        added=[n for n in after if n not in before],
        removed=[n for n in before if n not in after],
        type_changed=changes,
    )
