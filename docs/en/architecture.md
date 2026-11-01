# Architecture

*Français : [architecture.md](../architecture.md) · The decisions behind it (in French):
[decisions.md](../decisions.md)*

## Principles

- **Local-first**: everything works on one machine, without an external service.
  DuckDB is the compute engine, the catalog and the warehouse; raw data is Parquet.
- **The same code as a service**: the core (`forja_core`) does not depend on FastAPI;
  storage goes through `Workspace` and job execution through the `JobRunner` interface,
  the two places to swap (object storage, orchestrator).
- **Nothing is dropped silently**: a Bronze row ends in Silver, in quarantine
  (`__rejects`), or is counted as an exact duplicate in the run's metrics.
- **Privacy by construction**: the internal Silver layer is in clear, everything that
  leaves it (serving database, exports) is treated; no language model receives a cell
  value; an analyst never receives personal data in clear.
- **The LLM proposes, Forja checks**: for the Gold plan as for a business question, a
  model's output is a structured document validated by rules; SQL is always written by
  templates.

## Monorepo

| Package | Import | Role |
|---|---|---|
| `packages/core` | `forja_core` | Catalog, ingestion, profiling, Silver plans, relations, Gold plans, dbt generation, jobs, privacy, serving, authentication, semantic layer, business agent |
| `packages/llm` | `forja_llm` | Anthropic / OpenAI / Ollama providers, cache, context without raw data, Gold proposer, the agent's interpreter |
| `apps/api` | `forja_api` | FastAPI HTTP API, authentication and permission dependencies, job worker, CLI (`forja init / demo / openapi / serve`) |
| `apps/web` | — | Next.js interface (App Router), server-side proxy to the API under `/api/forja` |

The Python distributions are named `forjadata-core`, `forjadata-llm` and
`forjadata-api` ([naming.md](../naming.md)); the modules keep the names above.

## Flow Bronze → Silver → Gold → serving

```
 CSV / Excel / Parquet / JSON file, database table, REST endpoint
        │  POST /projects/{id}/sources   (auto | new_source | new_version), or a load run
        ▼
 ┌──────────────────────── BRONZE ────────────────────────┐
 │ data/<p>/bronze/<source>/<timestamp>_vNNNN_<f>.parquet  │  one file per version
 │ + _batch_id, _ingested_at, _source_file, _row_hash      │  (= batch), never changed
 └───────────────────────────┬────────────────────────────┘
        │ profiling of the version         │ schema drift vs the previous version
        ▼                                  ▼
 ┌─────────────── TRANSFORMATION PLAN (catalog) ───────────────────┐
 │ deterministic rules: types, formats, normalization, snake_case, │
 │ deduplication, validity, primary key, PII treatment             │
 │ draft ──(PATCH = new version)──► approved ──(build)──► applied   │
 └───────────────────────────┬─────────────────────────────────────┘
        │ build_silver run: idempotent generation of data/<p>/dbt/ then dbt build
        ▼
 ┌──────────────── SILVER: data/<p>/warehouse.duckdb ─────────────────┐
 │ stg_<source>__checked (ephemeral)                                   │
 │   unprocessed Bronze rows → exact dedup → cleaning → typing         │
 │   → _reject_reason                                                  │
 │        ├── no reason ────► stg_<source>           (incremental,      │
 │        │                     primary key or _row_hash, contract)     │
 │        └── reason ───────► stg_<source>__rejects  (incremental,      │
 │                              raw values, quarantine)                 │
 └───────────────────────────┬────────────────────────────────────────┘
        │ end of build_silver: relation detection (inclusion, names, types)
        ▼
 ┌──────────────── RELATIONS (catalog) ────────────────────────────────┐
 │ commandes.id_client → clients.id_client  94 %  N-1                  │
 │ suggested ──(human review)──► confirmed | rejected                   │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ POST /projects/{id}/gold-plan/propose
        │   LLM (safe context + confirmed relations) or heuristic
        ▼
 ┌──────────────── GOLD PLAN (catalog) ────────────────────────────────┐
 │ dimensions (natural key, surrogate key, SCD1/SCD2), facts            │
 │ (grain, N-1 joins, FKs, dates, measures validated by sqlglot)       │
 │ validation: grain, confirmed relations, orphans, fan-out            │
 │ draft ──(PATCH)──► approved ──(build_gold)──► applied                │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ build_gold run: SCD2 snapshots, dim_*, dim_date, fct_*, tests
        ▼
 ┌──────────────── GOLD: data/<p>/warehouse.duckdb ────────────────────┐
 │ snap_<source> ─► dim_<source>  (MD5 of the key, unknown member -1,  │
 │                                 valid_from / valid_to / is_current) │
 │ dim_date  (YYYYMMDD, French labels)                                 │
 │ fct_<process>  (FK -1 when orphan, SCD2 version at the fact's date) │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ export run: published tables (Gold by default), PII treatment
        ▼
 ┌──────────────────────────── SERVING ────────────────────────────────┐
 │ data/<p>/serving/<project>.duckdb   dim_*, fct_* + _forja_tables    │ ◄── BI, read
 │ data/<p>/exports/<table>.parquet|csv                                │     only
 │ GET /tables/{id}/export · GET /tables/{id}/preview (treated)        │
 └─────────────────────────────────────────────────────────────────────┘
        │ end of build_gold: generation of the semantic layer
        ▼
 ┌──────────────── SEMANTIC LAYER (catalog, versioned) ────────────────┐
 │ metrics (formula, additivity, unit, synonyms), additive ratios      │
 │ dimensions, attributes, hierarchies; the engineer's overrides       │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ POST /projects/{id}/mart-requests   « CA par mois et par ville »
        ▼
 ┌──────────────── BUSINESS AGENT (mart_request run) ──────────────────┐
 │ local preselection → parser | LLM → MartSpec | Clarification        │
 │ → validation → SQL from templates → preview and checks              │
 │ drafted → previewed → validated (→ approval) → published            │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ publish_mart run: models/marts/mart_<name>.sql, dbt build
        ▼
   serving (mart_<name>, pseudonymized) + Parquet / CSV exports
```

