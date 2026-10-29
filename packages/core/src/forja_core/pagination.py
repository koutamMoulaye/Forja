"""Pages of the long lists the API returns (runs, data marts, audit, notifications)."""

from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class Page[T](BaseModel):
    items: list[T]
    total: int = Field(description="Items matching the request, all pages")
    offset: int
    limit: int
