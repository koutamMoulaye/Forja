"""Warehouse table endpoints: registry, publication, previews and file exports."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.background import BackgroundTask

from forja_api.schemas import TablePreview
from forja_api.state import StateDep
from forja_core.jobs.models import ExportFormat
from forja_core.silver.tables import WarehouseTable

router = APIRouter(tags=["tables"])

_MEDIA_TYPES = {
    ExportFormat.PARQUET: "application/vnd.apache.parquet",
    ExportFormat.CSV: "text/csv; charset=utf-8",
}


@router.get("/projects/{project_id}/tables", summary="Silver and Gold tables built in the project")
def list_tables(project_id: str, state: StateDep) -> list[WarehouseTable]:
    return state.catalog.list_tables(project_id)


@router.get("/tables/{table_id}")
def get_table(table_id: str, state: StateDep) -> WarehouseTable:
    return state.catalog.get_table(table_id)


class TableUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    publish: bool = Field(
        description="Publish the table to the serving database (Gold tables are by default)"
    )


@router.patch("/tables/{table_id}", summary="Publish or unpublish a table")
def update_table(table_id: str, update: TableUpdate, state: StateDep) -> WarehouseTable:
    return state.catalog.set_table_publication(table_id, update.publish)


@router.get(
    "/tables/{table_id}/preview",
    summary="First rows of a table, personal data treated as in exports",
)
def preview_table(
    table_id: str,
    state: StateDep,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 100,
) -> TablePreview:
    table = state.catalog.get_table(table_id)
    limit = min(limit, state.settings.preview_max_rows)
    preview = state.publisher.preview(table, limit)
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
    format: Annotated[ExportFormat, Query()] = ExportFormat.PARQUET,
    delimiter: Annotated[str | None, Query(min_length=1, max_length=1)] = None,
) -> FileResponse:
    table = state.catalog.get_table(table_id)
    staging = state.publisher.exports_dir(table.project_id) / f".{uuid.uuid4().hex}.{format.value}"
    exported = state.publisher.export(table, format, staging, delimiter=delimiter)
    return FileResponse(
        exported.path,
        media_type=_MEDIA_TYPES[format],
        filename=f"{exported.table}.{format.value}",
        background=BackgroundTask(staging.unlink, missing_ok=True),
    )
