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
from forja_core.jobs.models import JobProgress


class JobCancelledError(ForjaError):
    code = "run_cancelled"


@dataclass
class JobScope:
    job_id: str
    project_id: str
    cancelled: threading.Event = field(default_factory=threading.Event)
    on_progress: Callable[[JobProgress, bool], None] | None = None
    """Receives the progress and whether its message belongs in the run logs."""
    state: JobProgress = field(default_factory=lambda: JobProgress(step=""))
    window: tuple[int, int] = (0, 100)
    """Share of the run's percentage given to the current stage (see :meth:`stage`)."""

    def check(self) -> None:
        """Raise if the job was cancelled; call it between steps."""
        if self.cancelled.is_set():
            raise JobCancelledError("the run was cancelled")

    def progress(self, step: str, message: str = "", percent: int = 0) -> None:
        self.check()
        low, high = self.window
        self.state.step, self.state.message = step, message
        self.state.percent = low + (high - low) * max(0, min(100, percent)) // 100
        self._emit(log=bool(message))

    def item_started(self, name: str) -> None:
        if name not in self.state.running:
            self.state.running.append(name)
        self._emit(log=False)

    def item_finished(self, name: str, *, ok: bool) -> None:
        if name in self.state.running:
            self.state.running.remove(name)
        target = self.state.done if ok else self.state.failed
        if name not in target:
            target.append(name)
        self._emit(log=False)

    @contextmanager
    def stage(self, low: int, high: int) -> Iterator[None]:
        """Steps reported inside map their 0-100 percentage to ``low``-``high``."""
        previous, self.window = self.window, (low, high)
        try:
            yield
        finally:
            self.window = previous

    def complete(self) -> None:
        """The handler returned: a run that reported progress ends at 100 %."""
        if self.state.step:
            self.state.percent = 100
            self._emit(log=False)

    def _emit(self, *, log: bool) -> None:
        if self.on_progress is not None:
            self.on_progress(self.state.model_copy(deep=True), log)


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


def item_started(name: str) -> None:
    """A dbt model, or a source being profiled, starts in the current job."""
    scope = current_scope()
    if scope is not None:
        scope.item_started(name)


def item_finished(name: str, *, ok: bool) -> None:
    scope = current_scope()
    if scope is not None:
        scope.item_finished(name, ok=ok)


@contextmanager
def stage(low: int, high: int) -> Iterator[None]:
    scope = current_scope()
    if scope is None:
        yield
        return
    with scope.stage(low, high):
        yield


def check_cancelled() -> None:
    scope = current_scope()
    if scope is not None:
        scope.check()
