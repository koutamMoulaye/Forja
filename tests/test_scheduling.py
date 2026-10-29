"""Schedules: cron, French phrases, and the scheduler driven by a simulated clock."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.connectors.rest import Clock
from forja_core.jobs.models import JobStatus
from forja_core.scheduling.cron import Cron, CronError
from forja_core.scheduling.models import ScheduleKind
from forja_core.scheduling.phrases import SchedulePhraseError, parse_phrase
from tests.auth import api_client
from tests.fake_api import FakeApiState, make_orders, serve

PARIS = ZoneInfo("Europe/Paris")


@pytest.mark.parametrize(
    ("text", "kind", "cron", "description"),
    [
        ("tous les jours à 6 h", ScheduleKind.DAILY, "0 6 * * *", "Tous les jours à 06:00"),
        ("Chaque jour à 6h30", ScheduleKind.DAILY, "30 6 * * *", "Tous les jours à 06:30"),
        ("quotidien", ScheduleKind.DAILY, "0 6 * * *", "Tous les jours à 06:00"),
        ("à midi", ScheduleKind.DAILY, "0 12 * * *", "Tous les jours à 12:00"),
        ("7 h du soir", ScheduleKind.DAILY, "0 19 * * *", "Tous les jours à 19:00"),
        ("toutes les heures", ScheduleKind.HOURLY, "0 * * * *", "Toutes les heures"),
        (
            "toutes les heures à la minute 15",
            ScheduleKind.HOURLY,
            "15 * * * *",
            "Toutes les heures, à la minute 15",
        ),
        ("toutes les 2 heures", ScheduleKind.CRON, "0 */2 * * *", "Toutes les 2 heures"),
        ("toutes les 15 minutes", ScheduleKind.CRON, "*/15 * * * *", "Toutes les 15 minutes"),
        (
            "du lundi au vendredi à 7h30",
            ScheduleKind.WEEKLY,
            "30 7 * * 1,2,3,4,5",
            "Du lundi au vendredi à 07:30",
        ),
        ("en semaine à 18:45", ScheduleKind.WEEKLY, "45 18 * * 1,2,3,4,5", None),
        ("le week-end à 10h", ScheduleKind.WEEKLY, "0 10 * * 6,0", "Le week-end à 10:00"),
        (
            "chaque lundi et jeudi à 8 h",
            ScheduleKind.WEEKLY,
            "0 8 * * 1,4",
            "Chaque lundi et jeudi à 08:00",
        ),
        ("hebdomadaire", ScheduleKind.WEEKLY, "0 6 * * 1", "Chaque lundi à 06:00"),
        (
            "le 1er de chaque mois à 5 h",
            ScheduleKind.CRON,
            "0 5 1 * *",
            "Le 1er de chaque mois à 05:00",
        ),
        ("0 6 * * *", ScheduleKind.CRON, "0 6 * * *", None),
        ("manuel", ScheduleKind.MANUAL, None, "Manuel"),
    ],
)
def test_french_phrases(
    text: str, kind: ScheduleKind, cron: str | None, description: str | None
) -> None:
    spec = parse_phrase(text)
    assert spec.kind is kind
    assert spec.expression() == cron
    if description is not None:
        assert spec.describe() == description


@pytest.mark.parametrize("text", ["", "bientôt", "toutes les 7 minutes", "à 25 h", "61 * * * *"])
def test_unclear_phrases_are_refused_with_examples(text: str) -> None:
    with pytest.raises((SchedulePhraseError, CronError)):
        parse_phrase(text)


def test_cron_follows_the_time_zone_and_clock_changes() -> None:
    daily = Cron.parse("0 6 * * *")
    # 6:00 in Paris is 5:00 UTC in winter and 4:00 UTC in summer.
    assert daily.next_after(datetime(2026, 1, 10, 12, tzinfo=UTC), PARIS) == datetime(
        2026, 1, 11, 5, tzinfo=UTC
    )
    assert daily.next_after(datetime(2026, 7, 10, 12, tzinfo=UTC), PARIS) == datetime(
        2026, 7, 11, 4, tzinfo=UTC
    )
    # 2:30 does not exist on 29 March 2026 in Paris: the run happens just after the change.
    skipped = Cron.parse("30 2 * * *").next_after(datetime(2026, 3, 28, 12, tzinfo=UTC), PARIS)
    assert skipped == datetime(2026, 3, 29, 1, 30, tzinfo=UTC)
    # Day of month or day of week, as in Vixie cron.
    either = Cron.parse("0 0 13 * fri")
    runs, moment = [], datetime(2026, 2, 1, tzinfo=UTC)
    for _ in range(3):
        moment = either.next_after(moment, UTC)  # type: ignore[arg-type]
        runs.append(moment.day)
    assert runs == [6, 13, 20]


@pytest.mark.parametrize("expression", ["* * *", "60 * * * *", "* 24 * * *", "5-1 * * * *"])
def test_invalid_cron(expression: str) -> None:
    with pytest.raises(CronError):
        Cron.parse(expression)


# --- the scheduler, with a simulated clock ----------------------------------------------


class FakeClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> datetime:
        self.now += timedelta(**delta)
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(datetime(2026, 1, 12, 4, 0, tzinfo=UTC))  # 5:00 in Paris, a Monday


@pytest.fixture
def client(settings: Settings, clock: FakeClock) -> Iterator[TestClient]:
    local = settings.model_copy(
        update={
            "job_runner": "inline",
            "scheduler_enabled": False,
            "connector_allowed_hosts": ["127.0.0.1"],
        }
    )
    with api_client(local) as test_client:
        state: AppState = test_client.app.state.forja  # type: ignore[attr-defined]
        state.schedules.clock = clock
        # Retries of the fake API's errors do not wait.
        state.connectors.clock = Clock(sleep=lambda _seconds: None)
        yield test_client


def _state(client: TestClient) -> AppState:
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    return state


def _loaded_connection(client: TestClient, base: str) -> tuple[str, dict[str, Any]]:
    project_id = client.post("/projects", json={"name": "Planifié"}).json()["id"]
    connection = client.post(
        f"/projects/{project_id}/connections",
        json={
            "name": "Boutique",
            "type": "rest_api",
            "params": {
                "base_url": base,
                "endpoints": [
                    {
                        "name": "orders",
                        "path": "/none/orders",
                        "incremental": {"param": "since", "cursor_field": "updated_at"},
                    }
                ],
            },
        },
    ).json()
    run = client.post(
        f"/connections/{connection['id']}/import", json={"endpoints": [{"endpoint": "orders"}]}
    ).json()["run"]
    assert run["status"] == "succeeded", run
    return project_id, connection


def test_interpretation_shows_the_next_runs(client: TestClient) -> None:
    project_id = client.post("/projects", json={"name": "Phrases"}).json()["id"]
    response = client.post(
        f"/projects/{project_id}/schedules/interpret", json={"text": "tous les jours à 6 h"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cron"] == "0 6 * * *" and body["timezone"] == "Europe/Paris"
    assert body["next_runs"][:2] == ["2026-01-12T05:00:00Z", "2026-01-13T05:00:00Z"]
    refused = client.post(f"/projects/{project_id}/schedules/interpret", json={"text": "un jour"})
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "schedule_not_understood"


def test_scheduled_load_runs_at_its_time_without_overlap_and_catches_up(
    client: TestClient, clock: FakeClock
) -> None:
    state = _state(client)
    with serve(FakeApiState(orders=make_orders(4))) as (base, fake):
        project_id, connection = _loaded_connection(client, base)
        saved = client.put(
            f"/connections/{connection['id']}/schedule", json={"text": "tous les jours à 6 h"}
        )
        assert saved.status_code == 200, saved.text
        schedule = saved.json()
        assert schedule["description"] == "Tous les jours à 06:00"
        assert schedule["next_run_at"] == "2026-01-12T05:00:00Z"

        # 5:30 in Paris: not yet.
        assert state.scheduler.tick(clock.advance(minutes=30)) == []

        # 6:00: the load runs (inline runner) and the next one is tomorrow.
        fake.orders += make_orders(2, start=30)
        [job] = state.scheduler.tick(clock.advance(minutes=30))
        finished = state.catalog.get_job(job.id)
        assert finished.status is JobStatus.SUCCEEDED, finished.error
        assert finished.params.trigger == "schedule" and finished.params.chain is True
        assert finished.metrics is not None
        loads = {m.object: m.rows for m in finished.metrics.loads}
        assert loads["orders"] == 2
        again = client.get(f"/connections/{connection['id']}/schedule").json()
        assert again["next_run_at"] == "2026-01-13T05:00:00Z"
        assert again["last_status"] == "succeeded"
        runs = client.get(f"/projects/{project_id}/runs").json()["items"]
        assert runs[0]["id"] == job.id

        # A load already running: the next time is skipped, not stacked.
        busy = state.executor.create(
            project_id,
            finished.params.model_copy(update={"trigger": "manual", "schedule_id": None}),
        )
        clock.now = datetime(2026, 1, 13, 5, 0, tzinfo=UTC)
        assert state.scheduler.tick() == []
        skipped = client.get(f"/connections/{connection['id']}/schedule").json()
        assert skipped["last_status"] == "skipped"
        assert skipped["next_run_at"] == "2026-01-14T05:00:00Z"
        state.executor.execute(busy.id)

        # The API was stopped for three days: one catch-up run, then the normal rhythm.
        clock.now = datetime(2026, 1, 17, 9, 0, tzinfo=UTC)
        assert len(state.scheduler.tick()) == 1
        caught_up = client.get(f"/connections/{connection['id']}/schedule").json()
        assert caught_up["next_run_at"] == "2026-01-18T05:00:00Z"
        assert state.scheduler.tick() == []


def test_failed_scheduled_load_notifies_engineers(client: TestClient, clock: FakeClock) -> None:
    state = _state(client)
    with serve(FakeApiState(orders=make_orders(3))) as (base, fake):
        _, connection = _loaded_connection(client, base)
        client.put(f"/connections/{connection['id']}/schedule", json={"text": "toutes les heures"})
        before = client.get("/notifications").json()["total"]
        fake.failures = [500] * 20
        [job] = state.scheduler.tick(clock.advance(hours=1))
        assert state.catalog.get_job(job.id).status is JobStatus.FAILED
        notifications = client.get("/notifications").json()
        assert notifications["total"] == before + 1
        assert notifications["items"][0]["kind"] == "run_failed"
        assert notifications["items"][0]["title"] == "Échec du chargement"
        # A success after that sends nothing: scheduled runs only report failures.
        fake.failures = []
        state.scheduler.tick(clock.advance(hours=1))
        assert client.get("/notifications").json()["total"] == before + 1


def test_file_sources_cannot_be_scheduled(client: TestClient, tmp_path: Any) -> None:
    project_id = client.post("/projects", json={"name": "Fichiers"}).json()["id"]
    path = tmp_path / "ventes.csv"
    path.write_text("a;b\n1;2\n", encoding="utf-8")
    with path.open("rb") as handle:
        [source] = client.post(
            f"/projects/{project_id}/sources", files={"file": ("ventes.csv", handle)}
        ).json()
    refused = client.put(f"/sources/{source['id']}/schedule", json={"text": "tous les jours"})
    assert refused.status_code == 422
