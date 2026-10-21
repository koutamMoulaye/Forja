"""Journal of language model calls.

An entry never contains the prompt or the answer: only a SHA-256 of the prompt (to
group identical calls), the provider and model, the outcome, the duration, the
number of attempts and the token counts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LLMCall(BaseModel):
    id: str
    project_id: str | None = None
    provider: str
    model: str
    purpose: str = Field(description="What the call was for, e.g. gold_plan")
    prompt_sha256: str
    status: Literal["succeeded", "failed"]
    attempts: int
    duration_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    error_type: str | None = None
    created_at: datetime
