"""FastAPI application factory and entry point."""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from forja_api import openapi
from forja_api.errors import register_error_handlers
from forja_api.routes import (
    auth,
    gold,
    marts,
    plans,
    projects,
    relations,
    runs,
    semantic,
    sources,
    tables,
)
from forja_api.schemas import HealthResponse
from forja_api.state import AppState
from forja_core import __version__
from forja_core.config import Settings, get_settings
from forja_core.logging import configure_logging, get_logger

log = get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_format)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        state = AppState.build(settings)
        app.state.forja = state
        state.start()
        log.info("api_started", data_dir=str(state.workspace.root))
        try:
            yield
        finally:
            state.close()
            log.info("api_stopped")

    app = FastAPI(
        title="Forja API",
        version=__version__,
        description="Ingestion, profilage et modélisation de données, local-first.",
        lifespan=lifespan,
    )
    register_error_handlers(app)
    # A browser front on another origin (http://localhost:3000 by default) calls the API
    # with a bearer token: no cookie, so credentials stay off.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After", "Content-Disposition"],
        max_age=600,
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["x-request-id"] = request_id
            log.info(
                "http_request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
            )
            return response
        finally:
            structlog.contextvars.clear_contextvars()

    @app.get("/health", tags=["system"])
    def health() -> HealthResponse:
        return HealthResponse(status="ok", version=__version__)

    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(sources.router)
    app.include_router(plans.router)
    app.include_router(runs.router)
    app.include_router(tables.router)
    app.include_router(relations.router)
    app.include_router(gold.router)
    app.include_router(semantic.router)
    app.include_router(marts.router)
    openapi.install(app)
    return app


def run() -> None:
    settings = get_settings()
    uvicorn.run(
        "forja_api.main:create_app",
        factory=True,
        host=settings.api_host,
        port=settings.api_port,
    )
