"""Connection handling and migrations shared by the catalog repositories."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from forja_core import duck
from forja_core.catalog.migrations import MIGRATIONS, SCHEMA_VERSION
from forja_core.logging import get_logger

log = get_logger(__name__)


def to_db_timestamp(value: datetime | None) -> datetime | None:
    """Timestamps are stored as naive UTC."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def from_db_timestamp(value: datetime | None) -> datetime | None:
    return None if value is None else value.replace(tzinfo=UTC)


def from_db_timestamp_required(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


class CatalogBase:
    """Owns the single DuckDB connection of the process and serializes access to it.

    DuckDB allows one writer process per database file.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._con = duck.connect(str(path))
        self._migrate()

    def close(self) -> None:
        with self._lock:
            self._con.close()

    def __enter__(self) -> CatalogBase:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    @property
    def schema_version(self) -> int:
        row = self._fetchone("SELECT coalesce(max(version), 0) FROM schema_version")
        return int(row[0]) if row else 0

    def _migrate(self) -> None:
        with self._lock:
            self._con.execute(
                "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)"
            )
            current = self.schema_version
            for version, sql in MIGRATIONS:
                if version <= current:
                    continue
                with self._transaction():
                    self._con.execute(sql)
                    self._con.execute("INSERT INTO schema_version VALUES (?)", [version])
                log.info("catalog_migrated", path=str(self.path), version=version)
        log.debug("catalog_ready", path=str(self.path), schema_version=SCHEMA_VERSION)

    @contextmanager
    def _transaction(self) -> Iterator[None]:
        with self._lock:
            self._con.execute("BEGIN TRANSACTION")
            try:
                yield
            except BaseException:
                self._con.execute("ROLLBACK")
                raise
            self._con.execute("COMMIT")

    def _execute(self, sql: str, params: list[Any] | None = None) -> None:
        with self._lock:
            self._con.execute(sql, params or [])

    def _fetchone(self, sql: str, params: list[Any] | None = None) -> tuple[Any, ...] | None:
        with self._lock:
            rows = self._con.execute(sql, params or []).fetchall()
        return rows[0] if rows else None

    def _fetchall(self, sql: str, params: list[Any] | None = None) -> list[tuple[Any, ...]]:
        with self._lock:
            return self._con.execute(sql, params or []).fetchall()
