"""Scheduled loads of a source or of every source of a connection."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from forja_core.scheduling.cron import Cron


class ScheduleKind(StrEnum):
    MANUAL = "manual"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    CRON = "cron"


TargetType = Literal["source", "connection"]

_DAY_NAMES = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


class ScheduleSpec(BaseModel):
    """When loads run. Weekdays: 0 is Monday."""

    model_config = ConfigDict(extra="forbid")

    kind: ScheduleKind = ScheduleKind.MANUAL
    minute: int = Field(default=0, ge=0, le=59)
    hour: int = Field(default=6, ge=0, le=23)
    weekdays: list[int] = Field(default_factory=lambda: [0])
    cron: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _valid(self) -> ScheduleSpec:
        if self.kind is ScheduleKind.WEEKLY:
            if not self.weekdays or any(not 0 <= d <= 6 for d in self.weekdays):
                raise ValueError("weekdays are 0 (Monday) to 6 (Sunday)")
            self.weekdays = sorted(set(self.weekdays))
        if self.kind is ScheduleKind.CRON:
            if not self.cron:
                raise ValueError("a cron schedule needs an expression")
            self.cron = Cron.parse(self.cron).expression
        return self

    def expression(self) -> str | None:
        """The equivalent cron expression; None for manual loads."""
        match self.kind:
            case ScheduleKind.MANUAL:
                return None
            case ScheduleKind.HOURLY:
                return f"{self.minute} * * * *"
            case ScheduleKind.DAILY:
                return f"{self.minute} {self.hour} * * *"
            case ScheduleKind.WEEKLY:
                days = ",".join(str((d + 1) % 7) for d in self.weekdays)
                return f"{self.minute} {self.hour} * * {days}"
            case ScheduleKind.CRON:
                return self.cron

    def describe(self) -> str:
        at = f"{self.hour:02d}:{self.minute:02d}"
        match self.kind:
            case ScheduleKind.MANUAL:
                return "Manuel"
            case ScheduleKind.HOURLY:
                return (
                    "Toutes les heures"
                    if self.minute == 0
                    else f"Toutes les heures, à la minute {self.minute}"
                )
            case ScheduleKind.DAILY:
                return f"Tous les jours à {at}"
            case ScheduleKind.WEEKLY:
                if self.weekdays == [0, 1, 2, 3, 4]:
                    return f"Du lundi au vendredi à {at}"
                if self.weekdays == [5, 6]:
                    return f"Le week-end à {at}"
                names = [_DAY_NAMES[d] for d in self.weekdays]
                listed = names[0] if len(names) == 1 else ", ".join(names[:-1]) + f" et {names[-1]}"
                return f"Chaque {listed} à {at}"
            case ScheduleKind.CRON:
                return _describe_cron(self.cron or "")


def _describe_cron(expression: str) -> str:
    """Plain words for the cron expressions the phrases produce."""
    fields = expression.split()
    if len(fields) == 5:
        minute, hour, day, month, weekday = fields
        if minute.startswith("*/") and fields[1:] == ["*", "*", "*", "*"]:
            return f"Toutes les {minute[2:]} minutes"
        if minute.isdigit() and hour.startswith("*/") and fields[2:] == ["*", "*", "*"]:
            suffix = "" if minute == "0" else f", à la minute {minute}"
            return f"Toutes les {hour[2:]} heures{suffix}"
        if (
            minute.isdigit()
            and hour.isdigit()
            and day.isdigit()
            and month == "*"
            and weekday == "*"
        ):
            ordinal = "1er" if day == "1" else day
            return f"Le {ordinal} de chaque mois à {int(hour):02d}:{int(minute):02d}"
    return f"Cron « {expression} »"


class Schedule(BaseModel):
    id: str
    project_id: str
    target_type: TargetType
    target_id: str
    spec: ScheduleSpec
    text: str | None = Field(default=None, description="The phrase typed in the interface")
    timezone: str
    enabled: bool = True
    description: str
    next_run_at: datetime | None = None
    last_run_at: datetime | None = None
    last_job_id: str | None = None
    last_status: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class ScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spec: ScheduleSpec | None = Field(default=None, description="Or text, in plain French")
    text: str | None = Field(default=None, max_length=200)
    enabled: bool = True

    @model_validator(mode="after")
    def _one(self) -> ScheduleUpdate:
        if self.spec is None and not (self.text and self.text.strip()):
            raise ValueError("give a schedule: spec or text")
        return self


class ScheduleInterpretation(BaseModel):
    """What a typed phrase means, before it is saved."""

    text: str
    spec: ScheduleSpec
    description: str
    cron: str | None
    next_runs: list[datetime]
    timezone: str


class ScheduleParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=200)
