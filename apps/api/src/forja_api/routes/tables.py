"""Warehouse table endpoints: registry, publication, previews and file exports.

What a caller may read depends on the layer: Silver tables need ``silver.read``,
Gold tables ``gold.read``, a data mart belongs to its author (or ``mart.read_all``).
Without ``data.unmasked`` every personal column is pseudonymized, whatever the plan.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.background import BackgroundTask

from forja_api.schemas import TablePreview
from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.errors import ForbiddenError
from forja_core.jobs.models import ExportFormat
from forja_core.silver.tables import TableLayer, WarehouseTable

router = APIRouter(tags=["tables"])

_MEDIA_TYPES = {
    ExportFormat.PARQUET: "application/vnd.apache.parquet",
    ExportFormat.CSV: "text/csv; charset=utf-8",
}

ProjectAccess = Annotated[Access, require(Action.PROJECT_READ)]


def readable(access: Access, table: WarehouseTable) -> bool:
    match table.layer:
        case TableLayer.SILVER:
            return access.can(Action.SILVER_READ)
        case TableLayer.GOLD:
            return access.can(Action.GOLD_READ)
        case TableLayer.MART:
            return access.can(Action.MART_READ_ALL) or table.owner_id == access.principal.id


def _readable_table(access: Access, table_id: str, state: StateDep) -> WarehouseTable:
    table = state.catalog.get_table(table_id)
    if not readable(access, table):
        raise ForbiddenError(
            f"your role ({access.role.value}) cannot read this {table.layer.value} table",
            details={"table_id": table_id, "layer": table.layer.value},
        )
    return table


@router.get("/projects/{project_id}/tables", summary="Tables of the project the caller may read")
def list_tables(project_id: str, state: StateDep, access: ProjectAccess) -> list[WarehouseTable]:
    return [t for t in state.catalog.list_tables(project_id) if readable(access, t)]


@router.get("/tables/{table_id}")
def get_table(table_id: str, state: StateDep, access: ProjectAccess) -> WarehouseTable:
    return _readable_table(access, table_id, state)


class TableUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    publish: bool = Field(
        description="Publish the table to the serving database (Gold tables are by default)"
    )


@router.patch("/tables/{table_id}", summary="Publish or unpublish a table")
def update_table(
    table_id: str,
    update: TableUpdate,
    state: StateDep,
    access: Annotated[Access, require(Action.TABLE_PUBLISH)],
) -> WarehouseTable:
    table = state.catalog.set_table_publication(table_id, update.publish)
    access.audit(
        "table.publish" if update.publish else "table.unpublish",
        object_type="table",
        object_id=table_id,
        details={"name": table.name, "layer": table.layer.value},
    )
    return table


@router.get(
    "/tables/{table_id}/preview",
    summary="First rows of a table, personal data treated as in exports",
)
def preview_table(
    table_id: str,
    state: StateDep,
    access: ProjectAccess,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 100,
) -> TablePreview:
    table = _readable_table(access, table_id, state)
    limit = min(limit, state.settings.preview_max_rows)
    preview = state.publisher.preview(table, limit, strict=not access.unmasked)
    return TablePreview(
        table_id=table.id,
        columns=preview.columns,
        rows=preview.rows,
        limit=limit,
        total_rows=preview.total_rows,
    )


@router.get(
    "/tables/{table_id}/export",
    summary="Download a table, personal data treated as defined in its plan",
    response_class=FileResponse,
)
def export_table(
    table_id: str,
    state: StateDep,
    access: ProjectAccess,
    format: Annotated[ExportFormat, Query()] = ExportFormat.PARQUET,
    delimiter: Annotated[str | None, Query(min_length=1, max_length=1)] = None,
) -> FileResponse:
    table = _readable_table(access, table_id, state)
    staging = state.publisher.exports_dir(table.project_id) / f".{uuid.uuid4().hex}.{format.value}"
    exported = state.publisher.export(
        table, format, staging, delimiter=delimiter, strict=not access.unmasked
    )
    access.audit(
        "table.export",
        object_type="table",
        object_id=table_id,
        details={
            "name": table.name,
            "format": format.value,
            "rows": exported.rows,
            "pseudonymized": not access.unmasked,
        },
    )
    return FileResponse(
        exported.path,
        media_type=_MEDIA_TYPES[format],
        filename=f"{exported.table}.{format.value}",
        background=BackgroundTask(staging.unlink, missing_ok=True),
    )
