"""Persistence of the users' notifications."""

from __future__ import annotations

from datetime import datetime

from forja_core.catalog.base import from_db_timestamp, to_db_timestamp
from forja_core.catalog.marts import MartsMixin
from forja_core.notifications.models import Notification


class NotificationsMixin(MartsMixin):
    def add_notification(self, notification: Notification) -> Notification:
        self._execute(
            "INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                notification.id,
                notification.user_id,
                notification.project_id,
                notification.kind.value,
                notification.model_dump_json(),
                to_db_timestamp(notification.read_at),
                to_db_timestamp(notification.created_at),
            ],
        )
        return notification

    def list_notifications(
        self, user_id: str, *, unread_only: bool = False, limit: int = 20, offset: int = 0
    ) -> tuple[list[Notification], int]:
        """A page of the user's notifications, newest first, and how many match."""
        where = "user_id = ?" + (" AND read_at IS NULL" if unread_only else "")
        with self._lock:
            row = self._fetchone(f"SELECT count(*) FROM notifications WHERE {where}", [user_id])
            rows = self._fetchall(
                f"SELECT data, read_at FROM notifications WHERE {where} "
                "ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
                [user_id, limit, offset],
            )
        items = []
        for data, read_at in rows:
            notification = Notification.model_validate_json(data)
            notification.read_at = from_db_timestamp(read_at)
            items.append(notification)
        return items, int(row[0]) if row else 0

    def unread_notifications(self, user_id: str) -> int:
        row = self._fetchone(
            "SELECT count(*) FROM notifications WHERE user_id = ? AND read_at IS NULL", [user_id]
        )
        return int(row[0]) if row else 0

    def mark_notifications_read(self, user_id: str, ids: list[str] | None, at: datetime) -> int:
        """Marks the given notifications (all when ``ids`` is None) as read; returns how many."""
        where = "user_id = ? AND read_at IS NULL"
        params: list[object] = [user_id]
        if ids is not None:
            if not ids:
                return 0
            where += f" AND id IN ({', '.join('?' for _ in ids)})"
            params += ids
        with self._lock:
            row = self._fetchone(f"SELECT count(*) FROM notifications WHERE {where}", params)
            self._execute(
                f"UPDATE notifications SET read_at = ? WHERE {where}",
                [to_db_timestamp(at), *params],
            )
        return int(row[0]) if row else 0
