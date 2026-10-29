"""Encryption at rest of connection credentials.

Credentials are encrypted with AES-256-GCM. The key is a random 32-byte file,
``connections.key``, in ``FORJA_SECRETS_DIR``: outside the repository and the data
directory, readable by the current user only. The catalog holds only ciphertext, bound
to its connection id (associated data), so a ciphertext copied onto another connection
does not decrypt.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from forja_core.errors import ForjaError

_PREFIX = "v1:"
_NONCE_BYTES = 12


class VaultError(ForjaError):
    code = "secrets_unreadable"


class SecretVault:
    FILENAME = "connections.key"

    def __init__(self, directory: Path) -> None:
        self.path = directory.expanduser() / self.FILENAME

    def _key(self) -> bytes:
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            try:
                fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                pass
            else:
                with os.fdopen(fd, "w", encoding="ascii") as handle:
                    handle.write(secrets.token_hex(32))
        try:
            key = bytes.fromhex(self.path.read_text(encoding="ascii").strip())
        except ValueError as exc:
            raise VaultError("the connection key file is damaged") from exc
        if len(key) != 32:
            raise VaultError("the connection key file is damaged")
        return key

    def encrypt(self, values: dict[str, str], *, bound_to: str) -> str | None:
        if not values:
            return None
        nonce = secrets.token_bytes(_NONCE_BYTES)
        data = json.dumps(values, ensure_ascii=False).encode("utf-8")
        sealed = AESGCM(self._key()).encrypt(nonce, data, bound_to.encode("utf-8"))
        return _PREFIX + base64.b64encode(nonce + sealed).decode("ascii")

    def decrypt(self, token: str | None, *, bound_to: str) -> dict[str, str]:
        if not token:
            return {}
        if not token.startswith(_PREFIX):
            raise VaultError("unknown credential format")
        raw = base64.b64decode(token[len(_PREFIX) :])
        nonce, sealed = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
        try:
            data = AESGCM(self._key()).decrypt(nonce, sealed, bound_to.encode("utf-8"))
        except InvalidTag as exc:
            raise VaultError(
                "credentials cannot be decrypted: the key in FORJA_SECRETS_DIR changed; "
                "enter them again"
            ) from exc
        values: dict[str, str] = json.loads(data.decode("utf-8"))
        return values


def redact(message: str, values: dict[str, str] | list[str]) -> str:
    """Remove secret values from an error message before it is logged or returned."""
    for value in values.values() if isinstance(values, dict) else values:
        if value and len(value) >= 3:
            message = message.replace(value, "***")
    return message
