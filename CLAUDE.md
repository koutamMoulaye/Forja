# Forja: standing rules

Read at the start of every working session. These rules hold for every task unless the
person in charge of the project says otherwise for that task.

## Git

- Atomic commits, one concern each, conventional-commit subjects in English with a scope:
  `feat(web): …`, `fix(api): …`, `test(core): …`, `docs: …`, `build: …`, `ci: …`.
- Push to `main` only once the tests are green. Never force-push; never rewrite history.
- No mention of AI tools and no `Co-Authored-By` line anywhere: commits, code, comments,
  documentation, interface.

## Design

- `design/project/ForjaApp.dc.html` is the source of truth for every screen.
- Fonts: Instrument Sans (interface) and Commit Mono (identifier values only). Icons:
  Phosphor (`@phosphor-icons/react`).
- No trace of Inter, JetBrains Mono or Lucide.
- `Forja C - Recuit`, the `Recuit v2/v3` drafts and `ForjaCanvas.dc.html` are obsolete:
  do not follow them.

## Security

- The language model never receives data values: schemas, statistics, relations and the
  semantic layer only.
- SQL is never written by the language model: it produces a specification that Forja
  validates and compiles.
- Personal data is pseudonymized outside Silver (Gold, serving, exports, previews).
- No secret in the repository (`.env`, keys, salts stay outside; `FORJA_SECRETS_DIR`).

## Disk (this machine is short on space)

- Stop and warn if free space on the system drive drops below 1.5 GB.
- Playwright records traces and screenshots on failure only; no video. Comparison
  captures go to `apps/web/test-results/captures`, emptied at each run.
- Tests clean up their files; test data is generated on the fly, never committed beyond
  a few KB.
- Docker: check free space before a build, prune intermediate layers after it.

## Machine

- Keep the PC awake during long runs (`scripts/keep-awake.ps1 -Run "<command>"`, or
  `powercfg /change standby-timeout-ac 0` for the duration, restored afterwards).
- Stop every server you started (API, `next start`, `docker compose`) at the end of a task.

## Commands

```sh
# Python (root)
uv sync                                  # dependencies
uv run pytest -q                         # tests (real dbt builds included)
uv run ruff check . && uv run ruff format --check . && uv run mypy
uv run forja openapi                     # regenerate docs/openapi.json after an API change
uv run forja demo                        # demo project (API stopped: one process on DuckDB)
uv run forja-api                         # API on 127.0.0.1:8000

# Web (apps/web)
pnpm install
pnpm api:generate                        # TS types from docs/openapi.json
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test                                # Vitest
pnpm test:e2e                            # Playwright + axe + CSP, against the real API
pnpm dev                                 # http://localhost:3000

# Everything in Docker
./install.sh  |  .\install.ps1           # checks, docker compose up, opens the browser
docker compose up -d                     # API + web, host Ollama
docker compose --profile ollama up -d    # with an Ollama container (several GB)
```

## Layout

```
apps/api        FastAPI app, CLI (forja demo / openapi / serve)
apps/web        Next.js front (App Router), proxy to the API under /api/forja
packages/core   ingestion, profiling, Silver/Gold planning, dbt, jobs, auth, agent, semantic layer
packages/llm    LLM providers (Anthropic, OpenAI, Ollama) and context builders
tests/          pytest suites, fixtures generated on the fly, agent evaluation
docs/           architecture, decisions, security, agent, semantic layer, BI, guides
design/         design references (ForjaApp.dc.html is authoritative)
docker/         production images and first-start scripts
```
