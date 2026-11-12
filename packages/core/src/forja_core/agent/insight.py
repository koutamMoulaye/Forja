"""What a data mart says, in one sentence and one picture, computed from its result.

The sentence is written here from the figures (total, share of the first, top 3,
change over time, high and low points, largest change), never by a language model,
which sees no value. The visual follows the shape of the result:

- one value: a KPI tile;
- a time axis alone: a line, one series per metric asked;
- one category axis: horizontal bars, sorted; beyond ``MAX_BARS`` members, the first
  ``TOP_BARS`` and one « Autres » bar, with the whole ranking in an expandable table;
- anything else: a compact table.

Values of personal columns arrive pseudonymized: the sentence and the chart use them as
the preview shows them.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from itertools import pairwise
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field

from forja_core.semantic.models import Additivity, TimeGrain

if TYPE_CHECKING:
    from forja_core.agent.models import MartColumn
    from forja_core.agent.spec import MartSpec
    from forja_core.semantic.models import SemanticLayer

MAX_BARS = 15
TOP_BARS = 10
MAX_POINTS = 240
OTHERS = "Autres"
NARROW_SPACE = chr(0x202F)
MINUS = chr(0x2212)
_MONTHS = (
    "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
    "octobre", "novembre", "décembre",
)  # fmt: skip

Visual = Literal["kpi", "line", "bars", "table"]


class InsightPoint(BaseModel):
    label: str
    value: float | None


class InsightSeries(BaseModel):
    """One metric of a line: several metrics asked are all drawn, with a legend."""

    metric: str = Field(description="Column of the metric")
    label: str
    unit: str | None = None
    format: str = "decimal"
    points: list[InsightPoint] = Field(default_factory=list)


class Insight(BaseModel):
    """The answer in the conversation: a sentence and the data of its visual."""

    sentence: str = Field(description="Computed from the result, in French")
    visual: Visual
    metric: str = Field(description="Column of the metric shown")
    metric_label: str
    axis: str | None = Field(default=None, description="Column of the axis shown, if any")
    axis_label: str | None = None
    unit: str | None = None
    format: str = "decimal"
    total: float | None = Field(default=None, description="Total of an additive metric")
    points: list[InsightPoint] = Field(
        default_factory=list,
        description="Chart data: bars sorted (the first ones and « Autres » beyond "
        "MAX_BARS members), line in time order",
    )
    series: list[InsightSeries] = Field(
        default_factory=list, description="Line: one series per metric, in time order"
    )
    ranking: list[InsightPoint] = Field(
        default_factory=list,
        description="Bars grouped under « Autres »: every member, sorted, for the table",
    )
    others: int = Field(default=0, description="Members grouped in the « Autres » bar")
    alt: str = Field(description="Text alternative of the visual")


def _float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, int | float):
        return float(value)
    return None


def format_number(value: float | None, fmt: str, unit: str | None = None) -> str:
    """« 3 845 164 entrées », « 12 345,60 € », « 4,5 » (French typography)."""
    if value is None:
        return "—"
    if fmt == "currency":
        text = f"{value:,.2f}"
    elif fmt == "integer" or float(value).is_integer():
        text = f"{round(value):,}"
    elif fmt == "percent":
        text = f"{value * 100:,.1f}"
    else:
        text = f"{value:,.2f}".rstrip("0").rstrip(".")
    text = text.replace(",", NARROW_SPACE).replace(".", ",")
    if fmt == "currency" or unit == "EUR":
        return f"{text}{NARROW_SPACE}€"
    if fmt == "percent":
        return f"{text}{NARROW_SPACE}%"
    return f"{text} {unit}" if unit else text


def _percent(share: float) -> str:
    return f"{share * 100:.0f}{NARROW_SPACE}%"


def _signed(change: float) -> str:
    return f"{'+' if change >= 0 else MINUS}{_percent(abs(change))}"


def time_label(value: Any, grain: TimeGrain | None) -> str:
    if isinstance(value, date):
        match grain:
            case TimeGrain.MONTH:
                return f"{_MONTHS[value.month - 1]} {value.year}"
            case TimeGrain.QUARTER:
                return f"T{(value.month - 1) // 3 + 1} {value.year}"
            case TimeGrain.WEEK:
                return f"semaine du {value:%d/%m/%Y}"
            case TimeGrain.YEAR:
                return str(value.year)
            case _:
                return f"{value:%d/%m/%Y}"
    return "Inconnu" if value is None else str(value)


def _plural(label: str) -> str:
    word = label[:1].lower() + label[1:]
    return word if word.endswith(("s", "x", "z")) else f"{word}s"


def _lower(label: str) -> str:
    return label[:1].lower() + label[1:] if label[1:2] != label[1:2].upper() else label


def _period(spec: MartSpec) -> str:
    if spec.period is None or not spec.period.label:
        return ""
    label = spec.period.label
    return f" en {label}" if label.isdigit() else f" sur {label}"


def _in(label: str) -> str:
    """« en 2020 », « en mars 2020 », « au T2 2020 »."""
    return f"au {label}" if label.startswith(("T", "S")) and label[1:2].isdigit() else f"en {label}"


def trend(points: list[InsightPoint], number: Any) -> str:
    """What a series does over time, computed: start and end, change, high and low
    points, and the largest change from one point to the next (« point bas en 2020,
    -64 % »). Empty with fewer than two known points."""
    known = [p for p in points if p.value is not None]
    if len(known) < 2:
        return ""
    first, last = known[0], known[-1]
    text = f"de {number(first.value)} ({first.label}) à {number(last.value)} ({last.label})"
    if first.value:
        text += f", soit {_signed((last.value - first.value) / abs(first.value))}"  # type: ignore[operator]
    if len(known) >= 3:
        high = max(known, key=lambda p: p.value or 0)
        low = min(known, key=lambda p: p.value or 0)
        text += f" ; point haut {_in(high.label)} ({number(high.value)})"
        text += f", point bas {_in(low.label)} ({number(low.value)})"
        steps = [
            (after, (after.value - before.value) / abs(before.value))  # type: ignore[operator]
            for before, after in pairwise(known)
            if before.value
        ]
        if steps:
            moved, change = max(steps, key=lambda step: abs(step[1]))
            text += f" ; plus forte variation {_in(moved.label)} ({_signed(change)})"
    return text


def build_insight(
    columns: list[MartColumn],
    rows: list[dict[str, Any]],
    row_count: int,
    spec: MartSpec,
    layer: SemanticLayer,
) -> Insight | None:
    """``rows``: the whole result when it is small (all of it for bars and lines), with
    personal values already pseudonymized."""
    metrics = [c for c in columns if c.kind == "metric"]
    if not metrics:
        return None
    metric = metrics[0]
    axes = [c for c in columns if c.kind == "axis"]
    found = layer.metric(metric.ref.partition(":")[2])
    additive = found is not None and found.additivity is Additivity.ADDITIVE
    fmt = metric.format or (found.format.value if found else "decimal")
    label = metric.label
    values = [_float(r.get(metric.name)) for r in rows]

    def formatter(column: MartColumn) -> Any:
        column_unit = column.unit if column.unit not in (None, "EUR") else None
        return lambda value: format_number(value, column.format or "decimal", column_unit)

    number = formatter(metric)
    period = _period(spec)
    if not axes:
        value = values[0] if values else None
        parts = [f"{label}{period} : {number(value)}"]
        for other in metrics[1:]:
            other_value = _float(rows[0].get(other.name)) if rows else None
            parts.append(f"{_lower(other.label)} : {formatter(other)(other_value)}")
        return Insight(
            sentence=" ; ".join(parts) + ".",
            visual="kpi",
            metric=metric.name,
            metric_label=label,
            unit=metric.unit,
            format=fmt,
            total=value,
            points=[InsightPoint(label=label, value=value)],
            alt=f"{label}{period} : {number(value)}",
        )

    time_axis = next((a for a in axes if a.ref.startswith("time:")), None)
    if time_axis is not None and len(axes) == 1 and row_count <= MAX_POINTS and len(rows) >= 2:
        return _line(rows, spec, layer, metrics, time_axis, period, formatter, additive)

    axis = axes[0]
    ranked = sorted(
        ((str(r.get(axis.name) if r.get(axis.name) is not None else "Inconnu"), v)
         for r, v in zip(rows, values, strict=True)),
        key=lambda item: -(item[1] if item[1] is not None else float("-inf")),
    )  # fmt: skip
    # « les moins visités »: the lowest first, and said so.
    lowest = bool(spec.order_by) and spec.order_by[0].direction == "asc"
    if lowest:
        ranked.reverse()
    points = [InsightPoint(label=name, value=v) for name, v in ranked]
    single = len(axes) == 1
    complete = len(rows) >= row_count  # every member is here, not a sample
    total = sum(v for _, v in ranked if v is not None) if additive and single and complete else None
    positive = all((v or 0) >= 0 for _, v in ranked)
    grouped = single and complete and row_count > MAX_BARS and total is not None and positive
    visual: Visual = "bars" if single and (1 < row_count <= MAX_BARS or grouped) else "table"
    members = _plural(axis.label)
    if not ranked:
        sentence = f"{label}{period} : aucune ligne."
    elif total is not None and total > 0 and positive:
        top, top_value = ranked[0]
        lead = "a la valeur la plus basse" if lowest else "arrive en tête"
        sentence = (
            f"{label}{period} : {number(total)} au total sur {row_count} {members}. "
            f"{top} {lead} avec {number(top_value)} ({_percent((top_value or 0) / total)})"
        )
        if row_count > 3 and len(ranked) >= 3:
            share = sum(v or 0 for _, v in ranked[:3]) / total
            names = ", ".join(name for name, _ in ranked[:3])
            first = "derniers" if lowest else "premiers"
            sentence += f" ; les trois {first} ({names}) en font {_percent(share)}"
        if grouped:
            share = sum(v or 0 for _, v in ranked[:TOP_BARS]) / total
            sentence += f" ; les {TOP_BARS} premiers, {_percent(share)}"
        sentence += "."
    else:
        top, top_value = ranked[0]
        lead = "a la valeur la plus basse" if lowest else "arrive en tête"
        across = f"{row_count} {members}" if single else f"{row_count} lignes"
        sentence = f"{label}{period} : {top} {lead} avec {number(top_value)}, sur {across}."
    if len(metrics) > 1 and ranked and total:
        sentence += " " + _compare(rows, metrics, formatter, layer)
    shown = points
    others = 0
    if grouped:
        rest = points[TOP_BARS:]
        others = len(rest)
        shown = [
            *points[:TOP_BARS],
            InsightPoint(label=OTHERS, value=sum(p.value or 0 for p in rest)),
        ]
    elif visual == "bars":
        shown = points[:MAX_BARS]
    shown_text = (
        f"les {TOP_BARS} premiers {members} et {others} autres regroupés"
        if grouped
        else f"{len(shown)} {members}"
    )
    return Insight(
        sentence=sentence.strip(),
        visual=visual,
        metric=metric.name,
        metric_label=label,
        axis=axis.name,
        axis_label=axis.label,
        unit=metric.unit,
        format=fmt,
        total=total,
        points=shown,
        ranking=points if grouped else [],
        others=others,
        alt=f"Barres de {label.lower()} par {axis.label.lower()}{period}, triées, {shown_text}."
        if visual == "bars"
        else f"Tableau de {label.lower()} par {', '.join(a.label.lower() for a in axes)}.",
    )


def _compare(
    rows: list[dict[str, Any]], metrics: list[MartColumn], formatter: Any, layer: SemanticLayer
) -> str:
    """Several additive metrics of one unit (paying and free entries): the share of each
    in their sum over the whole result."""
    same = [m for m in metrics if m.unit == metrics[0].unit and _additive(layer, m)]
    if len(same) < 2:
        return ""
    sums = [sum(_float(r.get(m.name)) or 0 for r in rows) for m in same]
    whole = sum(sums)
    if whole <= 0 or any(s < 0 for s in sums):
        return ""
    shares = ", ".join(
        f"{_lower(m.label)} {_percent(s / whole)}" for m, s in zip(same, sums, strict=True)
    )
    return f"Répartition sur la période : {shares}."


def _additive(layer: SemanticLayer, column: MartColumn) -> bool:
    found = layer.metric(column.ref.partition(":")[2])
    return found is not None and found.additivity is Additivity.ADDITIVE


def _line(
    rows: list[dict[str, Any]],
    spec: MartSpec,
    layer: SemanticLayer,
    metrics: list[MartColumn],
    time_axis: MartColumn,
    period: str,
    formatter: Any,
    additive: bool,
) -> Insight:
    grain = spec.time_grain
    ordered = sorted(
        rows,
        key=lambda r: (
            r.get(time_axis.name) is None,
            str(r.get(time_axis.name)) if r.get(time_axis.name) is not None else "",
        ),
    )
    labels = [time_label(r.get(time_axis.name), grain) for r in ordered]
    series = [
        InsightSeries(
            metric=column.name,
            label=column.label,
            unit=column.unit,
            format=column.format or "decimal",
            points=[
                InsightPoint(label=lab, value=_float(r.get(column.name)))
                for lab, r in zip(labels, ordered, strict=True)
            ],
        )
        for column in metrics
    ]
    clauses: list[str] = []
    for column, item in zip(metrics, series, strict=True):
        described = trend(item.points, formatter(column))
        name = column.label if not clauses else _lower(column.label)
        when = period if not clauses else ""
        clauses.append(f"{name}{when} : {described}" if described else name)
    sentence = (
        " ; ".join(clauses)
        if len(clauses) == 1
        else ". ".join(c[:1].upper() + c[1:] for c in clauses)
    )
    sentence += "."
    if len(metrics) > 1:
        compared = _compare(ordered, metrics, formatter, layer)
        if compared:
            sentence += " " + compared
    first = series[0]
    known = [p for p in first.points if p.value is not None]
    total = sum(p.value or 0 for p in known) if additive else None
    names = ", ".join(_lower(s.label) for s in series)
    return Insight(
        sentence=sentence,
        visual="line",
        metric=metrics[0].name,
        metric_label=metrics[0].label,
        axis=time_axis.name,
        axis_label=time_axis.label,
        unit=metrics[0].unit,
        format=metrics[0].format or "decimal",
        total=total,
        points=first.points,
        series=series,
        alt=(
            f"Courbe de {names} par {time_axis.label.lower()}{period}, "
            f"{len(first.points)} points" + (f", {len(series)} séries." if len(series) > 1 else ".")
        ),
    )
