"""Pipeline graph endpoint: everything the canvas draws, in one call."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Response, status

from forja_api.security import Access, require
from forja_api.state import StateDep
from forja_core.auth.models import Action
from forja_core.graph.builder import GraphScope, build_graph
from forja_core.graph.models import ProjectGraph

router = APIRouter(tags=["graph"])


@router.get(
    "/projects/{project_id}/graph",
    response_model=ProjectGraph,
    responses={status.HTTP_304_NOT_MODIFIED: {"description": "Graph unchanged since the ETag"}},
)
def get_graph(
    project_id: str,
    response: Response,
    state: StateDep,
    access: Annotated[Access, require(Action.PROJECT_READ)],
    if_none_match: Annotated[str | None, Header()] = None,
) -> ProjectGraph | Response:
    scope = GraphScope(
        technical=access.can(Action.SILVER_READ),
        all_marts=access.can(Action.MART_READ_ALL),
        user_id=access.principal.id,
        all_runs=access.can(Action.RUN_READ),
    )
    graph = build_graph(
        state.catalog,
        project_id,
        exports_dir=state.publisher.exports_dir(project_id),
        scope=scope,
    )
    etag = f'"{graph.version}"'
    if if_none_match is not None and etag in {t.strip() for t in if_none_match.split(",")}:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-cache"
    return graph
