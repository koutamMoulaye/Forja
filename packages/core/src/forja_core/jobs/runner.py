"""Job runners: where and when queued jobs are executed.

``JobRunner`` is the seam for an orchestrator (Dagster, a distributed queue...):
an implementation receives job ids and must eventually call
``JobExecutor.execute`` for each of them, once.
"""

from __future__ import annotations

import queue
import threading
from abc import ABC, abstractmethod

from forja_core.jobs.executor import MAX_LLM_JOB_ATTEMPTS, JobExecutor
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
    """Local worker: two background threads, each executing its jobs one at a time.

    - the warehouse lane runs builds, exports and mart publications serially, which
      matches DuckDB's single-writer model for project warehouses;
    - the LLM lane runs Gold proposals and agent requests, which can take minutes on
      a local model and only read the catalog (and the warehouse, under its lock).
    """

    LANES = ("warehouse", "llm")

    def __init__(self, executor: JobExecutor) -> None:
        super().__init__(executor)
        self._queues: dict[str, queue.Queue[object]] = {lane: queue.Queue() for lane in self.LANES}
        self._threads: list[threading.Thread] = []

    def _lane(self, job_id: str) -> str:
        return "llm" if self.executor.catalog.get_job(job_id).type.uses_llm else "warehouse"

    def submit(self, job_id: str) -> None:
        self._queues[self._lane(job_id)].put(job_id)

    def start(self) -> None:
        if self._threads:
            return
        resumed, failed = self.executor.catalog.recover_interrupted_jobs(MAX_LLM_JOB_ATTEMPTS)
        if resumed or failed:
            log.warning("interrupted_jobs_recovered", resumed=resumed, failed=failed)
        for job_id in self.executor.catalog.queued_job_ids():
            self.submit(job_id)
        for lane, jobs in self._queues.items():
            thread = threading.Thread(
                target=self._work, args=(jobs,), name=f"forja-job-worker-{lane}", daemon=True
            )
            thread.start()
            self._threads.append(thread)
        log.info("job_worker_started", lanes=list(self.LANES))

    def stop(self, timeout: float | None = None) -> None:
        if not self._threads:
            return
        for jobs in self._queues.values():
            jobs.put(_STOP)
        for thread in self._threads:
            thread.join(timeout)
        self._threads = []
        log.info("job_worker_stopped")

    def _work(self, jobs: queue.Queue[object]) -> None:
        while True:
            item = jobs.get()
            try:
                if item is _STOP:
                    return
                assert isinstance(item, str)
                self.executor.execute(item)
            except Exception:
                log.exception("job_worker_error", job_id=item)
            finally:
                jobs.task_done()

    def join(self) -> None:
        """Block until every submitted job has been executed."""
        for jobs in self._queues.values():
            jobs.join()