## Bronze and versions

- A source is a **logical name** (the file name, plus the sheet name for Excel). An
  upload on an existing name creates a **version**: a new Parquet file, a row in
  `source_versions`, its own `_batch_id`.
- `_row_hash` is the SHA-256 of the canonical JSON of the row's values. It drives exact
  deduplication and incremental builds: a row whose hash is already in Silver or in
  quarantine is not processed again.
- **Schema drift** (columns added, removed, physical or inferred type changed) is
  computed at each version, stored and exposed (`GET /sources/{id}/versions`); a drift
  that touches the approved plan blocks the next build until a plan is approved.
- Versions are read together with `read_parquet(..., union_by_name = true)`: a column
  missing from a version is NULL for its rows.

## Transformation plans

Generated by deterministic rules from the profile of the latest version (no language
model involved). Each rule carries an explanation in French for the interface. A new
version of the source refreshes the plan, keeping the approved decisions and reporting
the columns added, gone or retyped. The build uses the **effective plan**: the latest
approved or applied version; a draft in progress has no effect until it is approved.

Type inference reads text columns: French and English decimals, thousands separators
(« 155 781 758 » is an integer), dates in common formats, booleans in French and
English. A leading zero is padding in a calendar field (« 03 » for March: an integer,
said in the plan) and part of the value in a code (« 01 », « 06000 »: kept as text).

## Generated dbt project

```
data/<p>/dbt/
├── dbt_project.yml, profiles.yml        DuckDB profile → ../warehouse.duckdb
├── macros/
│   ├── forja_unprocessed_rows.sql       incremental filter on _row_hash
│   └── forja_unique_combination.sql     uniqueness test of composite keys
└── models/staging/
    ├── _bronze__sources.yml             sources = Bronze Parquet (external_location)
    ├── schema.yml                       descriptions, type contracts, tests
    └── <source>/stg_<source>{__checked,,__rejects}.sql
```

The project is regenerated at every build, idempotently: files identical byte for byte
when the plans did not change, obsolete files removed. It must not be edited by hand.

**Incremental and full refresh.** A table is rebuilt from the whole Bronze only when a
decision touching rows already in Silver changed (type, name, rule, key, deduplication)
or on request (`full_refresh`). A column added by a new version stays incremental
(`on_schema_change='append_new_columns'`). Changing the PII treatment of a column
rebuilds nothing: it only concerns the outputs.

**Primary key.** With a key, a newer row replaces the older one (`delete+insert`); two
different rows of one batch with the same key go to quarantine. Without a key,
uniqueness relies on `_row_hash`.

## Relations

Detected at the end of each `build_silver` and on request
(`POST /projects/{id}/relations/detect`), between a column of a table and the key
(primary or candidate, one column) of another. Confidence = 0.6 × inclusion + 0.3 ×
name similarity + 0.1 × type compatibility; thresholds in `FORJA_RELATION_*`. A
relation is confirmed, rejected or declared by hand (it is then measured, and its target
must be unique). See [decisions.md](../decisions.md), D11.

## LLM providers

`forja_llm` exposes `LLMProvider.generate(request, ResponseModel)`: Anthropic, OpenAI
and Ollama, structured output validated by Pydantic, retries with backoff, token
counting and an `llm_calls` log without data. `LLMRequest` only accepts an
`LLMSafeContext`, built by `build_safe_context` from profiles, Silver plans and
relations, without any row value. See D12 and D13.

## Gold plan and dbt generation

