"""Authentication: bootstrap administrator, login, rotating refresh tokens, API keys,
invitations, project memberships and the audit log.

- Access tokens are short JWTs (HS256) bound to a session; revoking the session (logout,
  password change, refresh token reuse) invalidates them at once.
- Refresh tokens are opaque and single-use: each refresh returns a new one. Presenting
  a used refresh token again means it leaked: the whole session is revoked.
- API keys (``fja_<prefix>_<secret>``) are personal, stored as SHA-256 digests,
  recognizable by their prefix and revocable.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from pathlib import Path
from typing import Any, Literal

import jwt

from forja_core.auth.identity import hash_password, needs_rehash, verify_password
from forja_core.auth.models import (
    ApiKey,
    AuditEntry,
    CreatedApiKey,
    Invitation,
    InvitationCreate,
    InvitationStatus,
    Membership,
    Principal,
    Role,
    TokenPair,
    User,
)
from forja_core.auth.throttle import Limit, Throttle, TooManyAttemptsError
from forja_core.catalog import Catalog
from forja_core.catalog.auth import new_id
from forja_core.config import Settings
from forja_core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    PlanValidationError,
    UnauthorizedError,
)
from forja_core.logging import get_logger
from forja_core.utils import utcnow

log = get_logger(__name__)

_ALGORITHM = "HS256"
_KEY_PREFIX = "fja"
_REFRESH_PREFIX = "frt"


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _signing_key(settings: Settings) -> str:
    if settings.auth_secret is not None:
        return settings.auth_secret.get_secret_value()
    directory = settings.secrets_dir.expanduser()
    path = directory / "jwt.key"
    if not path.exists():
        directory.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w", encoding="ascii") as handle:
                handle.write(secrets.token_hex(32))
    return Path(path).read_text(encoding="ascii").strip()


class AuthService:
    def __init__(self, catalog: Catalog, settings: Settings) -> None:
        self.catalog = catalog
        self.settings = settings
        self._key = _signing_key(settings)
        self.throttle = Throttle(catalog, settings)

    # --- Bootstrap -------------------------------------------------------------------

    def bootstrap(self) -> User | None:
        """Create the instance administrator when the catalog has no user yet.

        Its password is random and logged once (or FORJA_AUTH_BOOTSTRAP_PASSWORD); it
        must be changed at first login before anything else is allowed.
        """
        if self.catalog.count_users():
            return None
        configured = self.settings.auth_bootstrap_password
        password = configured.get_secret_value() if configured else secrets.token_urlsafe(18)
        admin = self.catalog.add_user(
            User(
                id=new_id(),
                email=self.settings.auth_bootstrap_email.strip().lower(),
                is_admin=True,
                must_change_password=True,
                created_at=utcnow(),
            ),
            hash_password(password),
        )
        if configured is None:
            log.warning(
                "bootstrap_admin_created",
                email=admin.email,
                password=password,
                note="shown once: log in and change it (POST /auth/password)",
            )
        else:
            log.warning("bootstrap_admin_created", email=admin.email)
        self.audit(None, "user.bootstrap", object_type="user", object_id=admin.id)
        return admin

    # --- Passwords and tokens --------------------------------------------------------

    def check_password_policy(self, password: str, email: str) -> None:
        minimum = self.settings.auth_password_min_length
        problems = []
        if len(password) < minimum:
            problems.append(f"au moins {minimum} caractères")
        if password.lower() == email.lower() or password.lower() in email.lower():
            problems.append("différent de l'adresse email")
        if len(set(password)) < 5:
            problems.append("au moins 5 caractères différents")
        if problems:
            raise PlanValidationError(
                "mot de passe trop faible : " + ", ".join(problems),
                details={"requirements": problems},
            )

    def _guard(self, limits: list[Limit], action: str, details: dict[str, Any]) -> None:
        """Refuse while a key is locked, before any credential is checked."""
        try:
            self.throttle.check(limits)
        except TooManyAttemptsError as exc:
            self.audit(
                None, f"{action}_blocked", details={**details, "retry_after": exc.retry_after}
            )
            raise

    def _failed(self, limits: list[Limit], action: str, details: dict[str, Any]) -> None:
        self.audit(None, f"{action}_failed", details=details)
        for key in self.throttle.failure(limits):
            kind = key.split(":")[1]
            log.warning("auth_throttled", action=action, kind=kind)
            self.audit(None, "auth.throttled", details={**details, "action": action, "on": kind})

    def login(self, email: str, password: str, *, ip: str | None = None) -> TokenPair:
        limits = self.throttle.login_limits(email, ip)
        details = {"email": email, "ip": ip}
        self._guard(limits, "auth.login", details)
        user = self.catalog.find_user_by_email(email)
        stored = self.catalog.password_hash(user.id) if user else None
        if user is None or user.disabled or not verify_password(stored, password):
            # The same answer, and the same counting, whether the account exists or not.
            self._failed(limits, "auth.login", details)
            raise UnauthorizedError("invalid email or password")
        self.throttle.success([limits[0].key])
        if stored and needs_rehash(stored):
            self.catalog.set_password(
                user.id, hash_password(password), must_change=user.must_change_password
            )
        self.audit(user, "auth.login", object_type="user", object_id=user.id)
        return self._new_session(user)

    def _new_session(self, user: User) -> TokenPair:
        session_id = new_id()
        expires = utcnow() + timedelta(days=self.settings.auth_refresh_token_days)
        self.catalog.add_session(session_id, user.id, expires)
        return self._tokens(user, session_id)

    def _tokens(self, user: User, session_id: str) -> TokenPair:
        now = utcnow()
        lifetime = timedelta(minutes=self.settings.auth_access_token_minutes)
        access = jwt.encode(
            {
                "sub": user.id,
                "sid": session_id,
                "typ": "access",
                "iat": now,
                "exp": now + lifetime,
                "jti": new_id(),
            },
            self._key,
            algorithm=_ALGORITHM,
        )
        refresh = f"{_REFRESH_PREFIX}_{secrets.token_urlsafe(32)}"
        self.catalog.add_refresh_token(_digest(refresh), session_id)
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=int(lifetime.total_seconds()),
            must_change_password=user.must_change_password,
        )

    def refresh(self, refresh_token: str, *, ip: str | None = None) -> TokenPair:
        limits = self.throttle.ip_limits("refresh", ip)
        self._guard(limits, "auth.refresh", {"ip": ip})
        used = self.catalog.use_refresh_token(_digest(refresh_token))
        if used is None:
            self._failed(limits, "auth.refresh", {"ip": ip})
            raise UnauthorizedError("invalid refresh token")
        session_id, already_used = used
        if already_used:
            # A refresh token is single-use: a second use means it was stolen.
            self.catalog.revoke_session(session_id, "refresh_token_reuse")
            user_id = self.catalog.session_user(session_id)
            log.warning("refresh_token_reuse", session_id=session_id, user_id=user_id)
            self.audit(None, "auth.refresh_reuse", object_type="session", object_id=session_id)
            self.throttle.failure(limits)
            raise UnauthorizedError("refresh token already used: the session is revoked")
        if not self.catalog.session_active(session_id):
            raise UnauthorizedError("session expired or revoked")
        user_id = self.catalog.session_user(session_id)
        assert user_id is not None
        user = self.catalog.get_user(user_id)
        if user.disabled:
            raise UnauthorizedError("account disabled")
        return self._tokens(user, session_id)

    def logout(self, principal: Principal) -> None:
        if principal.session_id is not None:
            self.catalog.revoke_session(principal.session_id, "logout")
        self.audit(principal.user, "auth.logout")

    def change_password(self, principal: Principal, current: str, new: str) -> TokenPair:
        user = principal.user
        if not verify_password(self.catalog.password_hash(user.id), current):
            raise UnauthorizedError("current password is incorrect")
        if current == new:
            raise PlanValidationError("le nouveau mot de passe doit être différent de l'ancien")
        self.check_password_policy(new, user.email)
        self.catalog.set_password(user.id, hash_password(new), must_change=False)
        # Every other session (and the current one) ends: a fresh pair is returned.
        self.catalog.revoke_user_sessions(user.id, "password_changed")
        self.audit(user, "auth.password_changed", object_type="user", object_id=user.id)
        return self._new_session(self.catalog.get_user(user.id))

    # --- Authentication of a request -------------------------------------------------

    def authenticate(self, credential: str) -> Principal:
        """A principal from an access token or a personal API key."""
        if credential.startswith(f"{_KEY_PREFIX}_"):
            return self._from_api_key(credential)
        try:
            claims: dict[str, Any] = jwt.decode(
                credential,
                self._key,
                algorithms=[_ALGORITHM],
                options={"require": ["exp", "sub", "sid"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise UnauthorizedError("access token expired: refresh it") from exc
        except jwt.InvalidTokenError as exc:
            raise UnauthorizedError("invalid access token") from exc
        if claims.get("typ") != "access" or not self.catalog.session_active(str(claims["sid"])):
            raise UnauthorizedError("session expired or revoked")
        user = self.catalog.get_user(str(claims["sub"]))
        if user.disabled:
            raise UnauthorizedError("account disabled")
        return Principal(
            user=user,
            via="password",
            session_id=str(claims["sid"]),
            roles=self.catalog.user_roles(user.id),
        )

    def _from_api_key(self, key: str) -> Principal:
        parts = key.split("_")
        if len(parts) != 3:
            raise UnauthorizedError("invalid API key")
        found = self.catalog.find_api_key(parts[1])
        if found is None or not hmac.compare_digest(found[1], _digest(key)):
            raise UnauthorizedError("invalid API key")
        api_key = found[0]
        if api_key.revoked_at is not None:
            raise UnauthorizedError("API key revoked")
        user = self.catalog.get_user(api_key.user_id)
        if user.disabled:
            raise UnauthorizedError("account disabled")
        self.catalog.touch_api_key(api_key.id)
        return Principal(
            user=user, via="api_key", api_key_id=api_key.id, roles=self.catalog.user_roles(user.id)
        )

    # --- API keys --------------------------------------------------------------------

    def create_api_key(self, principal: Principal, name: str) -> CreatedApiKey:
        prefix = secrets.token_hex(4)
        key = f"{_KEY_PREFIX}_{prefix}_{secrets.token_urlsafe(32).replace('_', '-')}"
        stored = self.catalog.add_api_key(
            ApiKey(
                id=new_id(),
                user_id=principal.id,
                name=name,
                prefix=prefix,
                created_at=utcnow(),
            ),
            _digest(key),
        )
        self.audit(principal.user, "api_key.create", object_type="api_key", object_id=stored.id)
        return CreatedApiKey(**stored.model_dump(), key=key)

    def revoke_api_key(self, principal: Principal, key_id: str) -> ApiKey:
        revoked = self.catalog.revoke_api_key(principal.id, key_id)
        self.audit(principal.user, "api_key.revoke", object_type="api_key", object_id=key_id)
        return revoked

    # --- Projects, members and invitations -------------------------------------------

    def invite(
        self, principal: Principal, project_id: str, request: InvitationCreate
    ) -> Invitation:
        """Add an existing user at once, or create a single-use registration token."""
        if self.settings.auth_mode != "multi":
            raise ForbiddenError(
                "invitations need FORJA_AUTH_MODE=multi (local mode has a single administrator)"
            )
        self.catalog.get_project(project_id)
        now = utcnow()
        invitation = Invitation(
            id=new_id(),
            project_id=project_id,
            email=request.email,
            role=request.role,
            invited_by=principal.id,
            created_at=now,
            expires_at=now + timedelta(days=self.settings.auth_invitation_days),
        )
        existing = self.catalog.find_user_by_email(request.email)
        token = None if existing else secrets.token_urlsafe(32)
        self.catalog.add_invitation(invitation, _digest(token or new_id()))
        if existing is not None:
            self.catalog.set_membership(project_id, existing.id, request.role)
            self.catalog.accept_invitation(invitation.id)
            invitation.accepted_at = utcnow()
        self.audit(
            principal.user,
            "member.invite",
            project_id=project_id,
            object_type="invitation",
            object_id=invitation.id,
            details={"email": request.email, "role": request.role.value},
        )
        return invitation.model_copy(update={"token": token})

    def revoke_invitation(self, principal: Principal, project_id: str, invitation_id: str) -> None:
        invitation = self.catalog.revoke_pending_invitation(project_id, invitation_id)
        if invitation is None:
            raise NotFoundError(
                "no pending invitation with this id", details={"invitation_id": invitation_id}
            )
        self.audit(
            principal.user,
            "member.invitation_revoke",
            project_id=project_id,
            object_type="invitation",
            object_id=invitation_id,
            details={"email": invitation.email},
        )

    def invitation_status(self, token: str, *, ip: str | None = None) -> InvitationStatus:
        """What a registration link leads to; unknown tokens count as failed attempts."""
        limits = self.throttle.ip_limits("register", ip)
        self._guard(limits, "auth.register", {"ip": ip})
        invitation = self.catalog.find_invitation(_digest(token))
        if invitation is None:
            self._failed(limits, "auth.register", {"ip": ip})
            return InvitationStatus(status="unknown")
        status: Literal["valid", "expired", "revoked", "used"] = "valid"
        if invitation.revoked_at is not None:
            status = "revoked"
        elif invitation.accepted_at is not None:
            status = "used"
        elif invitation.expires_at < utcnow():
            status = "expired"
        valid = status == "valid"
        return InvitationStatus(
            status=status,
            email=invitation.email if valid else None,
            role=invitation.role if valid else None,
            project_name=self.catalog.get_project(invitation.project_id).name,
            expires_at=invitation.expires_at,
        )

    def register(
        self, token: str, password: str, *, name: str | None = None, ip: str | None = None
    ) -> TokenPair:
        limits = self.throttle.ip_limits("register", ip)
        self._guard(limits, "auth.register", {"ip": ip})
        invitation = self.catalog.find_invitation(_digest(token))
        if invitation is None or invitation.accepted_at is not None:
            self._failed(limits, "auth.register", {"ip": ip})
            raise UnauthorizedError("invalid or already used invitation")
        if invitation.revoked_at is not None:
            self._failed(limits, "auth.register", {"ip": ip})
            raise UnauthorizedError("invitation revoked")
        if invitation.expires_at < utcnow():
            self._failed(limits, "auth.register", {"ip": ip})
            raise UnauthorizedError("invitation expired")
        if self.catalog.find_user_by_email(invitation.email) is not None:
            raise ConflictError("this email already has an account: log in instead")
        self.check_password_policy(password, invitation.email)
        user = self.catalog.add_user(
            User(
                id=new_id(),
                email=invitation.email,
                name=(name or "").strip() or None,
                created_at=utcnow(),
            ),
            hash_password(password),
        )
        self.catalog.set_membership(invitation.project_id, user.id, invitation.role)
        self.catalog.accept_invitation(invitation.id)
        self.audit(
            user,
            "member.register",
            project_id=invitation.project_id,
            object_type="user",
            object_id=user.id,
            details={"role": invitation.role.value},
        )
        return self._new_session(user)

    def set_role(
        self, principal: Principal, project_id: str, user_id: str, role: Role
    ) -> Membership:
        self.catalog.get_project(project_id)
        self.catalog.get_user(user_id)
        membership = self.catalog.set_membership(project_id, user_id, role)
        self.audit(
            principal.user,
            "member.role",
            project_id=project_id,
            object_type="user",
            object_id=user_id,
            details={"role": role.value},
        )
        return membership

    def remove_member(self, principal: Principal, project_id: str, user_id: str) -> None:
        self.catalog.delete_membership(project_id, user_id)
        self.audit(
            principal.user,
            "member.remove",
            project_id=project_id,
            object_type="user",
            object_id=user_id,
        )

    # --- Audit -----------------------------------------------------------------------

    def audit(
        self,
        user: User | Principal | None,
        action: str,
        *,
        project_id: str | None = None,
        object_type: str | None = None,
        object_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> AuditEntry:
        actor = user.user if isinstance(user, Principal) else user
        return self.catalog.add_audit(
            AuditEntry(
                id=new_id(),
                at=utcnow(),
                user_id=actor.id if actor else None,
                user_email=actor.email if actor else None,
                action=action,
                project_id=project_id,
                object_type=object_type,
                object_id=object_id,
                details=details or {},
            )
        )
