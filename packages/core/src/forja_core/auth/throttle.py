"""Limitation of authentication attempts: sliding window, progressive lockout.

Every failed attempt is counted under several keys (the account and the client IP
for a login, the IP for a refresh or a registration). When a key reaches its limit
within the window, it is locked; each new lock lasts twice as long as the previous
one, up to a maximum. A locked key refuses attempts before any credential is
checked, with the same answer whether the account exists or not. A success clears
the account key; IP keys expire with their window.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ForjaError
from forja_core.utils import utcnow


class TooManyAttemptsError(ForjaError):
    code = "too_many_attempts"

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            f"too many attempts: retry in {retry_after} s",
            details={"retry_after": retry_after},
        )
        self.retry_after = retry_after


@dataclass(frozen=True)
class Limit:
    key: str
    max_failures: int


class Throttle:
    def __init__(
        self,
        catalog: Catalog,
        settings: Settings,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self.catalog = catalog
        self.settings = settings
        self.clock = clock

    @property
    def window(self) -> timedelta:
        return timedelta(seconds=self.settings.auth_throttle_window_seconds)

    def _lock_duration(self, lockouts: int) -> timedelta:
        base = self.settings.auth_throttle_lockout_seconds
        return timedelta(
            seconds=min(base * 2**lockouts, self.settings.auth_throttle_max_lockout_seconds)
        )

    def check(self, limits: list[Limit]) -> None:
        """Raise when one of the keys is locked."""
        if not self.settings.auth_throttle_enabled:
            return
        now = self.clock()
        waits = []
        for limit in limits:
            state = self.catalog.get_throttle(limit.key)
            if state is not None and state[1] is not None and state[1] > now:
                waits.append(max(1, math.ceil((state[1] - now).total_seconds())))
        if waits:
            raise TooManyAttemptsError(max(waits))

    def failure(self, limits: list[Limit]) -> list[str]:
        """Count a failure; returns the keys that just became locked."""
        if not self.settings.auth_throttle_enabled:
            return []
        now = self.clock()
        locked = []
        for limit in limits:
            state = self.catalog.get_throttle(limit.key)
            failures, locked_until, lockouts = state or ([], None, 0)
            failures = [f for f in failures if f > now - self.window] + [now]
            if len(failures) >= limit.max_failures:
                locked_until = now + self._lock_duration(lockouts)
                lockouts += 1
                failures = []
                locked.append(limit.key)
            self.catalog.save_throttle(limit.key, failures, locked_until, lockouts)
        return locked

    def success(self, keys: list[str]) -> None:
        for key in keys:
            self.catalog.clear_throttle(key)

    # --- Keys -------------------------------------------------------------------------

    def login_limits(self, email: str, ip: str | None) -> list[Limit]:
        limits = [
            Limit(f"login:account:{email.strip().lower()}", self.settings.auth_throttle_account_max)
        ]
        if ip:
            limits.append(Limit(f"login:ip:{ip}", self.settings.auth_throttle_ip_max))
        return limits

    def ip_limits(self, action: str, ip: str | None) -> list[Limit]:
        return [Limit(f"{action}:ip:{ip}", self.settings.auth_throttle_ip_max)] if ip else []
