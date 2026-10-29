"""Limitation of failed logins, refreshes and registrations."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from forja_core.config import Settings
from forja_core.utils import utcnow
from tests.auth import ADMIN_EMAIL, ADMIN_PASSWORD, api_client


class Clock:
    def __init__(self) -> None:
        self.now = utcnow()

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def throttled(settings: Settings) -> Iterator[tuple[TestClient, Clock]]:
    limited = settings.model_copy(
        update={
            "auth_mode": "multi",
            "auth_throttle_account_max": 3,
            "auth_throttle_ip_max": 6,
            "auth_throttle_lockout_seconds": 60,
            "auth_throttle_max_lockout_seconds": 200,
        }
    )
    with api_client(limited) as client:
        clock = Clock()
        client.app.state.forja.auth.throttle.clock = clock  # type: ignore[attr-defined]
        yield client, clock


def _login(
    client: TestClient, email: str, password: str = "wrong-password"
) -> tuple[int, dict[str, Any]]:
    response = client.post("/auth/login", json={"email": email, "password": password})
    return response.status_code, response.json()


def _audit(client: TestClient) -> list[str]:
    return [e["action"] for e in client.get("/audit", params={"limit": 200}).json()["items"]]


def test_account_lock_is_progressive_and_answers_alike(throttled: tuple[TestClient, Clock]) -> None:
    client, clock = throttled
    anonymous = TestClient(client.app)
    for _ in range(3):
        assert _login(anonymous, ADMIN_EMAIL)[0] == 401
    status, body = _login(anonymous, ADMIN_EMAIL, ADMIN_PASSWORD)  # even the right password
    assert status == 429 and body["error"]["code"] == "too_many_attempts"
    response = anonymous.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "x"})
    assert int(response.headers["retry-after"]) == body["error"]["details"]["retry_after"] <= 60

    # An unknown account gets exactly the same answers.
    for _ in range(3):
        assert _login(anonymous, "personne@exemple.fr")[0] == 401
    unknown_status, unknown_body = _login(anonymous, "personne@exemple.fr")
    assert unknown_status == 429 and unknown_body["error"]["code"] == body["error"]["code"]

    clock.advance(61)
    assert _login(anonymous, ADMIN_EMAIL)[0] == 401  # unlocked, counting again
    assert _login(anonymous, ADMIN_EMAIL)[0] == 401
    assert _login(anonymous, ADMIN_EMAIL)[0] == 401
    second = _login(anonymous, ADMIN_EMAIL, ADMIN_PASSWORD)[1]
    assert 60 < second["error"]["details"]["retry_after"] <= 120  # twice as long

    clock.advance(121)
    assert _login(anonymous, ADMIN_EMAIL, ADMIN_PASSWORD)[0] == 200
    actions = _audit(client)
    assert {"auth.throttled", "auth.login_blocked", "auth.login_failed"} <= set(actions)


def test_success_resets_the_account(throttled: tuple[TestClient, Clock]) -> None:
    client, _ = throttled
    anonymous = TestClient(client.app)
    for _ in range(2):
        assert _login(anonymous, ADMIN_EMAIL)[0] == 401
    assert _login(anonymous, ADMIN_EMAIL, ADMIN_PASSWORD)[0] == 200
    for _ in range(2):
        assert _login(anonymous, ADMIN_EMAIL)[0] == 401
    assert _login(anonymous, ADMIN_EMAIL, ADMIN_PASSWORD)[0] == 200


def test_ip_limit_across_accounts(throttled: tuple[TestClient, Clock]) -> None:
    client, _ = throttled
    anonymous = TestClient(client.app)
    for index in range(6):
        assert _login(anonymous, f"user{index}@exemple.fr")[0] == 401
    assert _login(anonymous, "autre@exemple.fr")[0] == 429  # the IP is locked


def test_refresh_and_registration_are_limited(throttled: tuple[TestClient, Clock]) -> None:
    client, clock = throttled
    anonymous = TestClient(client.app)
    for index in range(6):
        response = anonymous.post("/auth/refresh", json={"refresh_token": f"forged-{index}"})
        assert response.status_code == 401
    assert anonymous.post("/auth/refresh", json={"refresh_token": "x"}).status_code == 429

    clock.advance(3600)
    for index in range(6):
        response = anonymous.post(
            "/auth/register", json={"token": f"forged-{index}", "password": "Long-passw0rd-x"}
        )
        assert response.status_code == 401
    blocked = anonymous.post("/auth/register", json={"token": "x", "password": "Long-passw0rd-x"})
    assert blocked.status_code == 429
    assert {"auth.refresh_failed", "auth.register_failed", "auth.register_blocked"} <= set(
        _audit(client)
    )


def test_forwarded_for_only_when_trusted(settings: Settings) -> None:
    trusted = settings.model_copy(
        update={"auth_throttle_ip_max": 2, "auth_trust_forwarded_for": True}
    )
    with api_client(trusted) as client:
        anonymous = TestClient(client.app)
        for index in range(2):
            anonymous.post(
                "/auth/login",
                json={"email": f"a{index}@exemple.fr", "password": "x"},
                headers={"X-Forwarded-For": "203.0.113.7"},
            )
        blocked = anonymous.post(
            "/auth/login",
            json={"email": "b@exemple.fr", "password": "x"},
            headers={"X-Forwarded-For": "203.0.113.7"},
        )
        other = anonymous.post(
            "/auth/login",
            json={"email": "c@exemple.fr", "password": "x"},
            headers={"X-Forwarded-For": "198.51.100.1"},
        )
    assert blocked.status_code == 429 and other.status_code == 401
