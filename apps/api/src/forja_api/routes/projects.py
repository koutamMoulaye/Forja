"""Project endpoints."""

from __future__ import annotations

from fastapi import APIRouter, status

from forja_api.state import StateDep
from forja_core.models import Project, ProjectCreate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, state: StateDep) -> Project:
    project = state.catalog.create_project(payload)
    state.workspace.ensure_project(project.id)
    return project


@router.get("")
def list_projects(state: StateDep) -> list[Project]:
    return state.catalog.list_projects()
