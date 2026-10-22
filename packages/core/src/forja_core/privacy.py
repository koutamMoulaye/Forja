"""Treatment of personal data leaving Forja: pseudonymization, partial masking, removal.

Silver tables keep values in clear. Everything published (serving database, file
exports) goes through :func:`treat_batch`, which applies the treatment chosen
in the transformation plan.

Pseudonymization is an HMAC-SHA256 keyed by a random salt per project. Salts are
stored outside the repository and the data directory (``FORJA_SECRETS_DIR``):
without the salt, a pseudonym cannot be linked back to a value by brute force,
and the same value always gets the same pseudonym within a project, so joins
between published tables keep working.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

import pyarrow as pa

from forja_core.profiling.models import PiiType
from forja_core.silver.dbt.sql import ident
from forja_core.silver.plan import PiiTreatment, TransformationPlan

SALT_BYTES = 32
_MASK = "***"


class ProjectSecrets:
    """Per-project salts, one file each, readable only by the current user."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory.expanduser()

    def _path(self, project_id: str) -> Path:
        if not re.fullmatch(r"[A-Za-z0-9_-]+", project_id):
            raise ValueError(f"invalid project id: {project_id!r}")
        return self.directory / f"{project_id}.salt"

    def salt(self, project_id: str) -> bytes:
        path = self._path(project_id)
        if not path.exists():
            self.directory.mkdir(parents=True, exist_ok=True)
            try:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                pass
            else:
                with os.fdopen(fd, "w", encoding="ascii") as handle:
                    handle.write(secrets.token_hex(SALT_BYTES))
        return bytes.fromhex(path.read_text(encoding="ascii").strip())


def pseudonymize(value: str | None, salt: bytes) -> str | None:
    if value is None:
        return None
    return hmac.new(salt, value.encode("utf-8"), hashlib.sha256).hexdigest()


def _mask_email(value: str) -> str:
    local, at, domain = value.partition("@")
    if not at:
        return _mask_text(value)
    return f"{local[:1]}{_MASK}@{domain}"


def _mask_phone(value: str) -> str:
    """Hide every digit but the last two, keeping separators: ``** ** ** ** 78``."""
    digits = [i for i, ch in enumerate(value) if ch.isdigit()]
    hidden = set(digits[:-2])
    return "".join("*" if i in hidden else ch for i, ch in enumerate(value))


def _mask_iban(value: str) -> str:
    compact = value.replace(" ", "")
    if len(compact) <= 7:
        return _MASK
    return f"{compact[:4]}{'*' * (len(compact) - 7)}{compact[-3:]}"


def _mask_text(value: str) -> str:
    words = value.split()
    if not words:
        return value
    return " ".join(f"{word[:1]}{_MASK}" for word in words)


def mask(value: str | None, pii_type: str | None) -> str | None:
    """Partial masking that keeps a recognizable shape for business users."""
    if value is None:
        return None
    match pii_type:
        case PiiType.EMAIL:
            return _mask_email(value)
        case PiiType.PHONE:
            return _mask_phone(value)
        case PiiType.IBAN:
            return _mask_iban(value)
        case _:
            return _mask_text(value)


@dataclass(frozen=True)
class TreatedColumn:
    """A published column and the treatment applied to its values."""

    name: str
    treatment: PiiTreatment = PiiTreatment.NONE
    pii_type: PiiType | None = None


def published_columns(plan: TransformationPlan, available: Iterable[str]) -> list[TreatedColumn]:
    """Silver plan columns present in the built table and not dropped from published data."""
    present = set(available)
    return [
        TreatedColumn(c.target_column, c.pii_treatment, c.pii_type)
        for c in plan.included_columns()
        if c.target_column in present and c.pii_treatment is not PiiTreatment.DROP
    ]


def select_sql(columns: Sequence[TreatedColumn], relation: str) -> str:
    """Query reading the published columns; treated columns are read as text."""
    expressions = [
        ident(c.name)
        if c.treatment is PiiTreatment.NONE
        else f"cast({ident(c.name)} as varchar) as {ident(c.name)}"
        for c in columns
    ]
    return f"SELECT {', '.join(expressions)} FROM {relation}"


def treat_batch(
    batch: pa.RecordBatch, columns: Sequence[TreatedColumn], salt: bytes
) -> pa.RecordBatch:
    """Apply each column's treatment to a batch read with :func:`select_sql`."""
    arrays: list[pa.Array] = []
    for column, array in zip(columns, batch.columns, strict=True):
        match column.treatment:
            case PiiTreatment.HASH:
                values = [pseudonymize(v, salt) for v in array.to_pylist()]
                arrays.append(pa.array(values, type=pa.string()))
            case PiiTreatment.MASK:
                kind = None if column.pii_type is None else column.pii_type.value
                arrays.append(pa.array([mask(v, kind) for v in array.to_pylist()], pa.string()))
            case _:
                arrays.append(array)
    return pa.RecordBatch.from_arrays(arrays, names=[c.name for c in columns])
