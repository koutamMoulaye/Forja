"""Relation endpoints: detection, review and manual declaration."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.relations.models import Relation, RelationCreate, RelationStatus

router = APIRouter(tags=["relations"])

ReadAccess = Annotated[Access, require(Action.RELATION_READ)]
WriteAccess = Annotated[Access, require(Action.RELATION_WRITE)]


def _audit(access: Access, action: str, relation: Relation) -> None:
    access.audit(
        action,
        object_type="relation",
        object_id=relation.id,
        details={
            "from": f"{relation.from_source}.{relation.from_column}",
            "to": f"{relation.to_source}.{relation.to_column}",
        },
    )


@router.get("/projects/{project_id}/relations")
def list_relations(
    project_id: str,
    state: StateDep,
    _access: ReadAccess,
    status_filter: Annotated[RelationStatus | None, Query(alias="status")] = None,
) -> list[Relation]:
    return state.catalog.list_relations(project_id, status_filter)


@router.post(
    "/projects/{project_id}/relations/detect",
    summary="Detect relations between the Silver tables (also run after each build_silver)",
)
def detect_relations(project_id: str, state: StateDep, _access: WriteAccess) -> list[Relation]:
    return state.relations.detector.detect(project_id)


@router.post(
    "/projects/{project_id}/relations",
    status_code=status.HTTP_201_CREATED,
    summary="Declare a relation manually; it is measured and confirmed",
)
def add_relation(
    project_id: str, payload: RelationCreate, state: StateDep, access: WriteAccess
) -> Relation:
    relation = state.relations.add(project_id, payload)
    _audit(access, "relation.declare", relation)
    return relation


@router.get("/relations/{relation_id}")
def get_relation(relation_id: str, state: StateDep, _access: ReadAccess) -> Relation:
    return state.catalog.get_relation(relation_id)


@router.post("/relations/{relation_id}/confirm")
def confirm_relation(relation_id: str, state: StateDep, access: WriteAccess) -> Relation:
    relation = state.relations.confirm(relation_id)
    _audit(access, "relation.confirm", relation)
    return relation


@router.post("/relations/{relation_id}/reject")
def reject_relation(relation_id: str, state: StateDep, access: WriteAccess) -> Relation:
    relation = state.relations.reject(relation_id)
    _audit(access, "relation.reject", relation)
    return relation
