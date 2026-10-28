"""Metadata catalog persisted in a DuckDB database (``forja_meta.duckdb``)."""

from __future__ import annotations

from forja_core.catalog.migrations import SCHEMA_VERSION
from forja_core.catalog.notifications import NotificationsMixin


class Catalog(NotificationsMixin):
    def __enter__(self) -> Catalog:
        return self


__all__ = ["SCHEMA_VERSION", "Catalog"]
