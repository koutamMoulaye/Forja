"""Persistence of users, memberships, sessions, API keys, invitations and the audit log.

Secrets are never stored: passwords as argon2 hashes, refresh tokens, API keys and
invitation tokens as SHA-256 digests (they are long random strings).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from forja_core.auth.models import (
    SYSTEM_USER,
    ApiKey,
    AuditEntry,
    AuditFacets,
    AuditQuery,
    Invitation,
    Membership,
    Role,
    User,
)
from forja_core.catalog.base import (
    from_db_timestamp,
    from_db_timestamp_required,
    to_db_timestamp,
)
from forja_core.catalog.gold_plans import GoldPlansMixin
from forja_core.errors import ConflictError, NotFoundError
from forja_core.utils import utcnow

_USER_COLUMNS = (
    "id, email, is_admin, must_change_password, disabled, identity_provider, created_at, name"
)
_KEY_COLUMNS = "id, user_id, name, prefix, created_at, last_used_at, revoked_at"
_INVITATION_COLUMNS = (
    "id, project_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at"
)


class UserNotFoundError(NotFoundError):
    code = "user_not_found"


def _user(row: tuple[Any, ...]) -> User:
    return User(
        id=row[0],
        email=row[1],
        is_admin=bool(row[2]),
        must_change_password=bool(row[3]),
        disabled=bool(row[4]),
        identity_provider=row[5],
        created_at=from_db_timestamp_required(row[6]),
        name=row[7],
    )


def _key(row: tuple[Any, ...]) -> ApiKey:
    return ApiKey(
        id=row[0],
        user_id=row[1],
        name=row[2],
        prefix=row[3],
        created_at=from_db_timestamp_required(row[4]),
        last_used_at=from_db_timestamp(row[5]),
        revoked_at=from_db_timestamp(row[6]),
    )


def _invitation(row: tuple[Any, ...]) -> Invitation:
    return Invitation(
        id=row[0],
        project_id=row[1],
        email=row[2],
        role=Role(row[3]),
        invited_by=row[4],
        created_at=from_db_timestamp_required(row[5]),
        expires_at=from_db_timestamp_required(row[6]),
        accepted_at=from_db_timestamp(row[7]),
        revoked_at=from_db_timestamp(row[8]),
    )


class AuthMixin(GoldPlansMixin):
    # --- Users -----------------------------------------------------------------------

    def count_users(self) -> int:
        row = self._fetchone("SELECT count(*) FROM users")
        return int(row[0]) if row else 0

    def add_user(self, user: User, password_hash: str | None) -> User:
        with self._lock:
            if self.find_user_by_email(user.email) is not None:
                raise ConflictError(f"a user with email '{user.email}' already exists")
            self._execute(
                "INSERT INTO users (id, email, password_hash, is_admin, must_change_password, "
                "disabled, identity_provider, external_subject, created_at, name) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                [
                    user.id,
                    user.email,
                    password_hash,
                    user.is_admin,
                    user.must_change_password,
                    user.disabled,
                    user.identity_provider,
                    to_db_timestamp(user.created_at),
                    user.name,
                ],
            )
        return user

    def get_user(self, user_id: str) -> User:
        row = self._fetchone(f"SELECT {_USER_COLUMNS} FROM users WHERE id = ?", [user_id])
        if row is None:
            raise UserNotFoundError(f"user '{user_id}' not found")
        return _user(row)

    def find_user_by_email(self, email: str) -> User | None:
        row = self._fetchone(
            f"SELECT {_USER_COLUMNS} FROM users WHERE email = ?", [email.strip().lower()]
        )
        return None if row is None else _user(row)

    def list_users(self) -> list[User]:
        rows = self._fetchall(f"SELECT {_USER_COLUMNS} FROM users ORDER BY created_at")
        return [_user(row) for row in rows]

    def password_hash(self, user_id: str) -> str | None:
        row = self._fetchone("SELECT password_hash FROM users WHERE id = ?", [user_id])
        return None if row is None else row[0]

    def set_password(self, user_id: str, password_hash: str, *, must_change: bool) -> None:
        self._execute(
            "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?",
            [password_hash, must_change, user_id],
        )

    # --- Memberships -----------------------------------------------------------------

    def set_membership(self, project_id: str, user_id: str, role: Role) -> Membership:
        now = utcnow()
        self._execute(
            "INSERT INTO memberships VALUES (?, ?, ?, ?) "
            "ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role",
            [project_id, user_id, role.value, to_db_timestamp(now)],
        )
        return self.get_membership(project_id, user_id)

    def get_membership(self, project_id: str, user_id: str) -> Membership:
        row = self._fetchone(
            "SELECT m.project_id, m.user_id, u.email, m.role, m.created_at FROM memberships m "
            "JOIN users u ON u.id = m.user_id WHERE m.project_id = ? AND m.user_id = ?",
            [project_id, user_id],
        )
        if row is None:
            raise NotFoundError(f"user '{user_id}' is not a member of project '{project_id}'")
        return Membership(
            project_id=row[0],
            user_id=row[1],
            email=row[2],
            role=Role(row[3]),
            created_at=from_db_timestamp_required(row[4]),
        )

    def delete_membership(self, project_id: str, user_id: str) -> None:
        self.get_membership(project_id, user_id)
        self._execute(
            "DELETE FROM memberships WHERE project_id = ? AND user_id = ?", [project_id, user_id]
        )

    def list_memberships(self, project_id: str) -> list[Membership]:
        rows = self._fetchall(
            "SELECT m.project_id, m.user_id, u.email, m.role, m.created_at FROM memberships m "
            "JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY u.email",
            [project_id],
        )
        return [
            Membership(
                project_id=r[0],
                user_id=r[1],
                email=r[2],
                role=Role(r[3]),
                created_at=from_db_timestamp_required(r[4]),
            )
            for r in rows
        ]

    def user_roles(self, user_id: str) -> dict[str, Role]:
        rows = self._fetchall(
            "SELECT project_id, role FROM memberships WHERE user_id = ?", [user_id]
        )
        return {r[0]: Role(r[1]) for r in rows}

    # --- Sessions and refresh tokens -------------------------------------------------

    def add_session(self, session_id: str, user_id: str, expires_at: datetime) -> None:
        self._execute(
            "INSERT INTO auth_sessions VALUES (?, ?, ?, ?, NULL, NULL)",
            [session_id, user_id, to_db_timestamp(utcnow()), to_db_timestamp(expires_at)],
        )

    def session_active(self, session_id: str) -> bool:
        row = self._fetchone(
            "SELECT revoked_at IS NULL AND expires_at > ? FROM auth_sessions WHERE id = ?",
            [to_db_timestamp(utcnow()), session_id],
        )
        return bool(row and row[0])

    def session_user(self, session_id: str) -> str | None:
        row = self._fetchone("SELECT user_id FROM auth_sessions WHERE id = ?", [session_id])
        return None if row is None else str(row[0])

    def revoke_session(self, session_id: str, reason: str) -> None:
        self._execute(
            "UPDATE auth_sessions SET revoked_at = ?, revoked_reason = ? "
            "WHERE id = ? AND revoked_at IS NULL",
            [to_db_timestamp(utcnow()), reason, session_id],
        )

    def revoke_user_sessions(self, user_id: str, reason: str, *, keep: str | None = None) -> None:
        self._execute(
            "UPDATE auth_sessions SET revoked_at = ?, revoked_reason = ? "
            "WHERE user_id = ? AND revoked_at IS NULL AND id IS DISTINCT FROM ?",
            [to_db_timestamp(utcnow()), reason, user_id, keep],
        )

    def add_refresh_token(self, token_hash: str, session_id: str) -> None:
        self._execute(
            "INSERT INTO refresh_tokens VALUES (?, ?, ?, NULL)",
            [token_hash, session_id, to_db_timestamp(utcnow())],
        )

    def use_refresh_token(self, token_hash: str) -> tuple[str, bool] | None:
        """Mark a refresh token used: (session id, whether it had been used already)."""
        with self._lock:
            row = self._fetchone(
                "SELECT session_id, used_at IS NOT NULL FROM refresh_tokens WHERE token_hash = ?",
                [token_hash],
            )
            if row is None:
                return None
            if not row[1]:
                self._execute(
                    "UPDATE refresh_tokens SET used_at = ? WHERE token_hash = ?",
                    [to_db_timestamp(utcnow()), token_hash],
                )
            return str(row[0]), bool(row[1])

    # --- API keys --------------------------------------------------------------------

    def add_api_key(self, key: ApiKey, key_hash: str) -> ApiKey:
        self._execute(
            "INSERT INTO api_keys VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
            [key.id, key.user_id, key.name, key.prefix, key_hash, to_db_timestamp(key.created_at)],
        )
        return key

    def find_api_key(self, prefix: str) -> tuple[ApiKey, str] | None:
        row = self._fetchone(
            f"SELECT {_KEY_COLUMNS}, key_hash FROM api_keys WHERE prefix = ?", [prefix]
        )
        return None if row is None else (_key(row[:7]), str(row[7]))

    def touch_api_key(self, key_id: str) -> None:
        self._execute(
            "UPDATE api_keys SET last_used_at = ? WHERE id = ?", [to_db_timestamp(utcnow()), key_id]
        )

    def list_api_keys(self, user_id: str) -> list[ApiKey]:
        rows = self._fetchall(
            f"SELECT {_KEY_COLUMNS} FROM api_keys WHERE user_id = ? ORDER BY created_at",
            [user_id],
        )
        return [_key(row) for row in rows]

    def revoke_api_key(self, user_id: str, key_id: str) -> ApiKey:
        row = self._fetchone(
            f"SELECT {_KEY_COLUMNS} FROM api_keys WHERE id = ? AND user_id = ?", [key_id, user_id]
        )
        if row is None:
            raise NotFoundError(f"API key '{key_id}' not found")
        self._execute(
            "UPDATE api_keys SET revoked_at = coalesce(revoked_at, ?) WHERE id = ?",
            [to_db_timestamp(utcnow()), key_id],
        )
        return next(k for k in self.list_api_keys(user_id) if k.id == key_id)

    # --- Invitations -----------------------------------------------------------------

    def add_invitation(self, invitation: Invitation, token_hash: str) -> Invitation:
        self._execute(
            "INSERT INTO invitations (id, project_id, email, role, token_hash, invited_by, "
            "created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                invitation.id,
                invitation.project_id,
                invitation.email,
                invitation.role.value,
                token_hash,
                invitation.invited_by,
                to_db_timestamp(invitation.created_at),
                to_db_timestamp(invitation.expires_at),
            ],
        )
        return invitation

    def find_invitation(self, token_hash: str) -> Invitation | None:
        row = self._fetchone(
            f"SELECT {_INVITATION_COLUMNS} FROM invitations WHERE token_hash = ?", [token_hash]
        )
        return None if row is None else _invitation(row)

    def accept_invitation(self, invitation_id: str) -> None:
        self._execute(
            "UPDATE invitations SET accepted_at = ? WHERE id = ?",
            [to_db_timestamp(utcnow()), invitation_id],
        )

    def revoke_pending_invitation(self, project_id: str, invitation_id: str) -> Invitation | None:
        """Revoke an invitation not accepted yet: its registration token stops working, and
        the link says it was revoked."""
        pending = next(
            (
                i
                for i in self.list_invitations(project_id)
                if i.id == invitation_id and i.accepted_at is None
            ),
            None,
        )
        if pending is not None:
            self._execute(
                "UPDATE invitations SET revoked_at = ? WHERE id = ?",
                [to_db_timestamp(utcnow()), invitation_id],
            )
        return pending

    def list_invitations(self, project_id: str) -> list[Invitation]:
        rows = self._fetchall(
            f"SELECT {_INVITATION_COLUMNS} FROM invitations "
            "WHERE project_id = ? AND revoked_at IS NULL ORDER BY created_at",
            [project_id],
        )
        return [_invitation(row) for row in rows]

    # --- Throttling of authentication attempts ------------------------------------

    def get_throttle(self, key: str) -> tuple[list[datetime], datetime | None, int] | None:
        """Recent failures, end of the current lock and number of locks of a key."""
        row = self._fetchone(
            "SELECT failures, locked_until, lockouts FROM auth_throttle WHERE key = ?", [key]
        )
        if row is None:
            return None
        failures = [datetime.fromisoformat(v) for v in json.loads(row[0])]
        return failures, from_db_timestamp(row[1]), int(row[2])

    def save_throttle(
        self, key: str, failures: list[datetime], locked_until: datetime | None, lockouts: int
    ) -> None:
        self._execute(
            "INSERT INTO auth_throttle VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET "
            "failures = excluded.failures, locked_until = excluded.locked_until, "
            "lockouts = excluded.lockouts, updated_at = excluded.updated_at",
            [
                key,
                json.dumps([f.isoformat() for f in failures]),
                to_db_timestamp(locked_until),
                lockouts,
                to_db_timestamp(utcnow()),
            ],
        )

    def clear_throttle(self, key: str) -> None:
        self._execute("DELETE FROM auth_throttle WHERE key = ?", [key])

    # --- Audit -----------------------------------------------------------------------

    def add_audit(self, entry: AuditEntry) -> AuditEntry:
        self._execute(
            "INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                entry.id,
                to_db_timestamp(entry.at),
                entry.user_id,
                entry.user_email,
                entry.action,
                entry.project_id,
                entry.object_type,
                entry.object_id,
                json.dumps(entry.details, ensure_ascii=False, default=str),
            ],
        )
        return entry

    def _audit_where(self, project_id: str | None, query: AuditQuery) -> tuple[str, list[Any]]:
        where = ["(? IS NULL OR project_id = ?)", "(? IS NULL OR action = ?)",
                 "(? IS NULL OR object_type = ?)", "(? IS NULL OR occurred_at >= ?)"]  # fmt: skip
        since = to_db_timestamp(query.since)
        params: list[Any] = [project_id, project_id, query.action, query.action,
                             query.object_type, query.object_type, since, since]  # fmt: skip
        if query.user == SYSTEM_USER:
            where.append("user_email IS NULL")
        elif query.user:
            where.append("user_email = ?")
            params.append(query.user)
        if query.text and query.text.strip():
            where.append(
                "lower(concat_ws(' ', user_email, action, object_type, object_id, "
                "CAST(details AS VARCHAR))) LIKE ?"
            )
            params.append(f"%{query.text.strip().lower()}%")
        return " AND ".join(where), params

    def list_audit(
        self,
        project_id: str | None = None,
        *,
        limit: int = 200,
        offset: int = 0,
        action: str | None = None,
        query: AuditQuery | None = None,
    ) -> list[AuditEntry]:
        """Audit entries, newest first, matching ``query`` (or just ``action``)."""
        query = query or AuditQuery(action=action)
        where, params = self._audit_where(project_id, query)
        sql = (
            "SELECT id, occurred_at, user_id, user_email, action, project_id, object_type, "
            f"object_id, details FROM audit_log WHERE {where} "
            "ORDER BY occurred_at DESC, id LIMIT ? OFFSET ?"
        )
        rows = self._fetchall(sql, [*params, limit, offset])
        return [
            AuditEntry(
                id=r[0],
                at=from_db_timestamp_required(r[1]),
                user_id=r[2],
                user_email=r[3],
                action=r[4],
                project_id=r[5],
                object_type=r[6],
                object_id=r[7],
                details=json.loads(r[8]),
            )
            for r in rows
        ]

    def count_audit(self, project_id: str | None, query: AuditQuery) -> int:
        where, params = self._audit_where(project_id, query)
        row = self._fetchone(f"SELECT count(*) FROM audit_log WHERE {where}", params)
        return int(row[0]) if row else 0

    def audit_facets(self, project_id: str | None) -> AuditFacets:
        """Who acted, which actions and which objects, most frequent first: the menus of
        the audit filters, over the whole log rather than one page."""

        def most_frequent(column: str) -> list[str]:
            rows = self._fetchall(
                f"SELECT coalesce({column}, ?) AS value, count(*) AS n FROM audit_log "
                "WHERE (? IS NULL OR project_id = ?) GROUP BY value ORDER BY n DESC, value",
                [SYSTEM_USER, project_id, project_id],
            )
            return [str(r[0]) for r in rows]

        return AuditFacets(
            users=most_frequent("user_email"),
            actions=most_frequent("action"),
            objects=[o for o in most_frequent("object_type") if o != SYSTEM_USER],
        )


def new_id() -> str:
    return uuid.uuid4().hex
