"""Rows of a source held in quarantine by the Silver build, grouped by reason.

The rejects table keeps raw values. They are read like an export: personal columns
get the treatment of the plan, or are pseudonymized for callers without access to
clear data.
"""

from __future__ import annotations

from typing import Any

import duckdb
from pydantic import BaseModel, Field

from forja_core.preview import json_safe
from forja_core.privacy import (
    TreatedColumn,
    pseudonymize_personal,
    select_sql,
    treat_batch,
)
from forja_core.silver.dbt.sql import rejects_model
from forja_core.silver.plan import PiiTreatment, TransformationPlan
from forja_core.utils import quote_ident, sql_literal

_TECHNICAL = ("_reject_reason", "_run_id", "_batch_id", "_ingested_at")


class RejectReason(BaseModel):
    reason: str
    rows: int


class QuarantineRun(BaseModel):
    run_id: str
    rows: int


class Quarantine(BaseModel):
    source_id: str
    table: str
    total_rows: int = Field(description="Rows in quarantine (for the run asked, if any)")
    reasons: list[RejectReason] = Field(description="A row failing two rules counts twice")
    runs: list[QuarantineRun] = Field(description="Runs that quarantined rows, latest first")
    columns: list[str]
    rows: list[dict[str, Any]]
    limit: int


def _treated(plan: TransformationPlan, available: list[str], strict: bool) -> list[TreatedColumn]:
    by_target = {c.target_column: c for c in plan.columns}
    columns: list[TreatedColumn] = []
    for name in available:
        if name.startswith("_"):
            continue
        planned = by_target.get(name)
        if planned is None:
            columns.append(TreatedColumn(name))
        elif planned.pii_treatment is not PiiTreatment.DROP:
            columns.append(TreatedColumn(name, planned.pii_treatment, planned.pii_type))
    return pseudonymize_personal(columns) if strict else columns


def read_quarantine(
    con: duckdb.DuckDBPyConnection,
    plan: TransformationPlan,
    salt: bytes,
    *,
    limit: int,
    strict: bool,
    run_id: str | None = None,
) -> Quarantine:
    """``con`` has the project warehouse attached as ``wh``."""
    table = rejects_model(plan)
    empty = Quarantine(
        source_id=plan.source_id,
        table=table,
        total_rows=0,
        reasons=[],
        runs=[],
        columns=[],
        rows=[],
        limit=limit,
    )
    exists = con.execute(
        "SELECT count(*) FROM duckdb_tables() WHERE database_name = 'wh' AND table_name = ?",
        [table],
    ).fetchall()[0][0]
    if not exists:
        return empty
    relation = f"wh.main.{quote_ident(table)}"
    where = f" WHERE _run_id = {sql_literal(run_id)}" if run_id else ""
    [(total,)] = con.execute(f"SELECT count(*) FROM {relation}{where}").fetchall()
    reasons = [
        RejectReason(reason=str(r[0]), rows=int(r[1]))
        for r in con.execute(
            "SELECT trim(reason), count(*) FROM ("
            f"  SELECT unnest(string_split(_reject_reason, '; ')) AS reason FROM {relation}{where}"
            ") GROUP BY 1 ORDER BY 2 DESC, 1"
        ).fetchall()
    ]
    runs = [
        QuarantineRun(run_id=str(r[0]), rows=int(r[1]))
        for r in con.execute(
            f"SELECT _run_id, count(*) FROM {relation} GROUP BY 1 ORDER BY max(_ingested_at) DESC"
        ).fetchall()
    ]
    available = [str(r[0]) for r in con.execute(f"DESCRIBE {relation}").fetchall()]
    columns = _treated(plan, available, strict)
    latest = (
        f"(SELECT * FROM {relation}{where} ORDER BY _ingested_at DESC, _row_hash "
        f"LIMIT {int(limit)})"
    )
    treated = [*columns, *(TreatedColumn(name) for name in _TECHNICAL[:2])]
    rows: list[dict[str, Any]] = []
    with con.cursor() as cursor:
        reader = cursor.sql(select_sql(treated, latest)).to_arrow_reader(max(1, limit))
        for batch in reader:
            for row in treat_batch(batch, treated, salt).to_pylist():
                rows.append({k: json_safe(v) for k, v in row.items()})
    return Quarantine(
        source_id=plan.source_id,
        table=table,
        total_rows=int(total),
        reasons=reasons,
        runs=runs,
        columns=[c.name for c in treated],
        rows=rows,
        limit=limit,
    )
