"""Relations (foreign keys) between Silver tables of a project."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RelationStatus(StrEnum):
    SUGGESTED = "suggested"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class RelationOrigin(StrEnum):
    DETECTED = "detected"
    MANUAL = "manual"


Cardinality = Literal["1-1", "N-1"]


class Relation(BaseModel):
    """``from_table.from_column`` references the key ``to_table.to_column``."""

    id: str
    project_id: str
    from_source_id: str
    from_source: str
    from_table: str
    from_column: str
    to_source_id: str
    to_source: str
    to_table: str
    to_column: str
    inclusion_ratio: float = Field(
        ge=0, le=1, description="Share of distinct from_column values found in to_column"
    )
    name_similarity: float = Field(ge=0, le=1)
    type_compatible: bool
    cardinality: Cardinality
    confidence: float = Field(ge=0, le=1)
    from_distinct: int = Field(description="Distinct values of from_column")
    sample_size: int = Field(description="Distinct values actually checked")
    explanation: str
    status: RelationStatus
    origin: RelationOrigin
    created_at: datetime
    updated_at: datetime

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self.from_table, self.from_column, self.to_table, self.to_column)


class RelationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_source_id: str
    from_column: str = Field(description="Silver column name")
    to_source_id: str
    to_column: str = Field(description="Silver column name of a key")
