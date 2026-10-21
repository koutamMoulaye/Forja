"""Mapping of domain errors to HTTP responses."""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from forja_core.errors import (
    ConflictError,
    FileTooLargeError,
    ForjaError,
    IngestionError,
    NotFoundError,
    UnsupportedFormatError,
)
from forja_core.logging import get_logger

log = get_logger(__name__)

_STATUS_BY_ERROR: tuple[tuple[type[ForjaError], int], ...] = (
    (NotFoundError, status.HTTP_404_NOT_FOUND),
    (ConflictError, status.HTTP_409_CONFLICT),
    (FileTooLargeError, status.HTTP_413_CONTENT_TOO_LARGE),
    (UnsupportedFormatError, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
    (IngestionError, status.HTTP_422_UNPROCESSABLE_CONTENT),
)


def _status_for(exc: ForjaError) -> int:
    for error_type, code in _STATUS_BY_ERROR:
        if isinstance(exc, error_type):
            return code
    return status.HTTP_500_INTERNAL_SERVER_ERROR


def _body(code: str, message: str, details: dict[str, object] | None = None) -> dict[str, object]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


async def _handle_forja_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ForjaError)
    status_code = _status_for(exc)
    if status_code >= 500:
        log.error("request_failed", error_code=exc.code, error=exc.message)
    return JSONResponse(status_code=status_code, content=_body(exc.code, exc.message, exc.details))


async def _handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", error_type=type(exc).__name__)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_body("internal_error", "an unexpected error occurred"),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ForjaError, _handle_forja_error)
    app.add_exception_handler(Exception, _handle_unexpected)
