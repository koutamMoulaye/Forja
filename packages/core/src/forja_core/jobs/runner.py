"""Job runners: where and when queued jobs are executed.

``JobRunner`` is the seam for an orchestrator (Dagster, a distributed queue...):
an implementation receives job ids and must eventually call
``JobExecutor.execute`` for each of them, once.
"""

from __future__ import annotations

import queue
import threading
from abc import ABC, abstractmethod

from forja_core.jobs.executor import JobExecutor
from forja_core.logging import get_logger

log = get_logger(__name__)

_STOP = object()


class JobRunner(ABC):
    def __init__(self, executor: JobExecutor) -> None:
        self.executor = executor

    @abstractmethod
    def submit(self, job_id: str) -> None:
        """Schedule a queued job for execution."""

    def start(self) -> None:  # noqa: B027 - optional hook
        """Start accepting work; resubmits jobs left queued by a previous process."""

    def stop(self, timeout: float | None = None) -> None:  # noqa: B027 - optional hook
        """Stop after the running job, if any."""


class InlineJobRunner(JobRunner):
    """Executes each job synchronously in the submitting thread (tests, scripts)."""

    def submit(self, job_id: str) -> None:
        self.executor.execute(job_id)


class ThreadJobRunner(JobRunner):
    """Local worker: one background thread executing jobs one at a time, in order.

    Serial execution matches DuckDB's single-writer model for project warehouses.
    """

    def __init__(self, executor: JobExecutor) -> None:
        super().__init__(executor)
        self._queue: queue.Queue[object] = queue.Queue()
        self._thread: threading.Thread | None = None

    def submit(self, job_id: str) -> None:
        self._queue.put(job_id)

    def start(self) -> None:
        if self._thread is not None:
            return
        interrupted = self.executor.catalog.fail_interrupted_jobs()
        if interrupted:
            log.warning("interrupted_jobs_failed", count=interrupted)
        for job_id in self.executor.catalog.queued_job_ids():
            self._queue.put(job_id)
        self._thread = threading.Thread(target=self._work, name="forja-job-worker", daemon=True)
        self._thread.start()
        log.info("job_worker_started")

    def stop(self, timeout: float | None = None) -> None:
        if self._thread is None:
            return
        self._queue.put(_STOP)
        self._thread.join(timeout)
        self._thread = None
        log.info("job_worker_stopped")

    def _work(self) -> None:
        while True:
            item = self._queue.get()
            try:
                if item is _STOP:
                    return
                assert isinstance(item, str)
                self.executor.execute(item)
            except Exception:
                log.exception("job_worker_error", job_id=item)
            finally:
                self._queue.task_done()

    def join(self) -> None:
        """Block until every submitted job has been executed."""
        self._queue.join()