The Gold plan is versioned per project (`draft` → `approved` → `applied`), proposed by
the configured LLM or by the heuristic, then validated (D14). The heuristic reads the
star from the confirmed relations: a source that references others and is referenced by
none is a fact, a referenced source that references nothing is a dimension; numeric
columns become measures unless they hold codes (named like a code, or a few short
integers), which become degenerate dimensions. On approval the generator adds to the
dbt project:

```
data/<p>/dbt/
├── snapshots/snapshots.yml          snap_<source> (SCD2, check strategy)
└── models/gold/
    ├── schema.yml                   unique/not_null on keys, relationships
    │                                fact → dimension and dim_date, grain test
    ├── dim_<source>.sql             members + unknown member (-1)
    ├── dim_date.sql                 from the first to the last day of the facts
    └── fct_<process>.sql            grain, FKs, date keys, measures
```

The `build_gold` run regenerates the project (Silver and Gold), runs
`dbt build --select snap_* dim_* dim_date fct_*`, measures the rows per model and the
rows attached to the unknown member, registers the Gold tables (published by default)
and moves the plan to `applied`. A `build_silver` also regenerates the Gold files, so
the project stays complete. See D15.

## Semantic layer and agent

See [semantic-layer.md](semantic-layer.md) and [agent.md](agent.md). The semantic layer
is generated again at the end of each successful `build_gold`; the agent reads only the
visible layer (without hidden elements) and the distinct values of filterable
attributes, in the process. Published data marts are dbt models
`models/marts/mart_<name>.sql`, kept at each generation of the dbt project, registered
as tables of the `mart` layer with their owner.

## Authentication

See [security.md](security.md). Each route declares an action of the permission matrix
(`forja_api.security.require`); the project is derived from the path. Core services
receive the `Principal` when they need it (owner of a request, access to data in clear)
and do not import FastAPI.

## Web application

`apps/web` (Next.js, React, TanStack Query, React Flow and ELK for the canvas) renders
every page on request with a CSP nonce. The browser talks only to the web server, which
holds the session in httpOnly cookies and relays the API under `/api/forja`
(see [security.md](security.md#web-interface)). Server-Sent Events from `/events` keep
runs and notifications live. Fonts: Instrument Sans, Commit Mono for identifiers;
icons: Phosphor.

## Notifications and event stream

`forja_core.notifications`: an in-memory `EventBus` links the services, which run in
the workers' threads, to the streams opened by `GET /events` (Server-Sent Events, one
asyncio queue per connection, filled by `call_soon_threadsafe`). The job executor
publishes each change of state or progress of a run (`on_change`) and its end
(`on_finish`); `NotificationService` derives the notifications (table `notifications`,
read or not, with an action to a run, a source, the model, a preview or a conversation)
and pushes them to their recipient's stream. Silver plans to review (after ingestion),
data marts to approve, approved, rejected or published come from the services
concerned. A stream receives only what its user may see; it closes with the access
token. The bus assumes a single API instance ([D26](../decisions.md)).

## Connectors and loads

`forja_core.connectors`: a **connection** (database or REST API) per project, its
settings in clear and its credentials encrypted (`vault.py`, D30). Each chosen table or
endpoint is a **feed** (`source_feeds`): the link between an object of the connection
and a Forja source, created at the first load. A `load` run extracts the feeds of a
connection (`database.py`: SQLAlchemy, server-side cursor; `rest.py`: httpx,
pagination, the SSRF guard `ssrf.py`) and adds a version to each source with
`IngestionService.ingest`, exactly as for a file. With `chain`, the run then rebuilds
Silver, Gold, the published data marts and serving (`JobExecutor.build_after_load`).

`forja_core.scheduling`: schedules of a connection or a source (cron, French phrases),
started by a thread of the API process (D31). A chunked file upload
(`ingestion/uploads.py`) ends with an `ingest` run.

Bronze is written as a stream (`ingestion/landing.py`, D32): DuckDB reads the files and
writes Parquet with `COPY`, or receives Arrow batches (Excel, databases, irregular
CSV); every DuckDB connection shares `memory_limit` (by default half the memory
available at start), `threads` and `temp_directory` (`forja_core.duck`).

## Jobs

The catalog's `jobs` table: type (`profile`, `build_silver`, `build_gold`, `export`,
`gold_proposal`, `mart_request`, `publish_mart`, `load`, `ingest`), status (`queued` →
`running` → `succeeded` | `failed` | `cancelled`), author, timestamps, logs, metrics,
progress (`progress`), result (`result`, e.g. the version of the proposed Gold plan) and
number of executions (`attempts`).

- **LLM calls**: the Gold proposal and the agent are runs. `POST
  /projects/{id}/gold-plan/propose` answers `202` with the run; the plan is in
  `result.gold_plan_version`. The local worker has two queues: `warehouse` (builds,
  exports, data mart publications, in series) and `llm` (proposals and agent), so that
  a local model thinking for minutes does not block the builds.
