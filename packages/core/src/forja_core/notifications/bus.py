"""In-process event bus between the services (worker threads) and the open event streams.

Each stream subscribes with the caller (identity and roles); an event reaches it when it
is addressed to that user, or when it concerns a project where the user may perform the
event's action (read runs) or owns the object (their own agent request). Publishing
never blocks: a stream too slow to keep up is closed and reconnects, then refetches what
it missed.
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass
from typing import Any

from forja_core.auth.models import Action, Principal
from forja_core.logging import get_logger

log = get_logger(__name__)

QUEUE_SIZE = 500


@dataclass(frozen=True)
class Event:
    """``type`` is the SSE event name (``notification``, ``job``); ``data`` its JSON body."""

    type: str
    data: dict[str, Any]
    user_id: str | None = None
    project_id: str | None = None
    action: Action | None = None
    owner_id: str | None = None


class Subscription:
    def __init__(
        self,
        bus: EventBus,
        principal: Principal,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        self.bus = bus
        self.principal = principal
        self.user_id = principal.id
        self.loop = loop
        self.queue: asyncio.Queue[Event | None] = asyncio.Queue(QUEUE_SIZE)
        self.closed = False

    def wants(self, event: Event) -> bool:
        if event.user_id is not None:
            return event.user_id == self.user_id
        if event.project_id is None or self.principal.role(event.project_id) is None:
            return False
        if event.owner_id is not None and event.owner_id == self.user_id:
            return True
        return event.action is None or self.principal.can(event.project_id, event.action)

    def _put(self, event: Event | None) -> None:
        if self.closed:
            return
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("event_stream_overflow", user_id=self.user_id)
            self.closed = True
            while not self.queue.empty():
                self.queue.get_nowait()
            self.queue.put_nowait(None)

    def deliver(self, event: Event | None) -> None:
        try:
            self.loop.call_soon_threadsafe(self._put, event)
        except RuntimeError:  # the loop is closed: the stream is gone
            self.closed = True

    async def next(self, timeout: float) -> Event | None:
        """The next event, ``None`` when the stream must end; TimeoutError when idle."""
        return await asyncio.wait_for(self.queue.get(), timeout)

    def close(self) -> None:
        self.bus.unsubscribe(self)


class EventBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscriptions: set[Subscription] = set()

    def subscribe(self, principal: Principal, loop: asyncio.AbstractEventLoop) -> Subscription:
        subscription = Subscription(self, principal, loop)
        with self._lock:
            self._subscriptions.add(subscription)
        return subscription

    def unsubscribe(self, subscription: Subscription) -> None:
        with self._lock:
            self._subscriptions.discard(subscription)

    @property
    def subscribers(self) -> int:
        with self._lock:
            return len(self._subscriptions)

    def publish(self, event: Event) -> None:
        with self._lock:
            targets = [s for s in self._subscriptions if not s.closed]
        for subscription in targets:
            if subscription.wants(event):
                subscription.deliver(event)

    def close(self) -> None:
        """Ends every stream (shutdown)."""
        with self._lock:
            targets = list(self._subscriptions)
            self._subscriptions.clear()
        for subscription in targets:
            subscription.deliver(None)
