"""Notifications of the caller, and the event stream (Server-Sent Events) that pushes
them, along with the status of the runs they may follow."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from forja_api.security import PrincipalDep
from forja_api.state import StateDep
from forja_core.notifications.models import NotificationPage, ReadRequest
from forja_core.utils import utcnow

router = APIRouter(tags=["notifications"])

RETRY_MS = 3000


class ReadResult(BaseModel):
    marked: int
    unread: int


@router.get("/notifications", summary="The caller's notifications, newest first")
def list_notifications(
    state: StateDep,
    principal: PrincipalDep,
    unread_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NotificationPage:
    items, total = state.catalog.list_notifications(
        principal.id, unread_only=unread_only, limit=limit, offset=offset
    )
    return NotificationPage(
        items=items,
        total=total,
        unread=state.catalog.unread_notifications(principal.id),
        offset=offset,
        limit=limit,
    )


@router.post("/notifications/read", summary="Mark notifications as read (all when no ids)")
def read_notifications(body: ReadRequest, state: StateDep, principal: PrincipalDep) -> ReadResult:
    marked = state.catalog.mark_notifications_read(principal.id, body.ids, utcnow())
    return ReadResult(marked=marked, unread=state.catalog.unread_notifications(principal.id))


def _frame(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.get(
    "/events",
    summary="Server-Sent Events: notifications and run status changes",
    description=(
        "`text/event-stream`. Events: `ready` (unread count), `notification` (a new "
        "notification), `job` (a run the caller may follow was queued, progressed or "
        "ended). A comment line every 15 s keeps the connection open. The stream ends when "
        "the access token expires or the session is revoked; the client reconnects."
    ),
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def events(request: Request, state: StateDep, principal: PrincipalDep) -> StreamingResponse:
    subscription = state.events.subscribe(principal, asyncio.get_running_loop())
    # Ends with the access token, so that the next connection is authenticated again.
    deadline = time.monotonic() + state.settings.auth_access_token_minutes * 60
    unread = state.catalog.unread_notifications(principal.id)

    async def stream() -> AsyncIterator[str]:
        try:
            yield f"retry: {RETRY_MS}\n" + _frame("ready", {"unread": unread})
            while time.monotonic() < deadline:
                if await request.is_disconnected():
                    return
                try:
                    event = await subscription.next(state.settings.events_heartbeat_seconds)
                except TimeoutError:
                    if principal.session_id and not state.catalog.session_active(
                        principal.session_id
                    ):
                        return
                    yield ": ping\n\n"
                    continue
                if event is None:
                    return
                yield _frame(event.type, event.data)
        finally:
            subscription.close()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