- **Cancellation**: `POST /runs/{id}/cancel` cancels a queued run, or a running LLM run:
  the provider call runs in a watched secondary thread, and the connection is closed
  (Ollama then stops reading or writing). A running build cannot be cancelled (dbt is
  writing the warehouse).
- **Recovery**: at start, an LLM run left `running` (stop, crash, sleep) is queued again
  and starts over, up to 3 executions; answers already received are in the cache. A
  build left `running` becomes `failed`.
- **Cache**: a validated answer is stored under the SHA-256 fingerprint of the
  provider, the model, the expected schema and the prompt (`llm_cache`);
  `FORJA_LLM_CACHE=false` turns it off.
- **Measures**: each call is recorded (`llm_calls`: run, object, input/output tokens,
  duration, attempts, status `succeeded`/`failed`/`cached`/`cancelled`) and logged
  (`llm_call`); a run reports its calls in `metrics.llm_calls`.
- **Follow-up steps**: after a successful handler, registered steps (`after_success`,
  e.g. the semantic layer after `build_gold`) run before the run is announced done;
  their failure is written to the run's logs.

- `JobExecutor` executes a job: status transitions, timestamped logs, metrics, errors.
- `JobRunner` decides when: `ThreadJobRunner` (local worker, one job at a time per
  queue, which respects DuckDB's single-writer model), `InlineJobRunner` (tests,
  scripts). An external orchestrator would implement the same interface.
- At start, jobs left `running` (process stopped) become `failed` and `queued` jobs
  resume.
- dbt runs in a subprocess; its output is copied into the run's logs and
  `run_results.json` gives the result of each test. The run id reaches it as the
  `FORJA_RUN_ID` environment variable (not `--vars`), which keeps dbt's partial parsing
  from one run to the next.
- dbt lives and dies with the API (`forja_core.children`): on Windows a job object
  closed with the API; on Linux `PR_SET_PDEATHSIG`; on macOS a guard
  (`python -m forja_core.children`) that watches the API and kills the process group
  once it is gone. On POSIX each dbt leads its own process group, stopped when the API
  shuts down; the interrupted build becomes failed at the next start.

Metrics of a `build_silver`, overall and per source: rows read (not yet processed),
already processed, exact duplicates removed, valid, rejected, replaced by a newer
version of the same key, duration, results of the dbt tests.

## Locks

A lock per project protects `warehouse.duckdb`: during a build (dbt writing), exports
wait (`FORJA_EXPORT_LOCK_TIMEOUT_SECONDS`) then answer `409 warehouse_busy`.

## Catalog

`forja_meta.duckdb`: `projects`, `sources`, `source_versions`, `profiles` (per
version), `plans` (versioned), `jobs`, `silver_tables` (every warehouse table: Silver,
Gold and data marts, with their publication flag and owner), `relations`, `gold_plans`,
`llm_calls`, `llm_cache`, `users`, `memberships`, `auth_sessions`, `auth_throttle`,
`refresh_tokens`, `api_keys`, `invitations`, `audit_log`, `semantic_layers`,
`semantic_overrides`, `synonym_proposals`, `mart_requests`, `notifications`,
`connections`, `source_feeds`, `schedules`, `uploads` and `instance_settings`. The schema evolves through numbered migrations
(`catalog/migrations.py`) applied at start; a catalog of an earlier version is migrated
without loss.

## Privacy

- **Silver**: in clear, for the engine only.
- **Outputs**: per-column treatment set in the plan — `hash` (HMAC-SHA256, a random
  32-byte salt per project in `FORJA_SECRETS_DIR`, outside the repository), `mask`
  (partial masking), `drop` (column removed) or `none`. Default: `hash` for every
  personal data detected with medium or high confidence.
- **Readers without `data.unmasked`** (analysts): every personal column left in clear
  by the plan is pseudonymized in previews and exports; data marts always pseudonymize
  their personal columns.
- **LLM**: `forja_llm.context.build_safe_context` copies only schema and statistics;
  the agent sends only the question and the preselected semantic layer
  (`SemanticContext`).

## Logging

Structured logs with structlog (JSON by default, `FORJA_LOG_FORMAT=console` for a
readable display). Each HTTP request gets a `request_id`; each job logs `job_id`,
`project_id` and `type`.

## Deployment

Two images, `forja-api` (Python 3.12, uv, unprivileged user, volumes `/data` and
`/secrets`) and `forja-web` (Node.js 24, Next.js standalone), published for
linux/amd64 and linux/arm64 on GitHub Container Registry and started by
`docker-compose.yml`; Ollama runs on the host or in an optional container. The API is
not published: the browser reaches it through the web container. See
[getting-started.md](getting-started.md).
