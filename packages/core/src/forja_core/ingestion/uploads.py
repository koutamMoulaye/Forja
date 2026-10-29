"""Chunked, resumable uploads of large files.

The browser opens an upload session with the file's name and size, then sends the
file in chunks of ``FORJA_UPLOAD_CHUNK_MB``, each at the offset where the server's
copy ends. After a network cut or a closed tab, the session tells where to resume.
The last chunk completes the file; it is then ingested by an ``ingest`` run (which
streams it into Bronze) and the staged copy is deleted. Unfinished sessions expire
after ``FORJA_UPLOAD_SESSION_HOURS``.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import BinaryIO

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ConflictError, FileTooLargeError, ForjaError, NotFoundError
from forja_core.ingestion.detection import detect_format
from forja_core.logging import get_logger
from forja_core.models import UploadCreate, UploadSession, UploadStatus
from forja_core.storage import Workspace
from forja_core.utils import utcnow

log = get_logger(__name__)

_COPY_BYTES = 1024 * 1024


class UploadNotFoundError(NotFoundError):
    code = "upload_not_found"


class UploadOffsetError(ConflictError):
    code = "upload_offset_mismatch"


class UploadService:
    def __init__(self, catalog: Catalog, workspace: Workspace, settings: Settings) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.settings = settings

    def _path(self, session: UploadSession) -> Path:
        return self.workspace.staging_dir(session.project_id) / "uploads" / f"{session.id}.part"

    def staged_path(self, session: UploadSession) -> Path:
        return self._path(session)

    def create(
        self, project_id: str, request: UploadCreate, *, created_by: str | None
    ) -> UploadSession:
        self.catalog.get_project(project_id)
        if request.size > self.settings.max_upload_bytes:
            raise FileTooLargeError(
                f"file exceeds the {self.settings.max_upload_mb} MB upload limit",
                details={"limit_mb": self.settings.max_upload_mb},
            )
        filename = Path(request.filename).name or "upload"
        detect_format(filename, b"")
        if request.source_id is not None:
            source = self.catalog.get_source(request.source_id)
            if source.project_id != project_id:
                raise NotFoundError(f"source '{request.source_id}' not found in this project")
        if request.fingerprint:
            for existing in self.catalog.list_uploads(project_id):
                if (
                    existing.fingerprint == request.fingerprint
                    and existing.status is UploadStatus.RECEIVING
                    and existing.size == request.size
                    and existing.created_by == created_by
                    and existing.expires_at > utcnow()
                ):
                    return self._sync(existing)
        now = utcnow()
        session = UploadSession(
            id=uuid.uuid4().hex,
            project_id=project_id,
            filename=filename,
            size=request.size,
            chunk_size=self.settings.upload_chunk_mb * 1024 * 1024,
            mode=request.mode,
            source_id=request.source_id,
            fingerprint=request.fingerprint,
            created_by=created_by,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(hours=self.settings.upload_session_hours),
        )
        path = self._path(session)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
        self.catalog.save_upload(session)
        log.info("upload_started", upload_id=session.id, project_id=project_id, size=request.size)
        return session

    def get(self, upload_id: str) -> UploadSession:
        return self._sync(self.catalog.get_upload(upload_id))

    def _sync(self, session: UploadSession) -> UploadSession:
        """The received size is what is on disk (a chunk may have been cut half-way)."""
        if session.status is not UploadStatus.RECEIVING:
            return session
        path = self._path(session)
        on_disk = path.stat().st_size if path.exists() else 0
        if on_disk != session.received:
            session.received = on_disk
            session.updated_at = utcnow()
            self.catalog.save_upload(session)
        return session

    def append(self, upload_id: str, offset: int, chunk: BinaryIO) -> UploadSession:
        """Write a chunk at ``offset``, which must be where the received data ends."""
        session = self.get(upload_id)
        if session.status is not UploadStatus.RECEIVING:
            raise ConflictError(
                f"upload is {session.status.value}", details={"status": session.status.value}
            )
        if offset != session.received:
            raise UploadOffsetError(
                f"expected a chunk at offset {session.received}, got {offset}",
                details={"received": session.received},
            )
        path = self._path(session)
        limit = session.size - session.received
        written = 0
        with path.open("ab") as out:
            while data := chunk.read(_COPY_BYTES):
                written += len(data)
                if written > limit or written > session.chunk_size:
                    out.truncate(session.received)
                    raise FileTooLargeError(
                        "the chunk goes beyond the announced size or the chunk size",
                        details={"size": session.size, "chunk_size": session.chunk_size},
                    )
                out.write(data)
        session.received += written
        session.updated_at = utcnow()
        if session.complete:
            session.status = UploadStatus.COMPLETE
        self.catalog.save_upload(session)
        return session

    def mark(
        self,
        session: UploadSession,
        status: UploadStatus,
        *,
        job_id: str | None = None,
        error: str | None = None,
    ) -> UploadSession:
        session.status = status
        session.job_id = job_id or session.job_id
        session.error = error
        session.updated_at = utcnow()
        self.catalog.save_upload(session)
        return session

    def discard(self, session: UploadSession) -> None:
        self._path(session).unlink(missing_ok=True)

    def cancel(self, upload_id: str) -> UploadSession:
        session = self.get(upload_id)
        if session.status not in (UploadStatus.RECEIVING, UploadStatus.COMPLETE):
            raise ConflictError(f"upload is {session.status.value}")
        self.discard(session)
        return self.mark(session, UploadStatus.CANCELLED)

    def purge_expired(self, now: datetime | None = None) -> int:
        """Delete the staged files of expired or finished sessions."""
        now = now or utcnow()
        removed = 0
        for session in self.catalog.list_uploads(None):
            finished = session.status in (UploadStatus.INGESTED, UploadStatus.CANCELLED)
            expired = session.status is UploadStatus.RECEIVING and session.expires_at <= now
            if (finished or expired) and self._path(session).exists():
                self.discard(session)
                removed += 1
            if expired:
                self.mark(session, UploadStatus.CANCELLED, error="expired")
        return removed


class UploadIncompleteError(ForjaError):
    code = "upload_incomplete"
