"""Verification preview of a compiled data mart, computed on the warehouse.

- row count and a sample, personal data pseudonymized according to the role;
- reconciliation: for each additive metric, the total of the mart against the total
  of the fact on the same scope (same filters and period); a gap means rows were
  multiplied or lost;
- share of fact rows attached to an unknown member of a dimension used;
- columns that are entirely or partly empty;
- a warning when the period holds no data, with the period the data covers;
- semantic coherence of the time filter: the reconciliation compares the mart with the
  fact on the same scope, so it cannot see a scope read on the wrong date. A warning
  when the date filtered on is filled on less than half of the fact rows, or when it
  keeps a small share of the rows the best-filled date of the fact gives for the same
  period.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import duckdb

from forja_core.agent.compile import CompiledMart
from forja_core.agent.insight import MAX_POINTS, MINUS, NARROW_SPACE, build_insight
from forja_core.agent.models import Control, MartPreview
from forja_core.agent.spec import MartSpec
from forja_core.gold.plan import UNKNOWN_KEY
from forja_core.preview import json_safe
from forja_core.privacy import mask, pseudonymize
from forja_core.semantic.models import Additivity, MetricAggregation, SemanticLayer
from forja_core.silver.plan import PiiTreatment
from forja_core.utils import quote_ident

_TOLERANCE = 1e-6
# Below these shares, the date read is doubtful: filled on less than half of the rows,
# or keeping less than a fifth of what the best-filled date keeps on the period.
MIN_DATE_FILL = 0.5
MIN_PERIOD_SHARE = 0.2


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
    pii = {c.name: c.pii for c in compiled.columns if c.pii}

    def shown(limit: int) -> list[dict[str, Any]]:
        """Rows as this reader may see them: personal values treated by role."""
        cursor = con.execute(f"select * from ({compiled.sql}) limit {int(limit)}")
        names = [d[0] for d in cursor.description or []]
        rows: list[dict[str, Any]] = []
        for raw in cursor.fetchall():
            row: dict[str, Any] = {}
            for name, value in zip(names, raw, strict=True):
                if name in pii and value is not None:
                    treatment = treatments.get(name, PiiTreatment.HASH)
                    if treatment is PiiTreatment.MASK:
                        value = mask(str(value), pii[name])
                    elif treatment is not PiiTreatment.NONE:
                        value = pseudonymize(str(value), salt)
                row[name] = json_safe(value) if not isinstance(value, date) else value
            rows.append(row)
        return rows

    full = shown(MAX_POINTS) if int(row_count) <= MAX_POINTS else shown(sample_rows)
    insight = build_insight(compiled.columns, full, int(row_count), spec, layer)
    rows = [{k: json_safe(v) for k, v in row.items()} for row in full[: int(sample_rows)]]

    controls = _reconciliation(con, compiled, spec, layer)
    controls += _unknown_members(con, compiled, layer)
    controls += _time_coherence(con, compiled, spec, layer)
    controls += _empty_columns(con, compiled)
    controls += _composition(con, compiled, spec, layer)
    if int(row_count) == 0:
        controls.append(_empty(spec, layer, data_range))
    return MartPreview(
        row_count=int(row_count),
        columns=compiled.columns,
        rows=rows,
        pseudonymized=[
            n for n in pii if treatments.get(n, PiiTreatment.HASH) is not PiiTreatment.NONE
        ],
        controls=controls,
        insight=insight,
    )


def _covered(data_range: tuple[date, date]) -> str:
    start, end = data_range
    if (start.month, start.day, end.month, end.day) == (1, 1, 12, 31):
        return f"de {start.year} à {end.year}" if start.year != end.year else f"en {start.year}"
    return f"du {start:%d/%m/%Y} au {end:%d/%m/%Y}"


def _empty(spec: MartSpec, layer: SemanticLayer, data_range: tuple[date, date] | None) -> Control:
    """No row: a blocking control that says why and what to try. An empty data mart is
    never published as an answer."""
    from forja_core.agent.summary import filter_text

    reasons: list[str] = []
    suggestions: list[str] = []
    outside = (
        spec.period is not None
        and data_range is not None
        and (
            (spec.period.start is not None and spec.period.start > data_range[1])
            or (spec.period.end is not None and spec.period.end < data_range[0])
        )
    )
    if spec.period is not None:
        label = spec.period.label or "la période demandée"
        if outside and data_range is not None:
            reasons.append(f"les données couvrent {_covered(data_range)}, pas {label}")
            suggestions.append(f"Choisir une période {_covered(data_range)}")
        else:
            reasons.append(f"la période {label} ne garde aucune ligne avec ces filtres")
            suggestions.append("Élargir la période")
    for item in spec.filters:
        text = filter_text(layer, item)
        reasons.append(f"le filtre « {text} » est peut-être trop restrictif")
        suggestions.append(f"Retirer le filtre « {text} »")
    if not reasons:
        reasons.append("le fait ne contient aucune ligne pour ces mesures")
        suggestions.append("Relancer le chargement des données")
    message = (
        "Aucune ligne : " + "; ".join(reasons) + ". Ce data mart ne peut pas être publié vide."
    )
    return Control(
        code="empty_period" if spec.period is not None and outside else "empty",
        status="error",
        message=message,
        details={
            "suggestions": suggestions,
            "data_start": data_range[0].isoformat() if data_range else None,
            "data_end": data_range[1].isoformat() if data_range else None,
        },
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


def _date_fill(con: duckdb.DuckDBPyConnection, fact: str, key: str) -> tuple[int, int]:
    """Fact rows with a known date on ``key``, and all fact rows."""
    [(filled, total)] = con.execute(
        f"select count(*) filter (where {quote_ident(key)} <> -1), count(*) "
        f"from {quote_ident(fact)}"
    ).fetchall()
    return int(filled), int(total)


def _rows_in_period(
    con: duckdb.DuckDBPyConnection, fact: str, key: str, start: date | None, end: date | None
) -> int:
    conditions = ["d.date_key <> -1"]
    if start is not None:
        conditions.append(f"d.date >= DATE '{start.isoformat()}'")
    if end is not None:
        conditions.append(f"d.date <= DATE '{end.isoformat()}'")
    [(count,)] = con.execute(
        f"select count(*) from {quote_ident(fact)} f join dim_date d "
        f"on d.date_key = f.{quote_ident(key)} where {' and '.join(conditions)}"
    ).fetchall()
    return int(count)


def _time_coherence(
    con: duckdb.DuckDBPyConnection, compiled: CompiledMart, spec: MartSpec, layer: SemanticLayer
) -> list[Control]:
    """Whether the date the period or the grain reads is a sound one for this fact."""
    if spec.time_dimension is None or (spec.period is None and spec.time_grain is None):
        return []
    used = layer.dimension(spec.time_dimension)
    if used is None or used.fact_key is None:
        return []
    dates = [d for d in layer.time_dimensions() if d.fact == compiled.fact and d.fact_key]
    fills = {d.name: _date_fill(con, compiled.fact, d.fact_key or "") for d in dates}
    filled, total = fills.get(used.name, (0, 0))
    if not total:
        return []
    share = filled / total
    controls: list[Control] = []
    column = f" (colonne {used.column})" if used.column else ""
    details: dict[str, object] = {
        "time_dimension": used.name,
        "column": used.column,
        "filled_share": round(share, 4),
    }
    if share < MIN_DATE_FILL:
        better = max(
            (d for d in dates if d.name != used.name),
            key=lambda d: fills[d.name][0],
            default=None,
        )
        hint = (
            f" La {better.label.lower()} est remplie sur "
            f"{fills[better.name][0] / total:.0%} des lignes."
            if better is not None and fills[better.name][0] > filled
            else ""
        )
        controls.append(
            Control(
                code="time_coherence",
                status="warning",
                message=f"Le filtre temporel s'appuie sur « {used.label} »{column}, remplie sur "
                f"{share:.0%} seulement des lignes du fait : les autres lignes sont écartées."
                + hint,
                details=details,
            )
        )
    if spec.period is not None and len(dates) > 1:
        kept = _rows_in_period(
            con, compiled.fact, used.fact_key, spec.period.start, spec.period.end
        )
        best = max(dates, key=lambda d: fills[d.name][0])
        if best.name != used.name and best.fact_key:
            reference = _rows_in_period(
                con, compiled.fact, best.fact_key, spec.period.start, spec.period.end
            )
            if reference and kept / reference < MIN_PERIOD_SHARE:
                details |= {"rows": kept, "reference_rows": reference, "reference": best.name}
                controls.append(
                    Control(
                        code="time_coherence",
                        status="warning",
                        message=f"Sur {spec.period.label or 'la période'}, « {used.label} » ne "
                        f"retient que {kept} ligne(s) du fait, contre {reference} selon "
                        f"« {best.label} » : vérifiez la date utilisée.",
                        details=details,
                    )
                )
    if not controls:
        controls.append(
            Control(
                code="time_coherence",
                status="ok",
                message=f"Période lue sur « {used.label} »{column}, remplie sur {share:.0%} des "
                "lignes du fait.",
                details=details,
            )
        )
    return controls


def _composition(
    con: duckdb.DuckDBPyConnection, compiled: CompiledMart, spec: MartSpec, layer: SemanticLayer
) -> list[Control]:
    """A total read next to its parts (or instead of them): whether the source agrees
    with itself on this scope (total = payant + gratuit), and by how much it does not."""
    asked = set(spec.metrics)
    controls: list[Control] = []
    for total in layer.metrics:
        if not total.parts or total.fact != compiled.fact or total.column is None:
            continue
        if total.name not in asked and not asked & set(total.parts):
            continue
        parts = [m for m in (layer.metric(p) for p in total.parts) if m is not None]
        columns = [m.column for m in parts if m.column is not None]
        if len(columns) != len(total.parts):
            continue
        summed = " + ".join(f"coalesce(f.{quote_ident(c)}, 0)" for c in columns)
        filled = " and ".join(f"f.{quote_ident(c)} is not null" for c in [total.column, *columns])
        gap_sql = f"f.{quote_ident(total.column)} - ({summed})"
        time_dim = layer.dimension(layer.default_time_dimension or "")
        by_year: list[tuple[Any, Any]] = []
        if time_dim is not None and time_dim.fact == compiled.fact and time_dim.fact_key:
            by_year = con.execute(
                f"select year(d.date), sum({gap_sql}) from ({compiled.base_sql}) as f "
                f"left join dim_date as d on d.date_key = f.{quote_ident(time_dim.fact_key)} "
                f"where {filled} group by 1 having sum({gap_sql}) <> 0 order by 1"
            ).fetchall()
        [(rows, gap)] = con.execute(
            f"select count(*) filter (where {gap_sql} <> 0), sum({gap_sql}) "
            f"from ({compiled.base_sql}) as f where {filled}"
        ).fetchall()
        names = " + ".join(p.label.lower() for p in parts if p)
        if not rows:
            controls.append(
                Control(
                    code="composition",
                    status="ok",
                    message=f"{total.label} = {names} sur toutes les lignes du périmètre.",
                    details={"metric": total.name, "parts": total.parts},
                )
            )
            continue
        unit = f" {total.unit}" if total.unit and total.unit != "lignes" else ""
        years = ", ".join(
            f"{int(year)} : {_signed(float(value))}{unit}" for year, value in by_year if year
        )
        controls.append(
            Control(
                code="composition",
                status="warning",
                message=f"Dans les données sources, {total.label.lower()} ≠ {names} sur "
                f"{rows} ligne(s) du périmètre : écart de {_signed(float(gap or 0))}{unit}"
                + (f" ({years})" if years else "")
                + ". Les totaux de ces mesures ne se recoupent donc pas exactement.",
                details={
                    "metric": total.name,
                    "parts": total.parts,
                    "rows": int(rows),
                    "gap": float(gap or 0),
                    "by_year": {str(int(y)): float(v) for y, v in by_year if y},
                },
            )
        )
    return controls


def _signed(value: float) -> str:
    text = f"{abs(value):,.0f}".replace(",", NARROW_SPACE)
    return f"{'+' if value >= 0 else MINUS}{text}"


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
