"""Source endpoints: upload, versions, profile and preview."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status

from forja_api.schemas import PreviewResponse
from forja_api.state import AppState, StateDep
from forja_core.errors import FileTooLargeError
from forja_core.models import IngestMode, Source, SourceVersion
from forja_core.preview import read_preview
from forja_core.profiling.models import ProfileReport

router = APIRouter(tags=["sources"])

_CHUNK_SIZE = 1024 * 1024


def _stage_and_ingest(
    state: AppState,
    project_id: str,
    file: UploadFile,
    *,
    mode: IngestMode,
    target_source_id: str | None,
) -> list[Source]:
    state.catalog.get_project(project_id)
    filename = Path(file.filename or "upload").name
    staging_dir = state.workspace.staging_dir(project_id)
    staging_dir.mkdir(parents=True, exist_ok=True)
    staged = staging_dir / f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"

    limit = state.settings.max_upload_bytes
    try:
        size = 0
        with staged.open("wb") as out:
            while chunk := file.file.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > limit:
                    raise FileTooLargeError(
                        f"file exceeds the {state.settings.max_upload_mb} MB upload limit"
                    )
                out.write(chunk)
        return state.ingestion.ingest_file(
            project_id, staged, filename, mode=mode, target_source_id=target_source_id
        )
    finally:
        staged.unlink(missing_ok=True)


@router.post(
    "/projects/{project_id}/sources",
    status_code=status.HTTP_201_CREATED,
    summary="Upload a CSV, Excel, Parquet or JSON file into the Bronze layer",
)
def upload_source(
    project_id: str,
    file: Annotated[UploadFile, File()],
    state: StateDep,
    mode: Annotated[
        IngestMode,
        Query(
            description=(
                "auto: new version of the source with the same logical name, or new source; "
                "new_source: always a new source; new_version: fail if no such source exists"
            )
        ),
    ] = IngestMode.AUTO,
    source_id: Annotated[
        str | None, Query(description="Source receiving the new version (implies new_version)")
    ] = None,
) -> list[Source]:
    return _stage_and_ingest(state, project_id, file, mode=mode, target_source_id=source_id)


@router.post(
    "/sources/{source_id}/versions",
    status_code=status.HTTP_201_CREATED,
    summary="Upload a new version of an existing source",
)
def upload_version(source_id: str, file: Annotated[UploadFile, File()], state: StateDep) -> Source:
    source = state.catalog.get_source(source_id)
    [updated] = _stage_and_ingest(
        state, source.project_id, file, mode=IngestMode.NEW_VERSION, target_source_id=source_id
    )
    return updated


@router.get("/projects/{project_id}/sources")
def list_sources(project_id: str, state: StateDep) -> list[Source]:
    return state.catalog.list_sources(project_id)


@router.get("/sources/{source_id}")
def get_source(source_id: str, state: StateDep) -> Source:
    return state.catalog.get_source(source_id)


@router.get("/sources/{source_id}/versions", summary="Versions with their schema drift")
def list_versions(source_id: str, state: StateDep) -> list[SourceVersion]:
    return state.catalog.list_versions(source_id)


@router.get("/sources/{source_id}/profile")
def get_profile(
    source_id: str,
    state: StateDep,
    version: Annotated[int | None, Query(ge=1, description="Defaults to the latest")] = None,
) -> ProfileReport:
    return state.catalog.get_profile(source_id, version=version)


@router.get("/sources/{source_id}/preview")
def preview_source(
    source_id: str,
    state: StateDep,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 100,
) -> PreviewResponse:
    source = state.catalog.get_source(source_id)
    limit = min(limit, state.settings.preview_max_rows)
    preview = read_preview(state.workspace.resolve(source.bronze_path), limit)
    return PreviewResponse(
        source_id=source.id,
        columns=preview.columns,
        rows=preview.rows,
        limit=limit,
        total_rows=preview.total_rows,
    )
