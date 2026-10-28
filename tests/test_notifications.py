"""Notifications and the event stream, against a real server (uvicorn in a thread): the
stream is long-lived, which the in-process test client cannot read."""

from __future__ import annotations

import asyncio
import json
import socket
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn

from forja_api.main import create_app
from forja_api.state import AppState
from forja_core.auth.models import Action, Principal, Role, User
from forja_core.config import Settings
from forja_core.models import ProjectCreate
from forja_core.notifications.bus import Event, EventBus
from forja_core.utils import utcnow
from tests.auth import ADMIN_PASSWORD, BOOTSTRAP_PASSWORD, USER_PASSWORD, with_bootstrap
from tests.shop import build_gold_shop, shop_settings

# --- Bus -------------------------------------------------------------------------------


def _principal(user_id: str, roles: dict[str, Role]) -> Principal:
    return Principal(
        user=User(id=user_id, email=f"{user_id}@exemple.fr", created_at=utcnow()),
        via="password",
        roles=roles,
    )


def test_bus_delivers_to_who_may_see() -> None:
    async def scenario() -> dict[str, list[str]]:
        loop = asyncio.get_running_loop()
        bus = EventBus()
        subs = {
            "eng": bus.subscribe(_principal("eng", {"p": Role.ENGINEER}), loop),
            "ana": bus.subscribe(_principal("ana", {"p": Role.ANALYST}), loop),
            "out": bus.subscribe(_principal("out", {"q": Role.ENGINEER}), loop),
        }
        bus.publish(Event("job", {"id": "build"}, project_id="p", action=Action.RUN_READ))
        bus.publish(
            Event("job", {"id": "agent"}, project_id="p", action=Action.RUN_READ, owner_id="ana")
        )
        bus.publish(Event("notification", {"id": "n"}, user_id="ana"))
        await asyncio.sleep(0.05)
        seen: dict[str, list[str]] = {}
        for name, sub in subs.items():
            seen[name] = []
            while not sub.queue.empty():
                event = sub.queue.get_nowait()
                assert event is not None
                seen[name].append(str(event.data["id"]))
        bus.close()
        await asyncio.sleep(0.05)
        for sub in subs.values():
            assert await sub.next(1) is None
        return seen

    seen = asyncio.run(scenario())
    assert seen == {"eng": ["build", "agent"], "ana": ["agent", "n"], "out": []}


# --- Server ----------------------------------------------------------------------------


@dataclass
class Live:
    url: str
    project_id: str
    admin: httpx.Client
    engineer: httpx.Client
    analyst: httpx.Client


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def _login(url: str, email: str, password: str) -> str:
    response = httpx.post(f"{url}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def _client(url: str, token: str) -> httpx.Client:
    return httpx.Client(base_url=url, headers={"Authorization": f"Bearer {token}"}, timeout=120)


def _member(admin: httpx.Client, url: str, project_id: str, email: str, role: str) -> httpx.Client:
    invited = admin.post(f"/projects/{project_id}/invitations", json={"email": email, "role": role})
    assert invited.status_code == 201, invited.text
    registered = httpx.post(
        f"{url}/auth/register", json={"token": invited.json()["token"], "password": USER_PASSWORD}
    )
    assert registered.status_code == 201, registered.text
    return _client(url, registered.json()["access_token"])


@pytest.fixture(scope="module")
def live(tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path) -> Iterator[Live]:
    settings: Settings = shop_settings(
        tmp_path_factory.mktemp("notifications"),
        auth_mode="multi",
        mart_require_approval=True,
        events_heartbeat_seconds=0.5,
        agent_today="2025-01-15",
    )
    state, project = build_gold_shop(settings, ecommerce_dir)
    state.close()

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(with_bootstrap(settings)),
            host="127.0.0.1",
            port=port,
            log_level="warning",
            timeout_graceful_shutdown=2,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}"
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started

    first = httpx.post(
        f"{url}/auth/login", json={"email": "admin@forja.local", "password": BOOTSTRAP_PASSWORD}
    ).json()
    changed = httpx.post(
        f"{url}/auth/password",
        json={"current_password": BOOTSTRAP_PASSWORD, "new_password": ADMIN_PASSWORD},
        headers={"Authorization": f"Bearer {first['access_token']}"},
    )
    assert changed.status_code == 200, changed.text
    admin = _client(url, changed.json()["access_token"])
    engineer = _member(admin, url, project.id, "ingenieur@exemple.fr", "engineer")
    analyst = _member(admin, url, project.id, "analyste@exemple.fr", "analyst")
    try:
        yield Live(url, project.id, admin, engineer, analyst)
    finally:
        for client in (admin, engineer, analyst):
            client.close()
        server.should_exit = True
        thread.join(15)


class Stream:
    """The caller's event stream, read in a thread; events collected as they come."""

    def __init__(self, client: httpx.Client) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []
        self.comments = 0
        self._client = client
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._read, daemon=True)
        self._thread.start()

    def _read(self) -> None:
        with self._client.stream("GET", "/events", timeout=None) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            name = "message"
            for line in response.iter_lines():
                if self._stop.is_set():
                    return
                if line.startswith(":"):
                    self.comments += 1
                elif line.startswith("event: "):
                    name = line[7:]
                elif line.startswith("data: "):
                    self.events.append((name, json.loads(line[6:])))
                    name = "message"

    def wait(self, predicate: Any, timeout: float = 30) -> tuple[str, dict[str, Any]]:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for event in self.events:
                if predicate(event):
                    return event
            time.sleep(0.05)
        raise AssertionError(f"no matching event in {self.events}")

    def close(self) -> None:
        self._stop.set()


