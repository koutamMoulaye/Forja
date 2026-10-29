"""Notifications: what a user is told about, read or not, with the action that follows."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class NotificationKind(StrEnum):
    RUN_SUCCEEDED = "run_succeeded"
    RUN_FAILED = "run_failed"
    PLAN_REVIEW = "plan_review"
    MART_APPROVAL = "mart_approval"
    MART_APPROVED = "mart_approved"
    MART_REJECTED = "mart_rejected"
    MART_PUBLISHED = "mart_published"
    AI_JOB_DONE = "ai_job_done"
    SCHEMA_DRIFT = "schema_drift"


TargetType = Literal["run", "source", "gold_plan", "mart", "conversation"]


class NotificationAction(BaseModel):
    """What the notification leads to; the front turns the target into a page."""

    label: str
    target_type: TargetType
    target_id: str


class Notification(BaseModel):
    id: str
    user_id: str
    project_id: str | None = None
    kind: NotificationKind
    title: str
    detail: str = ""
    action: NotificationAction | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[Notification]
    total: int = Field(description="Notifications matching the filter")
    unread: int = Field(description="Unread notifications of the user, all pages")
    offset: int
    limit: int


class ReadRequest(BaseModel):
    ids: list[str] | None = Field(
        default=None, description="Notifications to mark as read; all of them when omitted"
    )
