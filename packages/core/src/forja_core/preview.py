"""Read a bounded sample of a Parquet table for display."""

from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import duckdb

from forja_core.utils import sql_literal


@dataclass(frozen=True)
class Preview:
    columns: list[str]
    rows: list[dict[str, Any]]
    total_rows: int


def json_safe(value: Any) -> Any:
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [json_safe(v) for v in value]
    return value


def read_preview(path: Path, limit: int) -> Preview:
    relation = f"read_parquet({sql_literal(str(path))})"
    with duckdb.connect() as con:
        [(total_rows,)] = con.execute(f"SELECT count(*) FROM {relation}").fetchall()
        table = con.sql(f"SELECT * FROM {relation} LIMIT {int(limit)}").to_arrow_table()
    rows = [{k: json_safe(v) for k, v in row.items()} for row in table.to_pylist()]
    return Preview(columns=list(table.column_names), rows=rows, total_rows=int(total_rows))
