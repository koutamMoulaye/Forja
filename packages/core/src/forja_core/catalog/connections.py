"""Persistence of connections, the sources they feed, schedules, uploads and settings."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import duckdb

from forja_core.catalog.base import from_db_timestamp_required, to_db_timestamp
from forja_core.catalog.notifications import NotificationsMixin
from forja_core.connectors.models import (
    Connection,
    ConnectionTest,
    ConnectionType,
    SourceFeed,
    parse_params,
)
from forja_core.errors import ConflictError, NotFoundError
from forja_core.models import UploadSession
from forja_core.scheduling.models import Schedule, TargetType
from forja_core.utils import utcnow


class ConnectionNotFoundError(NotFoundError):
    code = "connection_not_found"


class ScheduleNotFoundError(NotFoundError):
    code = "schedule_not_found"


_CONNECTION_COLUMNS = (
    "id, project_id, name, type, params, secret_fields, last_test, created_by, created_at, "
    "updated_at"
)


def _connection(row: tuple[Any, ...]) -> Connection:
    kind = ConnectionType(row[3])
    return Connection(
        id=row[0],
        project_id=row[1],
        name=row[2],
        type=kind,
        params=parse_params(kind, json.loads(row[4])),
        secrets_set=json.loads(row[5]),
        last_test=None if row[6] is None else ConnectionTest.model_validate_json(row[6]),
        created_by=row[7],
        created_at=from_db_timestamp_required(row[8]),
        updated_at=from_db_timestamp_required(row[9]),
    )


class ConnectionsMixin(NotificationsMixin):
    # --- connections ------------------------------------------------------------------

    def add_connection(self, connection: Connection, secrets: str | None) -> Connection:
        try:
            self._execute(
                f"INSERT INTO connections ({_CONNECTION_COLUMNS}, secrets) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    connection.id,
                    connection.project_id,
                    connection.name,
                    connection.type.value,
                    connection.params.model_dump_json(),
                    json.dumps(connection.secrets_set),
                    None
                    if connection.last_test is None
                    else connection.last_test.model_dump_json(),
                    connection.created_by,
                    to_db_timestamp(connection.created_at),
                    to_db_timestamp(connection.updated_at),
                    secrets,
                ],
            )
        except duckdb.ConstraintException as exc:
            raise ConflictError(
                f"a connection named '{connection.name}' already exists in this project",
                details={"name": connection.name},
            ) from exc
        return connection

    def update_connection(self, connection: Connection, secrets: str | None) -> Connection:
        try:
            self._execute(
                "UPDATE connections SET name = ?, params = ?, secret_fields = ?, last_test = ?, "
                "updated_at = ?, secrets = ? WHERE id = ?",
                [
                    connection.name,
                    connection.params.model_dump_json(),
                    json.dumps(connection.secrets_set),
                    None
                    if connection.last_test is None
                    else connection.last_test.model_dump_json(),
                    to_db_timestamp(connection.updated_at),
                    secrets,
                    connection.id,
                ],
            )
        except duckdb.ConstraintException as exc:
            raise ConflictError(
                f"a connection named '{connection.name}' already exists in this project",
                details={"name": connection.name},
            ) from exc
        return connection

    def save_connection_test(self, connection_id: str, test: ConnectionTest) -> None:
        self._execute(
            "UPDATE connections SET last_test = ? WHERE id = ?",
            [test.model_dump_json(), connection_id],
        )

    def get_connection(self, connection_id: str) -> Connection:
        row = self._fetchone(
            f"SELECT {_CONNECTION_COLUMNS} FROM connections WHERE id = ?", [connection_id]
        )
        if row is None:
            raise ConnectionNotFoundError(f"connection '{connection_id}' not found")
        return _connection(row)

    def connection_secrets(self, connection_id: str) -> str | None:
        row = self._fetchone("SELECT secrets FROM connections WHERE id = ?", [connection_id])
        if row is None:
            raise ConnectionNotFoundError(f"connection '{connection_id}' not found")
        return None if row[0] is None else str(row[0])

    def list_connections(self, project_id: str) -> list[Connection]:
        self.get_project(project_id)
        rows = self._fetchall(
            f"SELECT {_CONNECTION_COLUMNS} FROM connections WHERE project_id = ? ORDER BY name",
            [project_id],
        )
        return [_connection(row) for row in rows]

    def delete_connection(self, connection_id: str) -> list[str]:
        """Remove a connection, its feeds and schedules; returns the detached source ids."""
        with self._transaction():
            sources = [
                str(row[0])
                for row in self._fetchall(
                    "SELECT source_id FROM source_feeds WHERE connection_id = ?", [connection_id]
                )
            ]
            if sources:
                marks = ", ".join("?" for _ in sources)
                self._execute(
                    "DELETE FROM schedules WHERE target_type = 'source' "
                    f"AND target_id IN ({marks})",
                    sources,
                )
            self._execute(
                "DELETE FROM schedules WHERE target_type = 'connection' AND target_id = ?",
                [connection_id],
            )
            self._execute("DELETE FROM source_feeds WHERE connection_id = ?", [connection_id])
            self._execute("DELETE FROM connections WHERE id = ?", [connection_id])
        return sources

    # --- feeds ------------------------------------------------------------------------

    def save_feed(self, feed: SourceFeed) -> SourceFeed:
        self._execute(
            "INSERT OR REPLACE INTO source_feeds VALUES (?, ?, ?)",
            [feed.source_id, feed.connection_id, feed.model_dump_json()],
        )
        return feed

    def get_feed(self, source_id: str) -> SourceFeed | None:
        row = self._fetchone("SELECT data FROM source_feeds WHERE source_id = ?", [source_id])
        return None if row is None else SourceFeed.model_validate_json(row[0])

    def list_feeds(self, connection_id: str) -> list[SourceFeed]:
        """Feeds of a connection, those whose source is not loaded yet included."""
        rows = self._fetchall(
            "SELECT f.data FROM source_feeds f LEFT JOIN sources s ON s.id = f.source_id "
            "WHERE f.connection_id = ? ORDER BY coalesce(s.name, f.data->>'name')",
            [connection_id],
        )
        return [SourceFeed.model_validate_json(row[0]) for row in rows]

    # --- schedules --------------------------------------------------------------------

    def save_schedule(self, schedule: Schedule) -> Schedule:
        self._execute(
            "INSERT INTO schedules VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET "
            "data = excluded.data, next_run_at = excluded.next_run_at",
            [
                schedule.id,
                schedule.project_id,
                schedule.target_type,
                schedule.target_id,
                schedule.model_dump_json(),
                to_db_timestamp(schedule.next_run_at if schedule.enabled else None),
            ],
        )
        return schedule

    def get_schedule(self, schedule_id: str) -> Schedule:
        row = self._fetchone("SELECT data FROM schedules WHERE id = ?", [schedule_id])
        if row is None:
            raise ScheduleNotFoundError(f"schedule '{schedule_id}' not found")
        return Schedule.model_validate_json(row[0])

    def find_schedule(self, target_type: TargetType, target_id: str) -> Schedule | None:
        row = self._fetchone(
            "SELECT data FROM schedules WHERE target_type = ? AND target_id = ?",
            [target_type, target_id],
        )
        return None if row is None else Schedule.model_validate_json(row[0])

    def list_schedules(self, project_id: str | None = None) -> list[Schedule]:
        if project_id is None:
            rows = self._fetchall("SELECT data FROM schedules ORDER BY next_run_at NULLS LAST")
        else:
            rows = self._fetchall(
                "SELECT data FROM schedules WHERE project_id = ? ORDER BY next_run_at NULLS LAST",
                [project_id],
            )
        return [Schedule.model_validate_json(row[0]) for row in rows]

    def due_schedules(self, now: datetime) -> list[Schedule]:
        rows = self._fetchall(
            "SELECT data FROM schedules WHERE next_run_at IS NOT NULL AND next_run_at <= ? "
            "ORDER BY next_run_at",
            [to_db_timestamp(now)],
        )
        return [Schedule.model_validate_json(row[0]) for row in rows]

    def delete_schedule(self, schedule_id: str) -> None:
        self._execute("DELETE FROM schedules WHERE id = ?", [schedule_id])

    # --- uploads ----------------------------------------------------------------------

    def save_upload(self, session: UploadSession) -> UploadSession:
        self._execute(
            "INSERT OR REPLACE INTO uploads VALUES (?, ?, ?, ?)",
            [
                session.id,
                session.project_id,
                session.model_dump_json(),
                to_db_timestamp(session.updated_at),
            ],
        )
        return session

    def get_upload(self, upload_id: str) -> UploadSession:
        row = self._fetchone("SELECT data FROM uploads WHERE id = ?", [upload_id])
        if row is None:
            raise NotFoundError(f"upload '{upload_id}' not found")
        return UploadSession.model_validate_json(row[0])

    def list_uploads(self, project_id: str | None) -> list[UploadSession]:
        if project_id is None:
            rows = self._fetchall("SELECT data FROM uploads ORDER BY updated_at")
        else:
            rows = self._fetchall(
                "SELECT data FROM uploads WHERE project_id = ? ORDER BY updated_at",
                [project_id],
            )
        return [UploadSession.model_validate_json(row[0]) for row in rows]

    # --- instance settings ------------------------------------------------------------

    def get_instance_setting(self, key: str) -> dict[str, Any] | None:
        row = self._fetchone("SELECT data FROM instance_settings WHERE key = ?", [key])
        if row is None:
            return None
        value: dict[str, Any] = json.loads(row[0])
        return value

    def save_instance_setting(self, key: str, data: dict[str, Any]) -> None:
        self._execute(
            "INSERT OR REPLACE INTO instance_settings VALUES (?, ?, ?)",
            [key, json.dumps(data, ensure_ascii=False), to_db_timestamp(utcnow())],
        )
