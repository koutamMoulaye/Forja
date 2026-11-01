# Contributing to Forja

Thank you for your interest. Forja is young: bug reports, questions, documentation
fixes and focused pull requests are all welcome. This guide says how to set up a
development environment, what we check before merging, and how changes are written.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues
are never reported in public issues: see [SECURITY.md](SECURITY.md).

## Before you start

- **Small fixes** (typos, docs, an obvious bug): open a pull request directly.
- **Anything larger** (a feature, a new connector, a change of behaviour): open an issue
  first, so that we agree on the approach before you spend time on it.
- The **interface is in French** in 0.1; English arrives in the next version. Code,
  comments, commit messages, issues and pull requests are in English.

## Development setup

Prerequisites: [uv](https://docs.astral.sh/uv/) (it installs Python 3.12),
[Node.js](https://nodejs.org/) 24 with [pnpm](https://pnpm.io/) (`corepack enable`),
and [Docker](https://docs.docker.com/get-docker/) for the database connector tests.

```sh
git clone https://github.com/forjadata/forja.git && cd forja
uv sync                          # Python dependencies (API, core, LLM providers)
uv run forja demo                # optional: the demo project
uv run forja-api                 # API on http://127.0.0.1:8000 (docs on /docs)

cd apps/web
pnpm install
pnpm dev                         # web app on http://localhost:3000
```

Settings come from environment variables prefixed with `FORJA_` or from a `.env` file
(see [`.env.example`](.env.example)). Secrets (salts, keys) live outside the repository,
in `FORJA_SECRETS_DIR`. More in [docs/en/getting-started.md](docs/en/getting-started.md)
and, in French, [docs/development.md](docs/development.md).

## Checks

Everything below runs in CI on every pull request; run what your change touches.

```sh
# Python, from the repository root
uv run ruff check . && uv run ruff format --check . && uv run mypy
FORJA_SKIP_REAL_LLM_TESTS=1 uv run pytest -q   # real dbt builds; no language model needed
uv run forja openapi                            # after an API change: docs/openapi.json

# Web, from apps/web
pnpm api:generate                               # after an API change: TypeScript types
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test                                       # Vitest
pnpm test:e2e                                   # Playwright against the real API
```

- `FORJA_SKIP_REAL_LLM_TESTS=1` skips the tests that call a real model (they take
  hours on a CPU). The other tests use a simulated model.
- The connector tests start PostgreSQL and MySQL containers
  (`docker/compose.test-db.yml`) and remove them; without Docker they are skipped.
- Tests clean up after themselves and generate their data on the fly: do not commit
  datasets beyond a few KB.

## What a change must keep true

Reviewers check these first; a pull request that breaks one is not merged.

- **A language model never receives data values**: schemas, statistics, relations and
  the semantic layer only. Values typed by a user are resolved locally.
- **A language model never writes SQL**: it returns a specification that Forja
  validates and compiles from templates.
- **Personal data is pseudonymized outside Silver** (Gold, serving, exports, previews).
- **No secret in the repository**: `.env`, keys and salts stay outside.
- Every route checks the caller's role; every action that changes data is audited.

## Design

The screens follow `design/project/ForjaApp.dc.html`, the source of truth for the
interface. Fonts: Instrument Sans for the interface, Commit Mono for identifier values
only. Icons: [Phosphor](https://phosphoricons.com/) (`@phosphor-icons/react`). Other
files in `design/` are earlier drafts and are not followed.

## Commits

- One concern per commit, in English, with a
  [Conventional Commits](https://www.conventionalcommits.org/) subject and a scope:
  `feat(web): …`, `fix(api): …`, `test(core): …`, `docs: …`, `build: …`, `ci: …`.
  Scopes: `api`, `web`, `core`, `llm`.
- The subject says the result, not the activity: `fix(core): a padded month stays a
  number`, rather than `fix: change type inference`.
- The body, when needed, says why.

## Pull requests

1. Fork, branch from `main`, keep the branch focused.
2. Add or update tests with the change; update the docs it affects (in English, and in
   French when a French version of the page exists).
3. Fill in the pull request template; link the issue.
4. CI must be green. A maintainer reviews within a few days; expect questions and small
   requested changes, and please do not take them personally.
5. Pull requests are merged with a merge commit or rebased; history on `main` is never
   rewritten.

## Labels

| Label | Meaning |
|---|---|
| `bug` | Something does not work as documented |
| `enhancement` | A new feature or an improvement |
| `question` | A usage question |
| `documentation` | Docs only |
| `good first issue` | Small, well described, a good way in |
| `help wanted` | The maintainers would welcome a contribution |
| `security` | Hardening (vulnerabilities go through SECURITY.md, not issues) |
| `area: api`, `area: web`, `area: core`, `area: llm`, `area: connectors`, `area: docker` | Where the change lives |
| `needs triage` | New, not looked at yet (set by the issue templates) |
| `needs reproduction` | Waiting for steps to reproduce |
| `breaking` | Changes the API, the plans' format or a setting |
| `dependencies` | Dependency updates (Dependabot) |

## License

Forja is released under the [Apache License 2.0](LICENSE). By contributing, you agree
that your contributions are licensed under it (section 5 of the license).
