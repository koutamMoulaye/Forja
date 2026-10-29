"""Before and after values of a plan's columns, on a sample of the latest Bronze version.

The review screen shows what each rule does to real values. The plan's own SQL
expressions (those of the dbt models) are applied to a reproducible sample, so the
preview cannot drift from the build. Personal values are never returned in clear:
an engineer sees them partially masked (in clear only with
FORJA_ALLOW_BRONZE_PREVIEW), other roles pseudonymized; the "after" side shows the
treatment applied when the data leaves Forja.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from forja_core import duck
from forja_core.privacy import mask, pseudonymize
from forja_core.silver.dbt.sql import cleaned_expression, ident, raw_name, typed_expression
from forja_core.silver.plan import ColumnPlan, PiiTreatment, TransformationPlan
from forja_core.utils import sql_literal

SAMPLE_ROWS = 5000
VALUES_PER_COLUMN = 3


class SampleValue(BaseModel):
    before: str | None
    after: str | None
    invalid: bool = Field(description="The value does not convert: quarantine, or empty")
    count: int = Field(description="Rows of the sample with this value")


class ColumnSamples(BaseModel):
    column: str
    target_column: str
    values: list[SampleValue]
    personal: bool = False
    treatment: PiiTreatment = PiiTreatment.NONE


class PlanSamples(BaseModel):
    source_id: str
    plan_version: int
    sample_rows: int
    columns: list[ColumnSamples]


def _query(column: ColumnPlan) -> str:
    raw = ident(raw_name(column))
    return (
        "WITH cleaned AS ("
        f"  SELECT CAST({ident(column.source_column)} AS VARCHAR) AS before, "
        f"  {cleaned_expression(column)} AS {raw} FROM sample"
        "), typed AS ("
        f"  SELECT before, {raw}, {typed_expression(column)} AS typed FROM cleaned"
        "), pairs AS ("
        "  SELECT before, CAST(typed AS VARCHAR) AS after, "
        f"  ({raw} IS NOT NULL AND typed IS NULL) AS invalid FROM typed WHERE before IS NOT NULL"
        ") "
        "SELECT before, after, invalid, count(*) AS n FROM pairs GROUP BY before, after, invalid "
        "ORDER BY invalid DESC, (before IS DISTINCT FROM after) DESC, n DESC, before LIMIT 12"
    )


def _pick(rows: list[tuple[str | None, str | None, bool, int]]) -> list[SampleValue]:
    """Up to three values: one that fails, then the most frequent changes, then the rest."""
    invalid = [r for r in rows if r[2]][:1]
    changed = [r for r in rows if not r[2] and r[0] != r[1]]
    same = [r for r in rows if not r[2] and r[0] == r[1]]
    chosen = (invalid + changed + same)[:VALUES_PER_COLUMN]
    return [SampleValue(before=r[0], after=r[1], invalid=r[2], count=r[3]) for r in chosen]


def _treat(
    value: SampleValue, column: ColumnPlan, salt: bytes, *, unmasked: bool, clear: bool
) -> SampleValue:
    kind = None if column.pii_type is None else column.pii_type.value
    before = value.before
    if not clear:
        before = mask(before, kind) if unmasked else pseudonymize(before, salt)
    match column.pii_treatment:
        case PiiTreatment.HASH:
            after = pseudonymize(value.after, salt)
        case PiiTreatment.MASK:
            after = mask(value.after, kind)
        case PiiTreatment.DROP:
            after = None
        case PiiTreatment.NONE:
            after = value.after if unmasked else pseudonymize(value.after, salt)
    return value.model_copy(update={"before": before, "after": after})


def plan_samples(
    plan: TransformationPlan,
    bronze: Path,
    salt: bytes,
    *,
    unmasked: bool,
    clear_personal: bool = False,
) -> PlanSamples:
    """Sample values of every included column present in the latest version."""
    columns: list[ColumnSamples] = []
    with duck.connect() as con:
        con.execute(
            "CREATE TEMP TABLE sample AS SELECT * FROM read_parquet("
            f"{sql_literal(str(bronze))}) USING SAMPLE reservoir({SAMPLE_ROWS} ROWS) "
            "REPEATABLE (42)"
        )
        [(rows,)] = con.execute("SELECT count(*) FROM sample").fetchall()
        present = {str(r[0]) for r in con.execute("DESCRIBE sample").fetchall()}
        for column in plan.included_columns():
            if column.source_column not in present:
                continue
            values = _pick(con.execute(_query(column)).fetchall())
            personal = column.pii_type is not None
            if personal:
                values = [
                    _treat(v, column, salt, unmasked=unmasked, clear=unmasked and clear_personal)
                    for v in values
                ]
            columns.append(
                ColumnSamples(
                    column=column.source_column,
                    target_column=column.target_column,
                    values=values,
                    personal=personal,
                    treatment=column.pii_treatment,
                )
            )
    return PlanSamples(
        source_id=plan.source_id, plan_version=plan.version, sample_rows=int(rows), columns=columns
    )
