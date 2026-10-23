"""Verification preview of a compiled data mart, computed on the warehouse.

- row count and a sample, personal data pseudonymized according to the role;
- reconciliation: for each additive metric, the total of the mart against the total
  of the fact on the same scope (same filters and period); a gap means rows were
  multiplied or lost;
- share of fact rows attached to an unknown member of a dimension used;
- columns that are entirely or partly empty;
- a warning when the period holds no data, with the period the data covers.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import duckdb

from forja_core.agent.compile import CompiledMart
from forja_core.agent.models import Control, MartPreview
from forja_core.agent.spec import MartSpec
from forja_core.gold.plan import UNKNOWN_KEY
from forja_core.preview import json_safe
from forja_core.privacy import mask, pseudonymize
from forja_core.semantic.models import Additivity, MetricAggregation, SemanticLayer
from forja_core.silver.plan import PiiTreatment
from forja_core.utils import quote_ident

_TOLERANCE = 1e-6


def _number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def build_preview(
    con: duckdb.DuckDBPyConnection,
    compiled: CompiledMart,
    spec: MartSpec,
    layer: SemanticLayer,
    *,
    sample_rows: int,
    salt: bytes,
    treatments: dict[str, PiiTreatment],
    data_range: tuple[date, date] | None,
) -> MartPreview:
    """``treatments``: by column name, how personal columns are shown to this reader."""
    [(row_count,)] = con.execute(f"select count(*) from ({compiled.sql})").fetchall()
    cursor = con.execute(f"select * from ({compiled.sql}) limit {int(sample_rows)}")
    names = [d[0] for d in cursor.description or []]
    raw_rows = cursor.fetchall()
    pii = {c.name: c.pii for c in compiled.columns if c.pii}
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        row: dict[str, Any] = {}
        for name, value in zip(names, raw, strict=True):
            if name in pii and value is not None:
                treatment = treatments.get(name, PiiTreatment.HASH)
                if treatment is PiiTreatment.MASK:
                    value = mask(str(value), pii[name])
                elif treatment is not PiiTreatment.NONE:
                    value = pseudonymize(str(value), salt)
            row[name] = json_safe(value)
        rows.append(row)

    controls = _reconciliation(con, compiled, spec, layer)
    controls += _unknown_members(con, compiled, layer)
    controls += _empty_columns(con, compiled)
    if int(row_count) == 0:
        if spec.period is not None:
            covered = (
                f" Les données couvrent du {data_range[0]:%d/%m/%Y} au {data_range[1]:%d/%m/%Y}."
                if data_range
                else ""
            )
            controls.append(
                Control(
                    code="empty_period",
                    status="warning",
                    message=f"Aucune donnée sur la période demandée ({spec.period.label or ''})."
                    + covered,
                    details={
                        "data_start": data_range[0].isoformat() if data_range else None,
                        "data_end": data_range[1].isoformat() if data_range else None,
                    },
                )
            )
        else:
            controls.append(
                Control(code="empty", status="warning", message="Le data mart est vide.")
            )
    return MartPreview(
        row_count=int(row_count),
        columns=compiled.columns,
        rows=rows,
        pseudonymized=[
            n for n in pii if treatments.get(n, PiiTreatment.HASH) is not PiiTreatment.NONE
        ],
        controls=controls,
    )


def _reconciliation(
    con: duckdb.DuckDBPyConnection, compiled: CompiledMart, spec: MartSpec, layer: SemanticLayer
) -> list[Control]:
    controls = []
    for column in compiled.columns:
        if column.kind != "metric":
            continue
        metric = layer.metric(column.ref.partition(":")[2])
        if metric is None:
            continue
        if metric.additivity is not Additivity.ADDITIVE or metric.aggregation not in (
            MetricAggregation.SUM,
            MetricAggregation.COUNT,
        ):
            controls.append(
                Control(
                    code="reconciliation",
                    status="info",
                    message=f"{metric.label} n'est pas additive ({metric.formula}) : son total "
                    "ne se compare pas ligne à ligne, il est recalculé à chaque niveau.",
                    details={"metric": metric.name},
                )
            )
            continue
        assert metric.column is not None
        aggregate = "sum" if metric.aggregation is MetricAggregation.SUM else "count"
        [(mart_total,)] = con.execute(
            f"select sum({quote_ident(column.name)}) from ({compiled.unlimited_sql})"
        ).fetchall()
        [(fact_total,)] = con.execute(
            f"select {aggregate}(f.{quote_ident(metric.column)}) from ({compiled.base_sql}) as f"
        ).fetchall()
        mart_value, fact_value = _number(mart_total), _number(fact_total)
        gap = abs(mart_value - fact_value)
        ok = gap <= _TOLERANCE * max(1.0, abs(fact_value))
        controls.append(
            Control(
                code="reconciliation",
                status="ok" if ok else "error",
                message=(
                    f"{metric.label} : total du data mart {mart_value:,.2f} = total du fait "
                    f"{compiled.fact} sur le même périmètre."
                    if ok
                    else f"{metric.label} : total du data mart {mart_value:,.2f} différent du "
                    f"total du fait {fact_value:,.2f} (écart {gap:,.2f})."
                ).replace(",", " "),
                details={"metric": metric.name, "mart_total": mart_value, "fact_total": fact_value},
            )
        )
        if spec.limit:
            controls[-1].details["note"] = "total calculé avant la limite de lignes"
    return controls


def _unknown_members(
    con: duckdb.DuckDBPyConnection, compiled: CompiledMart, layer: SemanticLayer
) -> list[Control]:
    controls: list[Control] = []
    [(scope,)] = con.execute(f"select count(*) from ({compiled.base_sql})").fetchall()
    if not scope:
        return controls
    used = {
        r.split(":")[1].split(".")[0]
        for r in (c.ref for c in compiled.columns)
        if r.startswith(("attribute:", "time:"))
    }
    for dim in layer.dimensions:
        if dim.name not in used or dim.fact != compiled.fact or dim.fact_key is None:
            continue
        unknown = "-1" if dim.kind == "time" else f"'{UNKNOWN_KEY}'"
        [(count,)] = con.execute(
            f"select count(*) from ({compiled.base_sql}) as f "
            f"where f.{quote_ident(dim.fact_key)} = {unknown}"
        ).fetchall()
        share = int(count) / int(scope)
        controls.append(
            Control(
                code="unknown_member",
                status="warning" if count else "ok",
                message=(
                    f"{count} ligne(s) du fait sur {scope} ({share:.1%}) rattachée(s) au "
                    f"membre inconnu de {dim.label.lower()} : elles apparaissent sous "
                    "« Inconnu » ou une valeur vide."
                    if count
                    else f"Toutes les lignes sont rattachées à un membre de {dim.label.lower()}."
                ),
                details={"dimension": dim.name, "rows": int(count), "share": round(share, 4)},
            )
        )
    return controls


def _empty_columns(con: duckdb.DuckDBPyConnection, compiled: CompiledMart) -> list[Control]:
    names = [c.name for c in compiled.columns]
    counts = ", ".join(f"count({quote_ident(n)})" for n in names)
    [row] = con.execute(f"select count(*), {counts} from ({compiled.sql})").fetchall()
    total, filled = int(row[0]), [int(v) for v in row[1:]]
    controls: list[Control] = []
    if not total:
        return controls
    for name, count in zip(names, filled, strict=True):
        if count == 0:
            controls.append(
                Control(
                    code="null_column",
                    status="warning",
                    message=f"La colonne {name} est entièrement vide.",
                    details={"column": name},
                )
            )
        elif count < total:
            controls.append(
                Control(
                    code="null_column",
                    status="info",
                    message=f"La colonne {name} est vide sur {total - count} ligne(s) sur {total}.",
                    details={"column": name, "nulls": total - count},
                )
            )
    if not controls:
        controls.append(Control(code="null_column", status="ok", message="Aucune colonne vide."))
    return controls
