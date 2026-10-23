"""Identity providers: who vouches for the person logging in.

Forja ships the password provider (argon2 hashes in the catalog). An OpenID Connect
provider will plug in behind the same interface: it authenticates a person with
the external issuer, then Forja finds or creates the matching user (by issuer and
subject, ``users.identity_provider`` / ``users.external_subject``) and issues its
own tokens exactly as after a password login. Roles stay managed in Forja.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_HASHER = PasswordHasher()
# Verified when the email is unknown, so that timing does not reveal which emails exist.
_DUMMY_HASH = _HASHER.hash("forja-timing-equalizer")


def hash_password(password: str) -> str:
    return _HASHER.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _HASHER.verify(password_hash or _DUMMY_HASH, password) and bool(password_hash)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _HASHER.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class ExternalIdentity:
    """A person as asserted by an identity provider."""

    provider: str
    subject: str
    email: str
    email_verified: bool = False
    groups: tuple[str, ...] = field(default_factory=tuple)


class IdentityProvider(Protocol):
    name: str

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        """Where to send the browser to log in (redirect-based providers)."""
        ...

    def authenticate(self, params: Mapping[str, str], redirect_uri: str) -> ExternalIdentity:
        """Exchange the callback parameters (code, state) for a verified identity."""
        ...


@dataclass(frozen=True)
class OIDCSettings:
    issuer: str
    client_id: str
    client_secret: str
    scopes: tuple[str, ...] = ("openid", "email", "profile")


class OIDCIdentityProvider:
    """Planned: discovery, authorization code flow with PKCE, ID token validation."""

    name = "oidc"

    def __init__(self, settings: OIDCSettings) -> None:
        self.settings = settings

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError("OIDC login is not implemented yet")

    def authenticate(self, params: Mapping[str, str], redirect_uri: str) -> ExternalIdentity:
        raise NotImplementedError("OIDC login is not implemented yet")
