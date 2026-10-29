"""Persistence of mart requests (the agent conversations and their versions)."""

from __future__ import annotations

from forja_core.agent.models import MartRequest, MartStatus
from forja_core.catalog.base import to_db_timestamp
from forja_core.catalog.semantic import SemanticMixin
from forja_core.errors import NotFoundError


class MartRequestNotFoundError(NotFoundError):
    code = "mart_request_not_found"


class MartsMixin(SemanticMixin):
    def save_mart_request(self, request: MartRequest) -> MartRequest:
        self._execute(
            "INSERT INTO mart_requests VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET status = excluded.status, data = excluded.data, "
            "updated_at = excluded.updated_at",
            [
                request.id,
                request.project_id,
                request.owner_id,
                request.status.value,
                request.model_dump_json(),
                to_db_timestamp(request.created_at),
                to_db_timestamp(request.updated_at),
            ],
        )
        return request

    def get_mart_request(self, mart_id: str) -> MartRequest:
        row = self._fetchone("SELECT data FROM mart_requests WHERE id = ?", [mart_id])
        if row is None:
            raise MartRequestNotFoundError(f"mart request '{mart_id}' not found")
        return MartRequest.model_validate_json(row[0])

    def list_mart_requests(
        self,
        project_id: str,
        *,
        owner_id: str | None = None,
        status: MartStatus | None = None,
        limit: int | None = None,
        offset: int = 0,
        recent_first: bool = False,
    ) -> list[MartRequest]:
        """Requests of a project, newest first; most recently updated first with
        ``recent_first`` (the lists of the interface)."""
        self.get_project(project_id)
        order = "updated_at" if recent_first else "created_at"
        rows = self._fetchall(
            "SELECT data FROM mart_requests WHERE project_id = ? "
            "AND (? IS NULL OR owner_id = ?) AND (? IS NULL OR status = ?) "
            f"ORDER BY {order} DESC, id LIMIT ? OFFSET ?",
            [project_id, owner_id, owner_id, status, status, limit, offset],
        )
        return [MartRequest.model_validate_json(r[0]) for r in rows]

    def count_mart_requests(
        self, project_id: str, *, owner_id: str | None = None, status: MartStatus | None = None
    ) -> int:
        row = self._fetchone(
            "SELECT count(*) FROM mart_requests WHERE project_id = ? "
            "AND (? IS NULL OR owner_id = ?) AND (? IS NULL OR status = ?)",
            [project_id, owner_id, owner_id, status, status],
        )
        return int(row[0]) if row else 0
