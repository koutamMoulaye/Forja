"""Registry entry of a built Silver table."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from forja_core.models import ColumnSchema


class SilverTable(BaseModel):
    id: str
    project_id: str
    source_id: str
    name: str
    plan_version: int
    row_count: int
    rejected_count: int
    columns: list[ColumnSchema]
    built_at: datetime
    last_run_id: str | None = None
