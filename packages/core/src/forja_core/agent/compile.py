"""Deterministic compilation of a validated MartSpec into SQL.

The SQL is written from templates over the semantic layer: the language model never
writes any. One query shape:

    with base as (
        select <axes>, <fact columns needed by the metrics>
        from <fact> left join <dimensions used>
        where <filters on attributes> and <period>
    )
    select <axes>, <aggregates>
    from base
    group by <axes> having <filters on totals>
    order by ... limit ...

Ratios are computed from their additive parts (``sum(montant) / sum(quantite)``),
semi-additive metrics take their value at the latest date of each group.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from forja_core.agent.models import MartColumn
from forja_core.agent.spec import FilterOperator, MartFilter, MartSpec, Scalar
from forja_core.gold.plan import UNKNOWN_KEY
from forja_core.semantic.models import (
    Additivity,
    Metric,
    MetricAggregation,
    MetricFormat,
    SemanticDimension,
    SemanticLayer,
    TimeGrain,
)
from forja_core.silver.dbt.sql import ident
from forja_core.utils import sql_literal

INDENT = "    "
FACT_ALIAS = "f"

_GRAIN_SQL = {
    TimeGrain.DAY: "{date}",
    TimeGrain.WEEK: "cast(date_trunc('week', {date}) as date)",
    TimeGrain.MONTH: "cast(date_trunc('month', {date}) as date)",
    TimeGrain.QUARTER: "cast(date_trunc('quarter', {date}) as date)",
    TimeGrain.YEAR: "year({date})",
}
_OPERATORS = {
    FilterOperator.EQ: "=",
    FilterOperator.NEQ: "<>",
    FilterOperator.GT: ">",
    FilterOperator.GTE: ">=",
    FilterOperator.LT: "<",
    FilterOperator.LTE: "<=",
}


@dataclass(frozen=True)
class CompiledMart:
    sql: str = field(metadata={"doc": "Query on the warehouse"})
    dbt_sql: str = field(metadata={"doc": "Same query with dbt refs, for the published model"})
    columns: list[MartColumn]
    fact: str
    unlimited_sql: str = ""
    base_sql: str = ""
    dimensions: list[str] = field(default_factory=list)


def literal(value: Scalar) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return repr(value) if isinstance(value, float) else str(value)
    return sql_literal(str(value))


def _q(name: str) -> str:
    return ident(name)


def _column(alias: str, column: str) -> str:
    return f"{_q(alias)}.{_q(column)}"


class _Builder:
    def __init__(self, layer: SemanticLayer, spec: MartSpec, fact: str) -> None:
        self.layer = layer
        self.spec = spec
        self.fact = fact
        self.joins: dict[str, SemanticDimension] = {}

    def dimension(self, name: str) -> SemanticDimension:
        dim = self.layer.dimension(name)
        assert dim is not None
        if dim.kind != "degenerate":
            self.joins.setdefault(dim.name, dim)
        return dim

    def attribute_sql(self, ref: str) -> str:
        found = self.layer.attribute(ref)
        assert found is not None
        dim, attribute = found
        self.dimension(dim.name)
        alias = FACT_ALIAS if dim.kind == "degenerate" else dim.name
        return _column(alias, attribute.column)

    def time_sql(self) -> str:
        assert self.spec.time_dimension is not None
        dim = self.dimension(self.spec.time_dimension)
        return _column(dim.name, "date")

    def filter_sql(self, item: MartFilter, column: str) -> str:
        values = item.value if isinstance(item.value, list) else [item.value]
        if item.operator in (FilterOperator.IN, FilterOperator.NOT_IN):
            keyword = "in" if item.operator is FilterOperator.IN else "not in"
            return f"{column} {keyword} ({', '.join(literal(v) for v in values)})"
        if item.operator is FilterOperator.CONTAINS:
            return f"contains(lower(cast({column} as varchar)), lower({literal(str(values[0]))}))"
        return f"{column} {_OPERATORS[item.operator]} {literal(values[0])}"


def _aggregate(metric: Metric, column: str, last_key: str | None) -> str:
    assert metric.aggregation is not None
    target = column
    if metric.additivity is Additivity.SEMI_ADDITIVE and last_key is not None:
        target = f"case when _date_key = _last_date_key then {column} end"
    match metric.aggregation:
        case MetricAggregation.SUM:
            return f"sum({target})"
        case MetricAggregation.COUNT:
            return f"count({target})"
        case MetricAggregation.COUNT_DISTINCT:
            return f"count(distinct {target})"
        case MetricAggregation.MIN:
            return f"min({target})"
        case MetricAggregation.MAX:
            return f"max({target})"


def compile_spec(
    spec: MartSpec, layer: SemanticLayer, fact: str, *, include_limit: bool = True
) -> CompiledMart:
    """``spec`` must have been validated (refs resolved, time dimension set)."""
    builder = _Builder(layer, spec, fact)
    columns: list[MartColumn] = []
    axis_select: list[str] = []
    axis_names: list[str] = []
    names_taken: set[str] = set()

    def output_name(preferred: str, fallback: str) -> str:
        name = preferred if preferred not in names_taken else fallback
        names_taken.add(name)
        return name

    if spec.time_grain is not None:
        name = output_name(spec.time_grain.value, f"{spec.time_dimension}_{spec.time_grain.value}")
        axis_select.append(
            f"{_GRAIN_SQL[spec.time_grain].format(date=builder.time_sql())} as {_q(name)}"
        )
        axis_names.append(name)
        time_label = layer.dimension(spec.time_dimension or "")
        columns.append(
            MartColumn(
                name=name,
                kind="axis",
                label=spec.time_grain.value.capitalize()
                + (f" ({time_label.label.lower()})" if time_label else ""),
                ref=f"time:{spec.time_dimension}:{spec.time_grain.value}",
            )
        )
    for ref in spec.axes:
        found = layer.attribute(ref)
        assert found is not None
        dim, attribute = found
        name = output_name(attribute.name, f"{dim.name}_{attribute.name}")
        axis_select.append(f"{builder.attribute_sql(ref)} as {_q(name)}")
        axis_names.append(name)
        columns.append(
            MartColumn(
                name=name,
                kind="axis",
                label=f"{attribute.label} ({dim.label.lower()})"
                if dim.kind != "time"
                else attribute.label,
                ref=f"attribute:{ref}",
                pii=attribute.pii.value if attribute.pii else None,
            )
        )

    # Fact columns needed by the metrics (ratios through their parts).
    needed: dict[str, Metric] = {}

    def need(metric: Metric) -> None:
        if metric.kind == "ratio":
            for part in (metric.numerator, metric.denominator):
                part_metric = layer.metric(part or "")
                assert part_metric is not None
                need(part_metric)
        else:
            needed.setdefault(metric.name, metric)

    for name in spec.metrics:
        metric = layer.metric(name)
        assert metric is not None
        need(metric)
    semi = any(m.additivity is Additivity.SEMI_ADDITIVE for m in needed.values())

    base_columns = list(axis_select)
    for metric in needed.values():
        assert metric.column is not None
        base_columns.append(f"{_column(FACT_ALIAS, metric.column)} as {_q('_m_' + metric.name)}")

    where: list[str] = []
    having: list[str] = []
    for item in spec.filters:
        if layer.metric(item.field) is not None:
            continue
        where.append(builder.filter_sql(item, builder.attribute_sql(item.field)))
    if spec.period is not None and spec.time_dimension is not None:
        date_column = builder.time_sql()
        if spec.period.start:
            where.append(f"{date_column} >= DATE {sql_literal(spec.period.start.isoformat())}")
        if spec.period.end:
            where.append(f"{date_column} <= DATE {sql_literal(spec.period.end.isoformat())}")

    last_key = None
    if semi:
        time_dims = [d for d in layer.time_dimensions() if d.fact == fact]
        if time_dims and time_dims[0].fact_key:
            last_key = _column(FACT_ALIAS, time_dims[0].fact_key)
            partition = ", ".join(
                axis_select_expr.rsplit(" as ", 1)[0] for axis_select_expr in axis_select
            )
            base_columns.append(f"{last_key} as _date_key")
            base_columns.append(
                f"max({last_key}) over ({'partition by ' + partition if partition else ''}) "
                "as _last_date_key"
            )

    def metric_sql(metric: Metric) -> str:
        if metric.kind == "ratio":
            numerator = layer.metric(metric.numerator or "")
            denominator = layer.metric(metric.denominator or "")
            assert numerator is not None and denominator is not None
            ratio = (
                f"cast({metric_sql(numerator)} as double) / nullif({metric_sql(denominator)}, 0)"
            )
            return f"round({ratio}, 2)" if metric.format is MetricFormat.CURRENCY else ratio
        return _aggregate(metric, _q("_m_" + metric.name), last_key)

    select = [_q(n) for n in axis_names]
    for name in spec.metrics:
        metric = layer.metric(name)
        assert metric is not None
        output = output_name(metric.name, f"m_{metric.name}")
        select.append(f"{metric_sql(metric)} as {_q(output)}")
        columns.append(
            MartColumn(
                name=output,
                kind="metric",
                label=metric.label + (f" ({metric.unit})" if metric.unit else ""),
                ref=f"metric:{metric.name}",
                additivity=metric.additivity.value,
            )
        )
    for item in spec.filters:
        metric = layer.metric(item.field)
        if metric is not None:
            having.append(builder.filter_sql(item, metric_sql(metric)))

    def render(
        table: str, dims: dict[str, SemanticDimension], *, limit: bool, with_having: bool = True
    ) -> str:
        lines = ["with base as (", "", f"{INDENT}select"]
        lines += [f"{INDENT * 2}{c}," for c in base_columns[:-1]] + [
            f"{INDENT * 2}{base_columns[-1]}"
        ]
        lines.append(f"{INDENT}from {table.format(fact)} as {FACT_ALIAS}")
        for dim in dims.values():
            assert dim.fact_key and dim.table_key
            condition = f"{_column(dim.name, dim.table_key)} = {_column(FACT_ALIAS, dim.fact_key)}"
            lines.append(
                f"{INDENT}left join {table.format(dim.table)} as {_q(dim.name)}\n"
                f"{INDENT * 2}on {condition}"
            )
        if where:
            lines.append(f"{INDENT}where " + f"\n{INDENT * 2}and ".join(where))
        lines += ["", ")", "", "select"]
        lines += [f"{INDENT}{c}," for c in select[:-1]] + [f"{INDENT}{select[-1]}"]
        lines.append("from base")
        if axis_names:
            lines.append("group by " + ", ".join(_q(n) for n in axis_names))
        if having and with_having:
            lines.append("having " + " and ".join(having))
        order = [f"{_q(o.field.split('.')[-1])} {o.direction}" for o in spec.order_by]
        if not order:
            if spec.time_grain is not None:
                order.append(f"{_q(axis_names[0])} asc")
            if spec.metrics:
                first = next(c for c in columns if c.kind == "metric").name
                order.append(f"{_q(first)} desc")
        order += [f"{_q(n)} asc" for n in axis_names if all(_q(n) not in o for o in order)]
        if order and (axis_names or spec.order_by):
            lines.append("order by " + ", ".join(order))
        if limit and spec.limit:
            lines.append(f"limit {int(spec.limit)}")
        return "\n".join(lines) + "\n"

    joins = builder.joins
    warehouse = render('"{}"', joins, limit=include_limit)
    unlimited = render('"{}"', joins, limit=False, with_having=False)
    dbt = render("{{{{ ref('{}') }}}}", joins, limit=include_limit)
    return CompiledMart(
        sql=warehouse,
        dbt_sql=dbt,
        columns=columns,
        fact=fact,
        unlimited_sql=unlimited,
        base_sql=_base_only(base_columns, fact, joins, where),
        dimensions=[d.name for d in joins.values() if d.kind == "standard"],
    )


def _base_only(
    base_columns: list[str], fact: str, joins: dict[str, SemanticDimension], where: list[str]
) -> str:
    """The fact rows in the scope of the mart (for the reconciliation controls)."""
    lines = [f"select {FACT_ALIAS}.* from {_q(fact)} as {FACT_ALIAS}"]
    for dim in joins.values():
        assert dim.fact_key and dim.table_key
        lines.append(
            f"left join {_q(dim.table)} as {_q(dim.name)} "
            f"on {_column(dim.name, dim.table_key)} = {_column(FACT_ALIAS, dim.fact_key)}"
        )
    if where:
        lines.append("where " + " and ".join(where))
    return "\n".join(lines)


UNKNOWN = UNKNOWN_KEY
