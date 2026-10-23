"""LLM calls as jobs: results, progress, token usage, cache, cancellation and resumption."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from pydantic import BaseModel

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.errors import ConflictError
from forja_core.jobs.models import Job, JobStatus, JobType, RunMetrics, RunRequest
from forja_core.jobs.runner import ThreadJobRunner
from forja_core.jobs.scope import report
from forja_core.models import Project, ProjectCreate
from forja_llm import LLMProvider, LLMRequest, LLMSafeContext, LLMSettings
from forja_llm.base import Completion


class _Answer(BaseModel):
    tables: list[str]


class _Slow(LLMProvider):
    """Answers after ``release`` is set, like a local model reading a long prompt."""

    name = "slow"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(LLMSettings(model="m", max_attempts=1), **kwargs)
        self.release = threading.Event()
        self.started = threading.Event()
        self.calls = 0
        self.aborted = False

    def _complete(
        self, *, system: str, prompt: str, response_schema: dict[str, Any], schema_name: str
    ) -> Completion:
        self.calls += 1
        self.started.set()
        self.release.wait(10)
        return Completion('{"tables": ["fct_ventes"]}', 1200, 80)

    def _abort(self) -> None:
        self.aborted = True
        self.release.set()


@pytest.fixture
def state(settings: Settings) -> Iterator[AppState]:
    app_state = AppState.build(settings.model_copy(update={"job_runner": "inline"}))
    yield app_state
    app_state.close()


@pytest.fixture
def demo(state: AppState) -> Project:
    return state.catalog.create_project(ProjectCreate(name="Ventes"))


def _context() -> LLMSafeContext:
    return LLMSafeContext(project_name="P", architecture="medallion", sources=[])  # type: ignore[arg-type]


def _llm_handler(
    provider: LLMProvider, project: Project
) -> Callable[[Job, Callable[[str], None]], RunMetrics]:
    def handler(job: Job, _log: Callable[[str], None]) -> RunMetrics:
        report("llm", "appel du modèle", 30)
        answer = provider.generate(
            LLMRequest(task="Propose", context=_context(), project_id=project.id), _Answer
        )
        job.result = {"tables": answer.tables}
        return RunMetrics()

    return handler


def test_llm_job_result_progress_and_usage(state: AppState, demo: Project) -> None:
    provider = _Slow(journal=state.catalog.add_llm_call, cache=state.catalog)
    provider.release.set()
    state.executor.register(JobType.GOLD_PROPOSAL, _llm_handler(provider, demo))
    job = state.executor.create(demo.id, RunRequest(type=JobType.GOLD_PROPOSAL))
    state.runner.submit(job.id)
    done = state.catalog.get_job(job.id)
    assert done.status is JobStatus.SUCCEEDED
    assert done.result == {"tables": ["fct_ventes"]}
    assert done.progress is not None and done.progress.step == "llm"
    assert done.metrics is not None
    [usage] = done.metrics.llm_calls
    assert (usage.input_tokens, usage.output_tokens, usage.cached) == (1200, 80, False)
    assert usage.duration_ms >= 0
    [call] = state.catalog.list_llm_calls(demo.id, job_id=job.id)
    assert call.job_id == job.id

    # Same prompt: answered from the cache, no new call.
    again = state.executor.create(demo.id, RunRequest(type=JobType.GOLD_PROPOSAL))
    state.runner.submit(again.id)
    cached = state.catalog.get_job(again.id)
    assert cached.result == {"tables": ["fct_ventes"]}
    assert provider.calls == 1
    assert cached.metrics is not None and cached.metrics.llm_calls[0].cached


def test_cache_key_depends_on_the_context(state: AppState) -> None:
    provider = _Slow(cache=state.catalog)
    provider.release.set()
    request = LLMRequest(task="Propose", context=_context())
    provider.generate(request, _Answer)
    provider.generate(request, _Answer)
    other = LLMSafeContext(project_name="Q", architecture="medallion", sources=[])  # type: ignore[arg-type]
    provider.generate(LLMRequest(task="Propose", context=other), _Answer)
    assert provider.calls == 2
    no_cache = _Slow(cache=None)
    no_cache.release.set()
    no_cache.generate(request, _Answer)
    no_cache.generate(request, _Answer)
    assert no_cache.calls == 2


def test_cancel_a_running_llm_job(state: AppState, demo: Project) -> None:
    provider = _Slow(journal=state.catalog.add_llm_call)
    state.executor.register(JobType.GOLD_PROPOSAL, _llm_handler(provider, demo))
    runner = ThreadJobRunner(state.executor)
    runner.start()
    try:
        job = state.executor.create(demo.id, RunRequest(type=JobType.GOLD_PROPOSAL))
        runner.submit(job.id)
        assert provider.started.wait(5)
        started = time.monotonic()
        state.executor.cancel(job.id)
        runner.join()
    finally:
        runner.stop(timeout=5)
    done = state.catalog.get_job(job.id)
    assert done.status is JobStatus.CANCELLED
    assert time.monotonic() - started < 3
    assert provider.aborted  # the connection to the provider was dropped
    [call] = state.catalog.list_llm_calls(demo.id, job_id=job.id)
    assert call.status == "cancelled"
    with pytest.raises(ConflictError):
        state.executor.cancel(job.id)


def test_cancel_a_queued_job_and_not_a_running_build(state: AppState, demo: Project) -> None:
    queued = state.executor.create(demo.id, RunRequest(type=JobType.BUILD_SILVER))
    assert state.executor.cancel(queued.id).status is JobStatus.CANCELLED
    assert state.executor.execute(queued.id).status is JobStatus.CANCELLED  # never runs

    running = state.executor.create(demo.id, RunRequest(type=JobType.BUILD_SILVER))
    running.status = JobStatus.RUNNING
    state.catalog.save_job(running)
    with pytest.raises(ConflictError, match="cannot be cancelled"):
        state.executor.cancel(running.id)


def test_interrupted_llm_jobs_resume_and_builds_fail(state: AppState, demo: Project) -> None:
    provider = _Slow()
    provider.release.set()
    state.executor.register(JobType.GOLD_PROPOSAL, _llm_handler(provider, demo))
    llm_job = state.executor.create(demo.id, RunRequest(type=JobType.GOLD_PROPOSAL))
    build = state.executor.create(demo.id, RunRequest(type=JobType.BUILD_SILVER))
    exhausted = state.executor.create(demo.id, RunRequest(type=JobType.GOLD_PROPOSAL))
    for job, attempts in ((llm_job, 1), (build, 1), (exhausted, 3)):
        job.status, job.attempts = JobStatus.RUNNING, attempts
        state.catalog.save_job(job)

    runner = ThreadJobRunner(state.executor)
    runner.start()  # e.g. after a restart or once the machine wakes up
    runner.join()
    runner.stop(timeout=5)

    resumed = state.catalog.get_job(llm_job.id)
    assert resumed.status is JobStatus.SUCCEEDED and resumed.attempts == 2
    assert "queued again to resume" in state.catalog.job_logs(llm_job.id)
    assert state.catalog.get_job(build.id).status is JobStatus.FAILED
    assert state.catalog.get_job(exhausted.id).status is JobStatus.FAILED
