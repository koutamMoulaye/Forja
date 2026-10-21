"""Domain errors. Each error carries a stable machine-readable ``code``."""

from __future__ import annotations

from typing import Any


class ForjaError(Exception):
    code = "forja_error"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(ForjaError):
    code = "not_found"


class ProjectNotFoundError(NotFoundError):
    code = "project_not_found"


class SourceNotFoundError(NotFoundError):
    code = "source_not_found"


class ProfileNotFoundError(NotFoundError):
    code = "profile_not_found"


class ConflictError(ForjaError):
    code = "conflict"


class IngestionError(ForjaError):
    code = "ingestion_error"


class UnsupportedFormatError(IngestionError):
    code = "unsupported_format"


class EmptyFileError(IngestionError):
    code = "empty_file"


class CorruptedFileError(IngestionError):
    code = "corrupted_file"


class EncodingDetectionError(IngestionError):
    code = "unknown_encoding"


class DuplicateColumnsError(IngestionError):
    code = "duplicate_columns"


class FileTooLargeError(IngestionError):
    code = "file_too_large"


class ProfilingError(ForjaError):
    code = "profiling_error"


class PlanNotFoundError(NotFoundError):
    code = "plan_not_found"


class PlanValidationError(ForjaError):
    code = "invalid_plan"


class PlanStateError(ConflictError):
    code = "invalid_plan_state"
