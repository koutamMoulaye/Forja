"""What a data mart says, in one sentence and one picture, computed from its result.

The sentence is written here from the figures (total, share of the first, top 3,
change over time), never by a language model, which sees no value. The visual follows
the shape of the result:

- one value: a KPI tile;
- a time axis alone: a line;
- one category axis with up to ``MAX_BARS`` members: horizontal bars, sorted;
- anything else: a compact table.

Values of personal columns arrive pseudonymized: the sentence and the chart use them as
the preview shows them.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field

from forja_core.semantic.models import Additivity, TimeGrain

if TYPE_CHECKING:
    from forja_core.agent.models import MartColumn
    from forja_core.agent.spec import MartSpec
    from forja_core.semantic.models import SemanticLayer

MAX_BARS = 15
MAX_POINTS = 240
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
        default_factory=list, description="Chart data: bars sorted, line in time order"
    )
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


def _period(spec: MartSpec) -> str:
    if spec.period is None or not spec.period.label:
        return ""
    label = spec.period.label
    return f" en {label}" if label.isdigit() else f" sur {label}"


def build_insight(
    columns: list[MartColumn],
    rows: list[dict[str, Any]],
    row_count: int,
    spec: MartSpec,
    layer: SemanticLayer,
) -> Insight | None:
    """``rows``: the whole result when it is small (all of it for bars and lines), with
    personal values already pseudonymized."""
    metric = next((c for c in columns if c.kind == "metric"), None)
    if metric is None:
        return None
    axes = [c for c in columns if c.kind == "axis"]
    found = layer.metric(metric.ref.partition(":")[2])
    additive = found is not None and found.additivity is Additivity.ADDITIVE
    fmt = metric.format or (found.format.value if found else "decimal")
    unit = metric.unit if metric.unit not in (None, "EUR") else None
    label = metric.label
    values = [_float(r.get(metric.name)) for r in rows]

    def number(value: float | None) -> str:
        return format_number(value, fmt, unit)

    period = _period(spec)
    if not axes:
        value = values[0] if values else None
        return Insight(
            sentence=f"{label}{period} : {number(value)}.",
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
        grain = spec.time_grain
        series = sorted(
            ((r.get(time_axis.name), _float(r.get(metric.name))) for r in rows),
            key=lambda item: (item[0] is None, str(item[0]) if item[0] is not None else ""),
        )
        points = [InsightPoint(label=time_label(t, grain), value=v) for t, v in series]
        known = [p for p in points if p.value is not None]
        sentence = f"{label}{period}"
        if len(known) >= 2:
            first, last = known[0], known[-1]
            sentence += (
                f" : de {number(first.value)} ({first.label}) à {number(last.value)} ({last.label})"
            )
            if first.value:
                change = (last.value - first.value) / abs(first.value)  # type: ignore[operator]
                sign = "+" if change >= 0 else MINUS
                sentence += f", soit {sign}{_percent(abs(change))}"
            peak = max(known, key=lambda p: p.value or 0)
            if peak is not last and peak is not first:
                sentence += f" ; maximum en {peak.label} ({number(peak.value)})"
        sentence += "."
        total = sum(p.value or 0 for p in known) if additive else None
        return Insight(
            sentence=sentence,
            visual="line",
            metric=metric.name,
            metric_label=label,
            axis=time_axis.name,
            axis_label=time_axis.label,
            unit=metric.unit,
            format=fmt,
            total=total,
            points=points,
            alt=f"Courbe de {label.lower()} par {time_axis.label.lower()}{period}, "
            f"{len(points)} points.",
        )

    axis = axes[0]
    ranked = sorted(
        ((str(r.get(axis.name) if r.get(axis.name) is not None else "Inconnu"), v)
         for r, v in zip(rows, values, strict=True)),
        key=lambda item: -(item[1] if item[1] is not None else float("-inf")),
    )  # fmt: skip
    points = [InsightPoint(label=name, value=v) for name, v in ranked]
    single = len(axes) == 1
    visual: Visual = "bars" if single and 1 < row_count <= MAX_BARS else "table"
    total = sum(v for _, v in ranked if v is not None) if additive and single else None
    members = _plural(axis.label)
    if not ranked:
        sentence = f"{label}{period} : aucune ligne."
    elif total is not None and total > 0 and all((v or 0) >= 0 for _, v in ranked):
        top, top_value = ranked[0]
        sentence = (
            f"{label}{period} : {number(total)} au total sur {row_count} {members}. "
            f"{top} arrive en tête avec {number(top_value)} ({_percent((top_value or 0) / total)})"
        )
        if row_count > 3 and len(ranked) >= 3:
            share = sum(v or 0 for _, v in ranked[:3]) / total
            names = ", ".join(name for name, _ in ranked[:3])
            sentence += f" ; les trois premiers ({names}) en font {_percent(share)}"
        sentence += "."
    else:
        top, top_value = ranked[0]
        sentence = (
            f"{label}{period} sur {row_count} lignes : la valeur la plus élevée est "
            f"{number(top_value)} ({top})."
        )
    shown = points[:MAX_BARS] if visual == "bars" else points
    return Insight(
        sentence=sentence,
        visual=visual,
        metric=metric.name,
        metric_label=label,
        axis=axis.name,
        axis_label=axis.label,
        unit=metric.unit,
        format=fmt,
        total=total,
        points=shown,
        alt=f"Barres de {label.lower()} par {axis.label.lower()}{period}, triées, "
        f"{len(shown)} {members}."
        if visual == "bars"
        else f"Tableau de {label.lower()} par {', '.join(a.label.lower() for a in axes)}.",
    )
