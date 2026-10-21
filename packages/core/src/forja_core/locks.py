"""Per-project locks on the warehouse database.

DuckDB allows a single writer process per file: while dbt writes a project
warehouse, nothing else in Forja may open it.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

from forja_core.errors import WarehouseBusyError


class WarehouseLocks:
    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}

    def _lock(self, project_id: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(project_id, threading.Lock())

    @contextmanager
    def hold(self, project_id: str, timeout: float = -1) -> Iterator[None]:
        lock = self._lock(project_id)
        if not lock.acquire(timeout=timeout):
            raise WarehouseBusyError(
                "the project warehouse is being rebuilt, retry once the run is finished",
                details={"project_id": project_id},
            )
        try:
            yield
        finally:
            lock.release()
