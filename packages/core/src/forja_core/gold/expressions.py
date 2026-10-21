"""Measure expressions: parsed with sqlglot, checked against an allowlist.

A measure is a row-level expression over the columns of its fact (``quantite *
prix_unitaire``); its aggregation is declared separately. Only column references
to the fact's tables, numeric or string literals, arithmetic, comparisons, CASE and
a few scalar functions are accepted: no subquery, no aggregate, no star, no
function outside the list.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from forja_core.utils import quote_ident

ALLOWED_FUNCTIONS: dict[type[exp.Expression], str] = {
    exp.Coalesce: "coalesce",
    exp.Nullif: "nullif",
    exp.Abs: "abs",
    exp.Round: "round",
    exp.Greatest: "greatest",
    exp.Least: "least",
    exp.Case: "case",
    exp.If: "if",
    exp.Cast: "cast",
    exp.TryCast: "try_cast",
}
_ALLOWED_NODES: tuple[type[exp.Expression], ...] = (
    exp.Column,
    exp.Identifier,
    exp.Literal,
    exp.Null,
    exp.Boolean,
    exp.Paren,
    exp.Neg,
    exp.Add,
    exp.Sub,
    exp.Mul,
    exp.Div,
    exp.Mod,
    exp.EQ,
    exp.NEQ,
    exp.GT,
    exp.GTE,
    exp.LT,
    exp.LTE,
    exp.And,
    exp.Or,
    exp.Not,
    exp.Is,
    exp.DataType,
    *ALLOWED_FUNCTIONS,
)
OPERATORS = "+ - * / %, comparaisons, AND / OR / NOT, IS NULL"


class ExpressionError(ValueError):
    """The expression is rejected; the message is meant for the person editing it."""


@dataclass(frozen=True)
class CheckedExpression:
    sql: str = ""
    columns: tuple[tuple[str, str], ...] = ()


_LABELS: dict[type[exp.Expr], str] = {
    exp.Subquery: "une sous-requête",
    exp.Select: "une requête SELECT",
    exp.Star: "« * »",
    exp.Window: "une fonction de fenêtre",
}


def _node_label(node: exp.Expr) -> str:
    for node_type, label in _LABELS.items():
        if isinstance(node, node_type):
            return label
    if isinstance(node, exp.AggFunc):
        return f"l'agrégat {node.sql_name().lower()}() (l'agrégation se déclare à part)"
    if isinstance(node, exp.Anonymous):
        return f"{node.name}()"
    if isinstance(node, exp.Func):
        return f"{node.sql_name().lower()}()"
    return node.key.upper()


def check_expression(
    expression: str, tables: Mapping[str, set[str]], default_table: str
) -> CheckedExpression:
    """Validate ``expression`` and return it as DuckDB SQL with qualified columns.

    ``tables`` maps each table the expression may use (Silver source names) to its
    columns; unqualified columns belong to ``default_table``.
    """
    try:
        tree = sqlglot.parse_one(expression, read="duckdb")
    except ParseError as exc:
        raise ExpressionError(f"expression illisible : {expression!r}") from exc
    if tree is None:
        raise ExpressionError("expression vide")

    for node in tree.walk():
        if not isinstance(node, _ALLOWED_NODES):
            allowed = ", ".join(sorted(ALLOWED_FUNCTIONS.values()))
            raise ExpressionError(
                f"{_node_label(node)} n'est pas autorisé dans une mesure ; "
                f"fonctions autorisées : {allowed} ; opérateurs : {OPERATORS}"
            )

    columns: list[tuple[str, str]] = []
    for column in tree.find_all(exp.Column):
        table = column.table or default_table
        if table not in tables:
            raise ExpressionError(
                f"table inconnue « {table} » : utilisez {', '.join(sorted(tables))}"
            )
        if column.name not in tables[table]:
            raise ExpressionError(f"colonne inconnue « {table}.{column.name} »")
        columns.append((table, column.name))
    if not columns:
        raise ExpressionError("une mesure doit utiliser au moins une colonne")

    def qualify(node: exp.Expression) -> exp.Expression:
        if isinstance(node, exp.Column):
            table = node.table or default_table
            return exp.Column(
                this=exp.Identifier(this=node.name, quoted=True),
                table=exp.Identifier(this=table, quoted=True),
            )
        return node

    sql = tree.transform(qualify).sql(dialect="duckdb")
    return CheckedExpression(sql=sql, columns=tuple(dict.fromkeys(columns)))


def qualified(table: str, column: str) -> str:
    return f"{quote_ident(table)}.{quote_ident(column)}"
