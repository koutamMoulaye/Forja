"""Treatment of personal data in published Gold tables.

A Gold column inherits the treatment of the Silver column it comes from: a
dimension attribute may override it in the Gold plan, keys and measures are
published as they are.
"""

from __future__ import annotations

from forja_core.gold.context import GoldContext
from forja_core.gold.plan import GoldPlan
from forja_core.privacy import TreatedColumn
from forja_core.profiling.models import PiiType
from forja_core.silver.plan import PiiTreatment


def _silver(ctx: GoldContext, source: str, column: str) -> tuple[PiiTreatment, PiiType | None]:
    silver = ctx.sources.get(source)
    if silver is None:
        return PiiTreatment.NONE, None
    for plan_column in silver.plan.columns:
        if plan_column.target_column == column:
            return plan_column.pii_treatment, plan_column.pii_type
    return PiiTreatment.NONE, None


def gold_treatments(plan: GoldPlan, ctx: GoldContext) -> dict[str, dict[str, TreatedColumn]]:
    """Treated columns by Gold table name and column name (untreated columns omitted)."""
    result: dict[str, dict[str, TreatedColumn]] = {}
    for dim in plan.dimensions:
        columns: dict[str, TreatedColumn] = {}
        for key in dim.natural_key:
            treatment, pii_type = _silver(ctx, dim.source, key)
            columns[key] = TreatedColumn(key, treatment, pii_type)
        for attribute in dim.attributes:
            treatment, pii_type = _silver(ctx, dim.source, attribute.column)
            columns[attribute.name] = TreatedColumn(
                attribute.name, attribute.pii_treatment or treatment, pii_type
            )
        result[dim.name] = {
            k: v for k, v in columns.items() if v.treatment is not PiiTreatment.NONE
        }
    for fact in plan.facts:
        columns = {}
        for degenerate in fact.degenerate_dimensions:
            treatment, pii_type = _silver(ctx, degenerate.source, degenerate.column)
            if treatment is not PiiTreatment.NONE:
                columns[degenerate.name] = TreatedColumn(degenerate.name, treatment, pii_type)
        result[fact.name] = columns
    return result
