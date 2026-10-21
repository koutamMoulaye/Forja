"""Project persistence."""

from __future__ import annotations

import uuid
from typing import Any

from forja_core.catalog.base import CatalogBase, from_db_timestamp_required, to_db_timestamp
from forja_core.errors import ConflictError, ProjectNotFoundError
from forja_core.logging import get_logger
from forja_core.models import Project, ProjectCreate
from forja_core.utils import utcnow

log = get_logger(__name__)

_COLUMNS = "id, name, description, architecture, created_at"


def _project(row: tuple[Any, ...]) -> Project:
    return Project(
        id=row[0],
        name=row[1],
        description=row[2],
        architecture=row[3],
        created_at=from_db_timestamp_required(row[4]),
    )


class ProjectsMixin(CatalogBase):
    def create_project(self, payload: ProjectCreate) -> Project:
        project = Project(
            id=uuid.uuid4().hex,
            name=payload.name,
            description=payload.description,
            architecture=payload.architecture,
            created_at=utcnow(),
        )
        with self._lock:
            existing = self._fetchone(
                "SELECT id FROM projects WHERE lower(name) = lower(?)", [project.name]
            )
            if existing is not None:
                raise ConflictError(
                    f"a project named '{project.name}' already exists",
                    details={"project_id": existing[0]},
                )
            self._execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                [
                    project.id,
                    project.name,
                    project.description,
                    project.architecture.value,
                    to_db_timestamp(project.created_at),
                ],
            )
        log.info("project_created", project_id=project.id, name=project.name)
        return project

    def list_projects(self) -> list[Project]:
        rows = self._fetchall(f"SELECT {_COLUMNS} FROM projects ORDER BY created_at, name")
        return [_project(row) for row in rows]

    def get_project(self, project_id: str) -> Project:
        row = self._fetchone(f"SELECT {_COLUMNS} FROM projects WHERE id = ?", [project_id])
        if row is None:
            raise ProjectNotFoundError(f"project '{project_id}' not found")
        return _project(row)
