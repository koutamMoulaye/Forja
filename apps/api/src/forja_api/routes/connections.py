"""Connections to databases and REST APIs, their loads and schedules.

Reserved to admins and engineers (``connection.manage``). Credentials go in, never out:
responses only list which secret fields are set. Every action is audited, without
parameter values that could hold a credential.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, ConfigDict, Field

from forja_api.security import Access, require
from forja_api.state import AppState, StateDep
from forja_core.auth.models import Action
from forja_core.connectors.models import (
    ApiPreview,
    ApiPreviewRequest,
    Connection,
    ConnectionCreate,
    ConnectionTest,
    ConnectionUpdate,
    DatabaseExploration,
    ImportRequest,
    SourceFeed,
)
from forja_core.errors import NotFoundError
from forja_core.jobs.models import Job, JobType, RunRequest
from forja_core.scheduling.models import (
    Schedule,
    ScheduleInterpretation,
    ScheduleParseRequest,
    ScheduleUpdate,
    TargetType,
)

router = APIRouter(tags=["connections"])

ManageAccess = Annotated[Access, require(Action.CONNECTION_MANAGE)]


class ConnectionView(Connection):
    schedule: Schedule | None = None
    active_run: Job | None = Field(default=None, description="Load queued or running")
    last_loaded_at: datetime | None = Field(default=None, description="Latest load of its sources")


class LoadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_ids: list[str] | None = Field(
        default=None, description="Sources to load; every source of the connection by default"
    )
    chain: bool = Field(
        default=False,
        description="Then rebuild Silver, Gold, the published data marts and serving with the "
        "approved plans, as a scheduled load does",
    )


class ImportResponse(BaseModel):
    feeds: list[SourceFeed]
    run: Job | None = Field(default=None, description="The first load, if started")


class ProjectSchedules(BaseModel):
    timezone: str
    schedules: list[Schedule]


def _view(state: AppState, connection: Connection) -> ConnectionView:
    loaded = [s.last_loaded_at for s in connection.sources if s.last_loaded_at is not None]
    return ConnectionView(
        **connection.model_dump(),
        schedule=state.schedules.get_for("connection", connection.id),
        active_run=state.connectors.active_load(connection.id),
        last_loaded_at=max(loaded) if loaded else None,
    )


def _start_load(
    state: AppState, access: Access, connection: Connection, request: LoadRequest
) -> Job:
    state.connectors.check_idle(connection.id)
    job = state.executor.create(
        connection.project_id,
        RunRequest(
            type=JobType.LOAD,
            connection_id=connection.id,
            source_ids=request.source_ids,
            chain=request.chain,
        ),
        created_by=access.principal.id,
    )
    state.runner.submit(job.id)
    access.audit(
        "connection.load",
        object_type="connection",
        object_id=connection.id,
        details={"run_id": job.id, "sources": request.source_ids, "chain": request.chain},
    )
    return state.catalog.get_job(job.id)


@router.get("/projects/{project_id}/connections", summary="Connections of a project")
def list_connections(
    project_id: str, state: StateDep, _access: ManageAccess
) -> list[ConnectionView]:
    return [_view(state, c) for c in state.connectors.list_connections(project_id)]


@router.post(
    "/projects/{project_id}/connections",
    status_code=status.HTTP_201_CREATED,
    summary="Create a connection (credentials are encrypted and never returned)",
)
def create_connection(
    project_id: str, request: ConnectionCreate, state: StateDep, access: ManageAccess
) -> ConnectionView:
    connection = state.connectors.create(project_id, request, created_by=access.principal.id)
    access.audit(
        "connection.create",
        object_type="connection",
        object_id=connection.id,
        details={"name": connection.name, "type": connection.type.value},
    )
    return _view(state, connection)


@router.post(
    "/projects/{project_id}/connections/test",
    summary="Try a configuration before saving it",
)
def test_draft_connection(
    project_id: str, request: ConnectionCreate, state: StateDep, access: ManageAccess
) -> ConnectionTest:
    result = state.connectors.test_draft(project_id, request)
    access.audit(
        "connection.test",
        object_type="project",
        object_id=project_id,
        details={"type": request.type.value, "ok": result.ok, "saved": False},
    )
    return result


@router.post(
    "/projects/{project_id}/connections/preview",
    summary="First page of a REST API endpoint, flattened into tables",
)
def preview_api(
    project_id: str, request: ApiPreviewRequest, state: StateDep, access: ManageAccess
) -> ApiPreview:
    scratch = state.workspace.staging_dir(project_id)
    preview = state.connectors.preview_api(project_id, request, scratch)
    access.audit(
        "connection.preview",
        object_type="project",
        object_id=project_id,
        details={"endpoint": preview.endpoint, "records": preview.record_count},
    )
    return preview


@router.get("/connections/{connection_id}")
def get_connection(connection_id: str, state: StateDep, _access: ManageAccess) -> ConnectionView:
    return _view(state, state.connectors.get(connection_id))


@router.patch("/connections/{connection_id}", summary="Change a connection")
def update_connection(
    connection_id: str, update: ConnectionUpdate, state: StateDep, access: ManageAccess
) -> ConnectionView:
    connection = state.connectors.update(connection_id, update)
    access.audit(
        "connection.update",
        object_type="connection",
        object_id=connection_id,
        details={
            "name": update.name is not None,
            "params": update.params is not None,
            "secrets_changed": sorted(update.secrets),
        },
    )
    return _view(state, connection)


@router.delete(
    "/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a connection; its sources stay, with their versions",
)
def delete_connection(connection_id: str, state: StateDep, access: ManageAccess) -> Response:
    detached = state.connectors.delete(connection_id)
    access.audit(
        "connection.delete",
        object_type="connection",
        object_id=connection_id,
        details={"detached_sources": detached},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/connections/{connection_id}/test", summary="Test a saved connection")
def test_connection(connection_id: str, state: StateDep, access: ManageAccess) -> ConnectionTest:
    result = state.connectors.test(connection_id)
    access.audit(
        "connection.test",
        object_type="connection",
        object_id=connection_id,
        details={"ok": result.ok, "saved": True},
    )
    return result


@router.get(
    "/connections/{connection_id}/explore",
    summary="Schemas, tables, columns, estimated rows and cursor candidates of a database",
)
def explore_connection(
    connection_id: str, state: StateDep, access: ManageAccess
) -> DatabaseExploration:
    exploration = state.connectors.explore(connection_id)
    access.audit(
        "connection.explore",
        object_type="connection",
        object_id=connection_id,
        details={"tables": len(exploration.tables)},
    )
    return exploration


@router.post(
    "/connections/{connection_id}/import",
    status_code=status.HTTP_201_CREATED,
    summary="Select tables or endpoints to load into sources",
)
def import_objects(
    connection_id: str, request: ImportRequest, state: StateDep, access: ManageAccess
) -> ImportResponse:
    connection = state.catalog.get_connection(connection_id)
    feeds = state.connectors.import_objects(connection_id, request)
    access.audit(
        "connection.import",
        object_type="connection",
        object_id=connection_id,
        details={
            "objects": [f.object.label for f in feeds],
            "modes": [f.mode.value for f in feeds],
        },
    )
    run = None
    if request.load_now:
        run = _start_load(state, access, connection, LoadRequest())
    return ImportResponse(feeds=feeds, run=run)


@router.post(
    "/connections/{connection_id}/load",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Load the connection's sources now",
)
def load_connection(
    connection_id: str, request: LoadRequest, state: StateDep, access: ManageAccess
) -> Job:
    connection = state.catalog.get_connection(connection_id)
    return _start_load(state, access, connection, request)


# --- schedules ------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/schedules/interpret",
    summary="What a schedule typed in plain French means, with its next runs",
)
def interpret_schedule(
    project_id: str, request: ScheduleParseRequest, state: StateDep, _access: ManageAccess
) -> ScheduleInterpretation:
    return state.schedules.interpret(request.text)


@router.get(
    "/projects/{project_id}/schedules",
    summary="Schedules of the project, next run first",
)
def list_schedules(
    project_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.SOURCE_READ)],
) -> ProjectSchedules:
    return ProjectSchedules(
        timezone=state.settings.timezone, schedules=state.catalog.list_schedules(project_id)
    )


def _set_schedule(
    state: AppState,
    access: Access,
    target_type: TargetType,
    target_id: str,
    update: ScheduleUpdate,
) -> Schedule:
    schedule = state.schedules.set(
        access.project_id, target_type, target_id, update, by=access.principal.id
    )
    access.audit(
        "schedule.set",
        object_type=target_type,
        object_id=target_id,
        details={
            "schedule_id": schedule.id,
            "cron": schedule.spec.expression(),
            "enabled": schedule.enabled,
        },
    )
    return schedule


def _delete_schedule(
    state: AppState, access: Access, target_type: Literal["source", "connection"], target_id: str
) -> Response:
    schedule = state.schedules.get_for(target_type, target_id)
    if schedule is None:
        raise NotFoundError("no schedule to delete")
    state.schedules.delete(schedule.id)
    access.audit(
        "schedule.delete",
        object_type=target_type,
        object_id=target_id,
        details={"schedule_id": schedule.id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/connections/{connection_id}/schedule")
def get_connection_schedule(
    connection_id: str, state: StateDep, _access: ManageAccess
) -> Schedule | None:
    return state.schedules.get_for("connection", connection_id)


@router.put(
    "/connections/{connection_id}/schedule",
    summary="Schedule the loads of every source of the connection",
)
def set_connection_schedule(
    connection_id: str, update: ScheduleUpdate, state: StateDep, access: ManageAccess
) -> Schedule:
    return _set_schedule(state, access, "connection", connection_id, update)


@router.delete("/connections/{connection_id}/schedule", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection_schedule(
    connection_id: str, state: StateDep, access: ManageAccess
) -> Response:
    return _delete_schedule(state, access, "connection", connection_id)


@router.get("/sources/{source_id}/schedule")
def get_source_schedule(
    source_id: str,
    state: StateDep,
    _access: Annotated[Access, require(Action.SOURCE_READ)],
) -> Schedule | None:
    return state.schedules.get_for("source", source_id)


@router.put(
    "/sources/{source_id}/schedule",
    summary="Schedule the loads of one source loaded from a connection",
)
def set_source_schedule(
    source_id: str, update: ScheduleUpdate, state: StateDep, access: ManageAccess
) -> Schedule:
    return _set_schedule(state, access, "source", source_id, update)


@router.delete("/sources/{source_id}/schedule", status_code=status.HTTP_204_NO_CONTENT)
def delete_source_schedule(source_id: str, state: StateDep, access: ManageAccess) -> Response:
    return _delete_schedule(state, access, "source", source_id)
