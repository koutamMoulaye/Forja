"""API-specific response models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PreviewResponse(BaseModel):
    source_id: str
    columns: list[str]
    rows: list[dict[str, Any]]
    limit: int
    total_rows: int


class TablePreview(BaseModel):
    table_id: str
    columns: list[str]
    rows: list[dict[str, Any]]
    limit: int
    total_rows: int


class HealthResponse(BaseModel):
    status: str
    version: str
    auth_mode: str = Field(
        description="local (single administrator) or multi (invitations); "
        "lets the sign-in screen adapt before anyone is authenticated"
    )
