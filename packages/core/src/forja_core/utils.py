"""Small shared helpers."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def slugify(value: str, *, default: str = "source", max_length: int = 63) -> str:
    ascii_value = strip_accents(value).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")
    slug = slug[:max_length].strip("_")
    return slug or default


def unique_name(base: str, taken: Iterable[str]) -> str:
    """Return ``base`` or ``base_<n>`` so that it does not collide (case-insensitively)."""
    lowered = {name.lower() for name in taken}
    if base.lower() not in lowered:
        return base
    index = 2
    while f"{base}_{index}".lower() in lowered:
        index += 1
    return f"{base}_{index}"


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
