"""Five-field cron expressions (minute hour day-of-month month day-of-week).

Supported: ``*``, values, ranges ``a-b``, steps ``*/n`` and ``a-b/n``, lists, and the
names of months (jan..dec) and days (mon..sun; 0 and 7 are Sunday). As in Vixie cron,
when both the day of month and the day of week are restricted, a day matching either
one matches. Times are local to the schedule's time zone; when a clock change skips a
time, the run happens right after the change, and a repeated time runs once.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from forja_core.errors import ForjaError

_MONTHS = {
    name: index
    for index, name in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
        start=1,
    )
}
_DAYS = {
    name: index for index, name in enumerate(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])
}
_SEARCH_DAYS = 366 * 5


class CronError(ForjaError):
    code = "invalid_schedule"


def _value(token: str, low: int, high: int, names: dict[str, int]) -> int:
    lowered = token.lower()
    if lowered in names:
        return names[lowered]
    if not token.isdigit():
        raise CronError(f"'{token}' is not a valid value")
    value = int(token)
    if not low <= value <= high:
        raise CronError(f"{value} is outside {low}-{high}")
    return value


def _field(text: str, low: int, high: int, names: dict[str, int] | None = None) -> frozenset[int]:
    names = names or {}
    values: set[int] = set()
    for part in text.split(","):
        if not part:
            raise CronError("empty list item")
        base, _, step_text = part.partition("/")
        step = 1
        if step_text:
            if not step_text.isdigit() or int(step_text) == 0:
                raise CronError(f"'{step_text}' is not a valid step")
            step = int(step_text)
        if base == "*":
            start, end = low, high
        elif "-" in base:
            first, last = base.split("-", 1)
            start, end = _value(first, low, high, names), _value(last, low, high, names)
            if start > end:
                raise CronError(f"range '{base}' is reversed")
        else:
            start = _value(base, low, high, names)
            end = high if step_text else start
        values.update(range(start, end + 1, step))
    return frozenset(values)


@dataclass(frozen=True)
class Cron:
    expression: str
    minutes: frozenset[int]
    hours: frozenset[int]
    days: frozenset[int]
    months: frozenset[int]
    weekdays: frozenset[int]  # 0 = Sunday
    any_day: bool
    any_weekday: bool

    @classmethod
    def parse(cls, expression: str) -> Cron:
        fields = expression.split()
        if len(fields) != 5:
            raise CronError(
                "a cron expression has five fields: minute hour day month weekday",
                details={"expression": expression},
            )
        try:
            weekdays = _field(fields[4], 0, 7, _DAYS)
            return cls(
                expression=" ".join(fields),
                minutes=_field(fields[0], 0, 59),
                hours=_field(fields[1], 0, 23),
                days=_field(fields[2], 1, 31),
                months=_field(fields[3], 1, 12, _MONTHS),
                weekdays=frozenset(0 if d == 7 else d for d in weekdays),
                any_day=fields[2] == "*",
                any_weekday=fields[4] == "*",
            )
        except CronError as exc:
            raise CronError(
                f"invalid cron expression: {exc.message}", details={"expression": expression}
            ) from exc

    def _day_matches(self, day: date) -> bool:
        if day.month not in self.months:
            return False
        in_month = day.day in self.days
        in_week = (day.isoweekday() % 7) in self.weekdays
        if self.any_day and self.any_weekday:
            return True
        if self.any_day:
            return in_week
        if self.any_weekday:
            return in_month
        return in_month or in_week

    def next_after(self, after: datetime, zone: ZoneInfo) -> datetime:
        """First run strictly after ``after`` (aware), returned in UTC."""
        local = after.astimezone(zone)
        start = local.replace(second=0, microsecond=0) + timedelta(minutes=1)
        day = start.date()
        hours, minutes = sorted(self.hours), sorted(self.minutes)
        for _ in range(_SEARCH_DAYS):
            if self._day_matches(day):
                for hour in hours:
                    for minute in minutes:
                        candidate = datetime.combine(day, time(hour, minute), tzinfo=zone)
                        # Round-tripping through UTC moves a skipped local time forward.
                        moment = candidate.astimezone(UTC)
                        if moment >= start.astimezone(UTC):
                            return moment
            day += timedelta(days=1)
        raise CronError("this cron expression never runs", details={"expression": self.expression})
