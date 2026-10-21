"""Relation endpoints: detection, review and manual declaration."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from forja_api.state import StateDep
from forja_core.relations.models import Relation, RelationCreate, RelationStatus

router = APIRouter(tags=["relations"])


@router.get("/projects/{project_id}/relations")
def list_relations(
    project_id: str,
    state: StateDep,
    status_filter: Annotated[RelationStatus | None, Query(alias="status")] = None,
) -> list[Relation]:
    return state.catalog.list_relations(project_id, status_filter)


@router.post(
    "/projects/{project_id}/relations/detect",
    summary="Detect relations between the Silver tables (also run after each build_silver)",
)
def detect_relations(project_id: str, state: StateDep) -> list[Relation]:
    return state.relations.detector.detect(project_id)


@router.post(
    "/projects/{project_id}/relations",
    status_code=status.HTTP_201_CREATED,
    summary="Declare a relation manually; it is measured and confirmed",
)
def add_relation(project_id: str, payload: RelationCreate, state: StateDep) -> Relation:
    return state.relations.add(project_id, payload)


@router.get("/relations/{relation_id}")
def get_relation(relation_id: str, state: StateDep) -> Relation:
    return state.catalog.get_relation(relation_id)


@router.post("/relations/{relation_id}/confirm")
def confirm_relation(relation_id: str, state: StateDep) -> Relation:
    return state.relations.confirm(relation_id)


@router.post("/relations/{relation_id}/reject")
def reject_relation(relation_id: str, state: StateDep) -> Relation:
    return state.relations.reject(relation_id)
