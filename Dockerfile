FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first, for layer caching.
COPY pyproject.toml uv.lock .python-version README.md ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
COPY packages/core/pyproject.toml packages/core/pyproject.toml
COPY packages/llm/pyproject.toml packages/llm/pyproject.toml
RUN uv sync --frozen --no-dev --no-install-workspace

COPY apps apps
COPY packages packages
RUN uv sync --frozen --no-dev

RUN useradd --create-home --uid 1000 forja \
    && mkdir -p /app/data \
    && chown -R forja:forja /app/data
USER forja

ENV PATH="/app/.venv/bin:$PATH" \
    FORJA_DATA_DIR=/app/data \
    FORJA_API_HOST=0.0.0.0 \
    FORJA_API_PORT=8000

EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["forja-api"]
