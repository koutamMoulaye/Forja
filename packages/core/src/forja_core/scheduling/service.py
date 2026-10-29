"""Schedules of connection loads, and the scheduler that starts them.

The scheduler is a thread of the API process: every ``FORJA_SCHEDULER_TICK_SECONDS``
it starts the loads whose time has come. Run a single API instance (DuckDB allows one
writer process anyway): two instances would both start them.

- No overlap: a schedule whose connection already has a load queued or running is
  skipped until its next time.
- Catch-up: after a restart (or the machine waking up), a schedule whose time passed
  runs once, then resumes its rhythm; missed occurrences are not replayed one by one.
- The time comes from an injectable clock, so tests move it by hand.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import NotFoundError, PlanValidationError
from forja_core.jobs.models import Job
from forja_core.logging import get_logger
from forja_core.scheduling.cron import Cron
from forja_core.scheduling.models import (
    Schedule,
    ScheduleInterpretation,
    ScheduleSpec,
    ScheduleUpdate,
    TargetType,
)
from forja_core.scheduling.phrases import parse_phrase
from forja_core.utils import utcnow

log = get_logger(__name__)

Clock = Callable[[], datetime]
Launcher = Callable[[Schedule], Job]
BusyCheck = Callable[[Schedule], Job | None]


class ScheduleService:
    def __init__(self, catalog: Catalog, settings: Settings, *, clock: Clock = utcnow) -> None:
        self.catalog = catalog
        self.settings = settings
        self.clock = clock
        self.zone = ZoneInfo(settings.timezone)

    def next_runs(self, spec: ScheduleSpec, after: datetime, count: int = 1) -> list[datetime]:
        expression = spec.expression()
        if expression is None:
            return []
        cron = Cron.parse(expression)
        runs: list[datetime] = []
        moment = after
        for _ in range(count):
            moment = cron.next_after(moment, self.zone)
            runs.append(moment)
        return runs

    def interpret(self, text: str) -> ScheduleInterpretation:
        spec = parse_phrase(text)
        return ScheduleInterpretation(
            text=text.strip(),
            spec=spec,
            description=spec.describe(),
            cron=spec.expression(),
            next_runs=self.next_runs(spec, self.clock(), 3),
            timezone=self.settings.timezone,
        )

    def _check_target(self, project_id: str, target_type: TargetType, target_id: str) -> None:
        if target_type == "connection":
            if self.catalog.get_connection(target_id).project_id != project_id:
                raise NotFoundError(f"connection '{target_id}' not found in this project")
            return
        feed = self.catalog.get_feed(target_id)
        if feed is None:
            raise PlanValidationError(
                "only sources loaded from a connection can be scheduled; a file source is "
                "updated by uploading a new version",
                details={"source_id": target_id},
            )
        if self.catalog.get_connection(feed.connection_id).project_id != project_id:
            raise NotFoundError(f"source '{target_id}' not found in this project")

    def set(
        self,
        project_id: str,
        target_type: TargetType,
        target_id: str,
        update: ScheduleUpdate,
        *,
        by: str | None,
    ) -> Schedule:
        self._check_target(project_id, target_type, target_id)
        spec = update.spec if update.spec is not None else parse_phrase(update.text or "")
        now = self.clock()
        existing = self.catalog.find_schedule(target_type, target_id)
        upcoming = self.next_runs(spec, now)
        schedule = Schedule(
            id=existing.id if existing else uuid.uuid4().hex,
            project_id=project_id,
            target_type=target_type,
            target_id=target_id,
            spec=spec,
            text=update.text.strip() if update.text else None,
            timezone=self.settings.timezone,
            enabled=update.enabled,
            description=spec.describe(),
            next_run_at=upcoming[0] if upcoming and update.enabled else None,
            last_run_at=existing.last_run_at if existing else None,
            last_job_id=existing.last_job_id if existing else None,
            last_status=existing.last_status if existing else None,
            created_by=existing.created_by if existing else by,
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        self.catalog.save_schedule(schedule)
        log.info(
            "schedule_saved",
            schedule_id=schedule.id,
            target_type=target_type,
            target_id=target_id,
            cron=spec.expression(),
            next_run_at=schedule.next_run_at,
        )
        return schedule

    def get_for(self, target_type: TargetType, target_id: str) -> Schedule | None:
        return self.catalog.find_schedule(target_type, target_id)

    def delete(self, schedule_id: str) -> None:
        self.catalog.get_schedule(schedule_id)
        self.catalog.delete_schedule(schedule_id)

    def job_finished(self, job: Job) -> None:
        """Keep the last status of the schedule that started ``job``."""
        if job.params.schedule_id is None or not job.status.finished:
            return
        try:
            schedule = self.catalog.get_schedule(job.params.schedule_id)
        except NotFoundError:
            return
        if schedule.last_job_id == job.id:
            schedule.last_status = job.status.value
            self.catalog.save_schedule(schedule)


class Scheduler:
    def __init__(
        self,
        service: ScheduleService,
        launch: Launcher,
        busy: BusyCheck,
        *,
        tick_seconds: float = 30,
    ) -> None:
        self.service = service
        self.launch = launch
        self.busy = busy
        self.tick_seconds = tick_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def tick(self, now: datetime | None = None) -> list[Job]:
        """Start the loads that are due; returns the jobs created."""
        now = now or self.service.clock()
        started: list[Job] = []
        for schedule in self.service.catalog.due_schedules(now):
            try:
                active = self.busy(schedule)
                if active is not None:
                    schedule.last_status = "skipped"
                    log.info(
                        "scheduled_load_skipped",
                        schedule_id=schedule.id,
                        busy_run=active.id,
                        status=active.status.value,
                    )
                else:
                    job = self.launch(schedule)
                    started.append(job)
                    schedule.last_job_id = job.id
                    schedule.last_run_at = now
                    # An inline runner has already run it.
                    schedule.last_status = self.service.catalog.get_job(job.id).status.value
                    log.info("scheduled_load_started", schedule_id=schedule.id, job_id=job.id)
            except Exception as exc:
                schedule.last_status = "failed"
                log.exception("scheduled_load_failed", schedule_id=schedule.id, error=str(exc))
            upcoming = self.service.next_runs(schedule.spec, now)
            schedule.next_run_at = upcoming[0] if upcoming else None
            schedule.updated_at = now
            self.service.catalog.save_schedule(schedule)
        return started

    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="forja-scheduler", daemon=True)
        self._thread.start()
        log.info("scheduler_started", tick_seconds=self.tick_seconds)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception:
                log.exception("scheduler_tick_failed")
            self._stop.wait(self.tick_seconds)

    def stop(self, timeout: float | None = 10) -> None:
        if self._thread is None:
            return
        self._stop.set()
        self._thread.join(timeout)
        self._thread = None
        log.info("scheduler_stopped")
