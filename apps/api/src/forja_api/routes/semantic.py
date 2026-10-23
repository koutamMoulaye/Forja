"""Semantic layer endpoints: read, edit, regenerate, synonym proposals."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.semantic.models import (
    SemanticLayer,
    SemanticPatch,
    SynonymProposal,
    SynonymProposalCreate,
)
from forja_core.semantic.service import visible

router = APIRouter(tags=["semantic layer"])

ReadAccess = Annotated[Access, require(Action.SEMANTIC_READ)]
WriteAccess = Annotated[Access, require(Action.SEMANTIC_WRITE)]


@router.get(
    "/projects/{project_id}/semantic-layer",
    summary="Metrics, dimensions, hierarchies and synonyms (hidden elements for engineers only)",
)
def get_semantic_layer(
    project_id: str,
    state: StateDep,
    access: ReadAccess,
    version: Annotated[int | None, Query(ge=1)] = None,
) -> SemanticLayer:
    layer = state.catalog.get_semantic_layer(project_id, version=version)
    return layer if access.can(Action.SEMANTIC_WRITE) else visible(layer)


@router.get("/projects/{project_id}/semantic-layer/versions")
def list_semantic_versions(project_id: str, state: StateDep, _access: ReadAccess) -> list[int]:
    return state.catalog.list_semantic_versions(project_id)


@router.post(
    "/projects/{project_id}/semantic-layer/regenerate",
    summary="Regenerate from the applied Gold plan, keeping manual edits",
)
def regenerate(project_id: str, state: StateDep, access: WriteAccess) -> SemanticLayer:
    layer = state.semantic.regenerate(project_id, by=access.principal.id)
    access.audit("semantic.regenerate", object_type="semantic_layer", object_id=layer.id)
    return layer


@router.patch(
    "/projects/{project_id}/semantic-layer",
    summary="Edit labels, descriptions, synonyms or hide an element: a new version",
)
def patch_semantic_layer(
    project_id: str, patch: SemanticPatch, state: StateDep, access: WriteAccess
) -> SemanticLayer:
    layer = state.semantic.patch(project_id, patch.overrides, by=access.principal.id)
    access.audit(
        "semantic.edit",
        object_type="semantic_layer",
        object_id=layer.id,
        details={"targets": [o.target for o in patch.overrides], "version": layer.version},
    )
    return layer


@router.post(
    "/projects/{project_id}/semantic-layer/synonym-proposals",
    status_code=status.HTTP_201_CREATED,
    summary="Propose a synonym (e.g. after a clarification); an engineer reviews it",
)
def propose_synonym(
    project_id: str,
    payload: SynonymProposalCreate,
    state: StateDep,
    access: Annotated[Access, require(Action.SYNONYM_PROPOSE)],
) -> SynonymProposal:
    proposal = state.semantic.propose_synonym(
        project_id,
        payload.target,
        payload.synonym,
        by=access.principal.id,
        mart_request_id=payload.mart_request_id,
    )
    access.audit(
        "synonym.propose",
        object_type="synonym_proposal",
        object_id=proposal.id,
        details={"target": proposal.target, "synonym": proposal.synonym},
    )
    return proposal


@router.get("/projects/{project_id}/semantic-layer/synonym-proposals")
def list_synonym_proposals(
    project_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.SYNONYM_PROPOSE)],
    status_filter: Annotated[
        Literal["pending", "accepted", "rejected"] | None, Query(alias="status")
    ] = None,
) -> list[SynonymProposal]:
    proposals = state.catalog.list_synonym_proposals(project_id, status_filter)
    if access.can(Action.SYNONYM_REVIEW):
        return proposals
    return [p for p in proposals if p.proposed_by == access.principal.id]


def _review(proposal_id: str, accept: bool, state: StateDep, access: Access) -> SynonymProposal:
    proposal = state.semantic.review_synonym(proposal_id, accept=accept, by=access.principal.id)
    access.audit(
        "synonym.accept" if accept else "synonym.reject",
        object_type="synonym_proposal",
        object_id=proposal_id,
        details={"target": proposal.target, "synonym": proposal.synonym},
    )
    return proposal


@router.post("/synonym-proposals/{proposal_id}/accept", summary="Add the synonym to the layer")
def accept_synonym(
    proposal_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.SYNONYM_REVIEW)],
) -> SynonymProposal:
    return _review(proposal_id, True, state, access)


@router.post("/synonym-proposals/{proposal_id}/reject")
def reject_synonym(
    proposal_id: str,
    state: StateDep,
    access: Annotated[Access, require(Action.SYNONYM_REVIEW)],
) -> SynonymProposal:
    return _review(proposal_id, False, state, access)