def _notifications(client: httpx.Client, **params: Any) -> dict[str, Any]:
    response = client.get("/notifications", params=params)
    assert response.status_code == 200, response.text
    page: dict[str, Any] = response.json()
    return page


def test_stream_needs_a_session(live: Live) -> None:
    assert httpx.get(f"{live.url}/events").status_code == 401
    assert httpx.get(f"{live.url}/notifications").status_code == 401


def test_mart_lifecycle_notifies_and_streams(live: Live) -> None:
    analyst_stream = Stream(live.analyst)
    engineer_stream = Stream(live.engineer)
    try:
        analyst_stream.wait(lambda e: e[0] == "ready")
        engineer_stream.wait(lambda e: e[0] == "ready")
        asked = live.analyst.post(
            f"/projects/{live.project_id}/mart-requests",
            json={"question": "Quantité vendue par catégorie"},
        ).json()
        mart_id, run_id = asked["mart_request"]["id"], asked["run"]["id"]

        # The agent's run reaches its author, and the engineers (who read every run).
        analyst_stream.wait(lambda e: e[0] == "job" and e[1]["id"] == run_id)
        engineer_stream.wait(
            lambda e: e[0] == "job" and e[1]["id"] == run_id and e[1]["status"] == "succeeded"
        )
        ready = analyst_stream.wait(
            lambda e: e[0] == "notification" and e[1]["kind"] == "ai_job_done"
        )[1]
        assert ready["title"] == "Aperçu prêt à vérifier"
        assert ready["action"] == {"label": "Vérifier", "target_type": "mart", "target_id": mart_id}

        assert live.analyst.post(f"/mart-requests/{mart_id}/validate", json={}).status_code == 200
        approval = engineer_stream.wait(
            lambda e: e[0] == "notification" and e[1]["kind"] == "mart_approval"
        )[1]
        assert approval["action"]["target_id"] == mart_id
        assert "analyste@exemple.fr" in approval["detail"]

        assert live.engineer.post(f"/mart-requests/{mart_id}/approve").status_code == 200
        analyst_stream.wait(lambda e: e[0] == "notification" and e[1]["kind"] == "mart_approved")
        analyst_stream.wait(lambda e: e[0] == "notification" and e[1]["kind"] == "mart_published")
        assert analyst_stream.comments >= 1  # heartbeats
    finally:
        analyst_stream.close()
        engineer_stream.close()

    # Another engineer's notifications are their own.
    kinds = {n["kind"] for n in _notifications(live.analyst)["items"]}
    assert {"ai_job_done", "mart_approved", "mart_published"} <= kinds
    assert "mart_approval" not in kinds


def test_rejection_carries_its_reason(live: Live) -> None:
    asked = live.analyst.post(
        f"/projects/{live.project_id}/mart-requests",
        json={"question": "Nombre de commandes par mois"},
    ).json()
    mart_id = asked["mart_request"]["id"]
    live.analyst.post(f"/mart-requests/{mart_id}/validate", json={})
    rejected = live.engineer.post(f"/mart-requests/{mart_id}/reject", json={"reason": "doublon"})
    assert rejected.status_code == 200, rejected.text
    [latest] = _notifications(live.analyst, limit=1)["items"]
    assert latest["kind"] == "mart_rejected" and latest["detail"] == "doublon"


def test_runs_notify_their_author(live: Live) -> None:
    started = live.engineer.post(f"/projects/{live.project_id}/runs", json={"type": "export"})
    assert started.status_code == 202, started.text
    [latest] = _notifications(live.engineer, limit=1)["items"]
    assert latest["kind"] in ("run_succeeded", "run_failed")
    assert latest["action"]["target_type"] == "run"
    assert latest["action"]["target_id"] == started.json()["id"]


def test_pages_and_read_state(live: Live) -> None:
    page = _notifications(live.analyst, limit=2)
    assert len(page["items"]) == 2 and page["total"] >= 4 and page["unread"] == page["total"]
    second = _notifications(live.analyst, limit=2, offset=2)
    assert {n["id"] for n in page["items"]}.isdisjoint(n["id"] for n in second["items"])

    one = page["items"][0]["id"]
    marked = live.analyst.post("/notifications/read", json={"ids": [one]}).json()
    assert marked == {"marked": 1, "unread": page["unread"] - 1}
    unread = _notifications(live.analyst, unread_only=True, limit=100)
    assert one not in {n["id"] for n in unread["items"]}
    # Someone else's notification cannot be marked.
    assert live.engineer.post("/notifications/read", json={"ids": [one]}).json()["marked"] == 0

    assert live.analyst.post("/notifications/read", json={}).json()["unread"] == 0
    assert all(n["read_at"] for n in _notifications(live.analyst, limit=100)["items"])


def test_a_new_draft_plan_is_for_the_engineers(settings: Settings, fixtures_dir: Path) -> None:
    state = AppState.build(settings.model_copy(update={"auth_mode": "multi"}))
    try:
        admin = state.auth.bootstrap()
        assert admin is not None
        project = state.catalog.create_project(ProjectCreate(name="Plans"))
        state.catalog.add_user(
            User(id="ana", email="ana@exemple.fr", created_at=utcnow()), password_hash=None
        )
        state.catalog.set_membership(project.id, "ana", Role.ANALYST)
        [source] = state.ingestion.ingest_file(
            project.id, fixtures_dir / "clients_v1.csv", "clients_v1.csv"
        )
        items, _ = state.catalog.list_notifications(admin.id)
        assert [(n.kind.value, n.action and n.action.target_id) for n in items] == [
            ("plan_review", source.id)
        ]
        assert state.catalog.list_notifications("ana") == ([], 0)
    finally:
        state.close()
