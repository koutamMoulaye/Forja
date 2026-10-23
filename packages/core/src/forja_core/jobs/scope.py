"""What a running job exposes to the code it calls: cancellation and progress.

The executor opens a :class:`JobScope` around each handler. Deep callees (the LLM
providers, the agent) read it with :func:`current_scope` instead of receiving a
token through every signature; outside a job there is no scope and nothing can be
cancelled.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

from forja_core.errors import ForjaError


class JobCancelledError(ForjaError):
    code = "run_cancelled"


@dataclass
class JobScope:
    job_id: str
    project_id: str
    cancelled: threading.Event = field(default_factory=threading.Event)
    on_progress: Callable[[str, str, int], None] | None = None

    def check(self) -> None:
        """Raise if the job was cancelled; call it between steps."""
        if self.cancelled.is_set():
            raise JobCancelledError("the run was cancelled")

    def progress(self, step: str, message: str = "", percent: int = 0) -> None:
        self.check()
        if self.on_progress is not None:
            self.on_progress(step, message, percent)


_SCOPE: ContextVar[JobScope | None] = ContextVar("forja_job_scope", default=None)


def current_scope() -> JobScope | None:
    return _SCOPE.get()


@contextmanager
def job_scope(scope: JobScope) -> Iterator[JobScope]:
    token = _SCOPE.set(scope)
    try:
        yield scope
    finally:
        _SCOPE.reset(token)


def report(step: str, message: str = "", percent: int = 0) -> None:
    """Progress of the current job, if any."""
    scope = current_scope()
    if scope is not None:
        scope.progress(step, message, percent)


def check_cancelled() -> None:
    scope = current_scope()
    if scope is not None:
        scope.check()
