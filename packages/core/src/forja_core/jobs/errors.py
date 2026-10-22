"""Errors of runs that still carry measurements."""

from __future__ import annotations

from forja_core.errors import BuildError
from forja_core.jobs.models import RunMetrics


class RunFailedError(BuildError):
    """dbt failed; the metrics of what could be measured are attached."""

    def __init__(self, message: str, metrics: RunMetrics) -> None:
        super().__init__(message)
        self.metrics = metrics
