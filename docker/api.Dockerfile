# Forja API: a virtual environment built with uv, copied into a slim Python image that
# runs as an unprivileged user. Build from the repository root:
#   docker build -f docker/api.Dockerfile -t forja-api:0.1.0 .

ARG PYTHON_VERSION=3.12

FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dependencies first, for layer caching.
COPY pyproject.toml uv.lock .python-version README.md ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml
COPY packages/core/pyproject.toml packages/core/pyproject.toml
COPY packages/llm/pyproject.toml packages/llm/pyproject.toml
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-workspace
COPY apps/api apps/api
COPY packages packages
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable \
    && rm -rf /app/.venv/lib/python*/site-packages/pyarrow/include

FROM python:${PYTHON_VERSION}-slim-bookworm
ARG FORJA_VERSION=0.1.0
LABEL org.opencontainers.image.title="Forja API" \
      org.opencontainers.image.version="${FORJA_VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/koutamMoulaye/Forja"
RUN useradd --create-home --uid 1000 forja \
    && mkdir -p /data /secrets \
    && chown forja:forja /data /secrets \
    && chmod 700 /secrets
COPY --from=build --chown=forja:forja /app/.venv /app/.venv
USER forja
WORKDIR /home/forja
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    FORJA_DATA_DIR=/data \
    FORJA_SECRETS_DIR=/secrets \
    FORJA_API_HOST=0.0.0.0 \
    FORJA_API_PORT=8000
EXPOSE 8000
VOLUME ["/data", "/secrets"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]
CMD ["forja-api"]
