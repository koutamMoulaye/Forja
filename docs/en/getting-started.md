# Getting started

*Français : [getting-started.md](../getting-started.md)*

This guide installs Forja with Docker, opens the demo project, and says where to go
next. **The interface is in French in 0.1**; English comes in the next version.

## Requirements

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 (Docker Desktop on
  Windows and macOS, Docker Engine on Linux).
- About 4 GB of free disk (12 GB with an Ollama container and a model).
- 8 GB of memory or more is comfortable; DuckDB takes half of what is available at
  start by default, and spills to disk beyond it.
- linux/amd64 or linux/arm64: the images exist for both, so Apple silicon, Windows on
  ARM and ARM servers run Forja natively.

## Install in one command

```sh
git clone https://github.com/forjadata/forja.git && cd forja
./install.sh --demo            # macOS, Linux
.\install.ps1 -Demo            # Windows (PowerShell)
```

The script checks Docker and the free disk, pulls the two published images
(`ghcr.io/forjadata/forja-api` and `forja-web`), creates the administrator, loads the
demo project with `--demo`, starts everything and opens <http://localhost:3000>.

**The administrator's password and those of the demo accounts are shown once**: note
them. The first sign-in asks you to choose a new password.

| Option | `install.sh` | `install.ps1` |
|---|---|---|
| Load the demo project | `--demo` | `-Demo` |
| Run Ollama in a container (several GB) | `--ollama` | `-Ollama` |
| Build the images from this checkout instead of pulling them | `--build` | `-Build` |
| Do not open the browser | `--no-browser` | `-NoBrowser` |
| With `--build`, keep Docker's build cache | `--keep-build-cache` | `-KeepBuildCache` |

Then:

```sh
docker compose up -d           # start again later
docker compose down            # stop (data stays in the Docker volumes)
docker compose down -v         # stop and delete all data
docker compose logs -f api     # follow the API's logs
```

## A first tour with the demo

The demo project is a small e-commerce shop: customers, products, orders and order
lines, already cleaned and modelled.

1. Sign in with the **engineer** account: the pipeline canvas shows the sources, the
   cleaning (Silver), the star schema (Gold) and the serving. Click a node to open it
   in the inspector; double-click to open its page.
2. Open a cleaning plan (*Nettoyage*): every rule is explained, with values before and
   after.
3. Sign in with the **analyst** account and ask on the home page « Chiffre d'affaires
   par mois en 2024 » (revenue per month in 2024): Forja shows what it understood, a
   sample, the SQL and the checks, before anything is published.

The [engineer guide](guide-engineer.md) and the [analyst guide](guide-analyst.md) go
further; your own files are loaded from *Sources › Ajouter une source*.

## Settings

Settings go in a `.env` file next to `docker-compose.yml` (see
[`.env.example`](../../.env.example)); `docker compose up -d` applies them.

| Setting | Default | What for |
|---|---|---|
| `FORJA_WEB_PORT` | 3000 | port of the interface |
| `FORJA_WEB_BIND` | 127.0.0.1 | listen on all interfaces with `0.0.0.0` (put HTTPS in front, and set `FORJA_WEB_SECURE_COOKIES=true`) |
| `FORJA_AUTH_MODE` | `local` | `multi` for a shared instance with invitations and roles |
| `FORJA_LLM_PROVIDER` | none | `ollama`, `anthropic` or `openai` (also in the settings screen) |
| `FORJA_DUCKDB_MEMORY_LIMIT` | `auto` | half the memory available at start, between 1 and 16 GB; or a size such as `6GB` |
| `FORJA_VERSION` | `0.1.0` | the release of the images |
| `FORJA_IMAGE_PREFIX` | `ghcr.io/forjadata` | another registry (a mirror) |

### AI provider

Forja works without a language model: deterministic rules propose the star schema, and
a local parser understands most questions. A model helps with ambiguous questions and
unusual schemas.

| Provider | Setting | Notes |
|---|---|---|
| None | `FORJA_LLM_PROVIDER=` | the default; everything stays deterministic |
| Ollama (local, free) | `FORJA_LLM_PROVIDER=ollama` | the host's Ollama (`qwen3.5:9b` by default), or `--ollama` for a container |
| Anthropic | `FORJA_LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` | |
| OpenAI | `FORJA_LLM_PROVIDER=openai`, `OPENAI_API_KEY` and `FORJA_LLM_MODEL` | |

Whatever the provider, a model never receives data values and never writes SQL
([security.md](security.md)).

## Upgrade

```sh
git pull
docker compose pull            # or: FORJA_VERSION=<version> docker compose pull
docker compose up -d
```

The catalog is migrated at start, without loss. Read the
[CHANGELOG](../../CHANGELOG.md) first: before 1.0, a minor version may change a setting.

## Back up

Everything lives in two Docker volumes: `forja_forja-data` (catalog, warehouse, files)
and `forja_forja-secrets` (pseudonymization salts, signing key, provider keys). Back up
**both**: without the salts, new pseudonyms would no longer match the published ones.

```sh
docker compose stop
docker run --rm -v forja_forja-data:/data -v forja_forja-secrets:/secrets \
  -v "$PWD":/backup alpine tar czf /backup/forja-backup.tgz /data /secrets
docker compose start
```

## Verify the images

The images are signed in GitHub Actions with cosign (keyless) and carry SBOM and
provenance attestations:

```sh
cosign verify ghcr.io/forjadata/forja-api:0.1.0 \
  --certificate-identity-regexp "^https://github.com/forjadata/forja/" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Without Docker

For development, or to run the API and the interface directly: [uv](https://docs.astral.sh/uv/)
and [pnpm](https://pnpm.io/), see [CONTRIBUTING.md](../../CONTRIBUTING.md#development-setup)
and, in French, [development.md](../development.md). On Windows ARM64, uv's Python is
x64 and runs emulated (some dependencies have no Windows ARM64 wheel yet): Docker is
faster there.

## Troubleshooting

| Symptom | Fix |
|---|---|
| « images introuvables » (images not found) during install | offline, or a registry blocked: `./install.sh --build` builds them from the checkout |
| The port 3000 is taken | `FORJA_WEB_PORT=3001 ./install.sh` |
| A demo password is lost | `docker compose stop api && docker compose run --rm api forja demo --reset-passwords && docker compose start api` prints new ones |
| The administrator's password is lost | 0.1 has no reset command: on a fresh install, start over with `docker compose down -v` (all data lost) |
| Ollama is not reached | on Linux, Ollama must listen on the Docker bridge (`OLLAMA_HOST=0.0.0.0`), or use `--ollama` |
| A large file stalls the machine | lower `FORJA_DUCKDB_MEMORY_LIMIT` (e.g. `2GB`): DuckDB spills to disk |
