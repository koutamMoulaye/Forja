"""Chunked, resumable uploads of large files (see forja_core.ingestion.uploads)."""

from __future__ import annotations

import io
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from fastapi.concurrency import run_in_threadpool

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.errors import ConflictError, FileTooLargeError
from forja_core.ingestion.uploads import UploadIncompleteError
from forja_core.jobs.models import Job, JobType, RunRequest
from forja_core.models import UploadCreate, UploadSession, UploadStatus

router = APIRouter(tags=["sources"])

WriteAccess = Annotated[Access, require(Action.SOURCE_WRITE)]


@router.post(
    "/projects/{project_id}/uploads",
    status_code=status.HTTP_201_CREATED,
    summary="Open a chunked upload (or resume the unfinished one of the same file)",
)
def create_upload(
    project_id: str, request: UploadCreate, state: StateDep, access: WriteAccess
) -> UploadSession:
    return state.uploads.create(project_id, request, created_by=access.principal.id)


@router.get("/uploads/{upload_id}", summary="Where an upload stands: bytes received, run")
def get_upload(upload_id: str, state: StateDep, _access: WriteAccess) -> UploadSession:
    return state.uploads.get(upload_id)


@router.put(
    "/uploads/{upload_id}/chunks",
    summary="Send the next chunk (raw bytes) at the offset where the received data ends",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
async def put_chunk(
    upload_id: str,
    request: Request,
    state: StateDep,
    _access: WriteAccess,
    offset: Annotated[int, Query(ge=0)],
) -> UploadSession:
    session = await run_in_threadpool(state.uploads.get, upload_id)
    declared = request.headers.get("content-length")
    if declared is not None and int(declared) > session.chunk_size:
        raise FileTooLargeError(
            f"a chunk holds at most {session.chunk_size} bytes",
            details={"chunk_size": session.chunk_size},
        )
    body = bytearray()
    async for part in request.stream():
        body.extend(part)
        if len(body) > session.chunk_size:
            raise FileTooLargeError(
                f"a chunk holds at most {session.chunk_size} bytes",
                details={"chunk_size": session.chunk_size},
            )
    return await run_in_threadpool(state.uploads.append, upload_id, offset, io.BytesIO(body))


@router.post(
    "/uploads/{upload_id}/complete",
    status_code=status.HTTP_202_ACCEPTED,
    summary="The file is complete: ingest it in a run (streamed into Bronze, then profiled)",
)
def complete_upload(upload_id: str, state: StateDep, access: WriteAccess) -> Job:
    session = state.uploads.get(upload_id)
    if session.status is UploadStatus.RECEIVING:
        raise UploadIncompleteError(
            f"{session.received} of {session.size} bytes received",
            details={"received": session.received, "size": session.size},
        )
    if session.status is not UploadStatus.COMPLETE or session.job_id is not None:
        if session.job_id is not None:
            return state.catalog.get_job(session.job_id)
        raise ConflictError(f"upload is {session.status.value}")
    job = state.executor.create(
        session.project_id,
        RunRequest(type=JobType.INGEST, upload_id=session.id),
        created_by=access.principal.id,
    )
    state.uploads.mark(session, UploadStatus.COMPLETE, job_id=job.id)
    state.runner.submit(job.id)
    access.audit(
        "source.upload",
        object_type="upload",
        object_id=session.id,
        details={"filename": session.filename, "size": session.size, "run_id": job.id},
    )
    return state.catalog.get_job(job.id)


@router.delete("/uploads/{upload_id}", summary="Abandon an upload and delete what was received")
def cancel_upload(upload_id: str, state: StateDep, _access: WriteAccess) -> UploadSession:
    return state.uploads.cancel(upload_id)
