"""Registry entry of a table built in a project warehouse (Silver or Gold)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from forja_core.models import ColumnSchema


class TableLayer(StrEnum):
    SILVER = "silver"
    GOLD = "gold"
    MART = "mart"


class WarehouseTable(BaseModel):
    id: str
    project_id: str
    layer: TableLayer = TableLayer.SILVER
    source_id: str | None = Field(default=None, description="Silver tables: their source")
    name: str
    plan_version: int = Field(description="Version of the Silver plan, or of the Gold plan")
    row_count: int
    rejected_count: int = 0
    columns: list[ColumnSchema]
    built_at: datetime
    last_run_id: str | None = None
    publish: bool = Field(
        default=False,
        description="Published to the serving database (Gold tables by default)",
    )
    owner_id: str | None = Field(default=None, description="Data marts: the requesting user")


# Silver tables are registry entries of the Silver layer.
SilverTable = WarehouseTable
