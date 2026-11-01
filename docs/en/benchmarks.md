# Benchmarks

*Français : [benchmarks.md](../benchmarks.md) · What the release test campaign found and
fixed (in French): [campaign-report.md](../campaign-report.md)*

Figures of the release test campaign (October and November 2026). Every measure is
replayed by the tests named; `FORJA_CAMPAIGN_REPORT=<folder>` writes the JSON of each
scenario.

## Environment

| | Reference workstation | CI (GitHub Actions) |
|---|---|---|
| CPU | Snapdragon X Plus (ARM64), 10 cores | 4 vCPU x64 |
| Memory | 31.6 GB; Docker (WSL 2) limited to 8 GB and 6 CPUs | 16 GB |
| System | Windows 11 Home | Ubuntu 24.04 |
| Python | 3.12.15 **x64, emulated** on ARM64 | 3.12, native |
| Browser | Chrome 156 (native ARM64); Playwright's Chromium 1.64.1 (x64, emulated) | Chrome, Playwright's Chromium |
| Stack | DuckDB 2.0.0, dbt 1.12.6, dbt-duckdb 1.11.0, FastAPI 0.158.1, Node 24.19, Next.js 16.4.3, React 19.3 | same |
| Settings | `FORJA_DUCKDB_MEMORY_LIMIT=6GB` (`auto` by default since 0.1.0), `FORJA_DUCKDB_THREADS=4` | same |

On the reference workstation the API, DuckDB and dbt run as emulated x64: Python-side
times are pessimistic there (see [native ARM64](#native-arm64-python) below). Peak
memory is that of the process and its children (dbt), sampled every 50 ms (volumes) or
200 ms (scenarios); disk is that of the workspace after the step.

## Key figures

| | |
|---|---|
| One million rows, file to exported data mart | **33 s** (24.6 s native arm64) |
| Five million rows, same journey | 73 s |
| Peak memory, one million rows | about 1 GB |
| 10 million rows from PostgreSQL, then 100,000 new rows | 55.8 s, then **3.5 s** incremental |
| 2 GB upload cut twice and resumed | 12.8 s |
| Canvas shown after sign-in (Chrome) | 1.5 to 1.8 s |
| Agent: questions answered without a model | 13 of 20 at once; context sent to a model: about 200 tokens, no value |

## Volumes

### Generated file, from ingestion to export

`FORJA_VOLUME_ROWS=<n> uv run pytest -s tests/test_volume.py`: generated orders (1 %
exact duplicates, an email column), then profile, Silver, Gold model proposed without a
language model, a data mart asked in French, Parquet and CSV export.

| Step | 1 million (61 MB) | 5 million (309 MB) |
|---|---|---|
| Ingestion to Bronze | 2.6 s | 10.1 s |
| Profile | 2.3 s | 7.6 s |
| Peak memory, ingestion and profile | 757 MB | 2,792 MB |
| Silver (dbt) | 10.5 s, peak 976 MB | 22.5 s, peak 2,979 MB |
| Gold | 6.8 s, peak 548 MB | 7.2 s, peak 633 MB |
| Data mart « Montant des commandes par ville » (order amount per city) | 7.8 s, peak 516 MB | 11.9 s, peak 569 MB |
| Parquet and CSV export | 2.4 s, peak 368 MB | 9.2 s, peak 424 MB |
| Disk: Bronze, warehouse, exports, total | 35, 58, 50, 213 MB | 176, 232, 254, 1,042 MB |

End to end: 39 s for one million rows, 73 s for five million.

### CI and reference workstation (one million rows)

| Step | CI, 4 x64 cores | Reference workstation, emulated Python |
|---|---|---|
| Ingestion to Bronze | 1.4 s | 2.6 s |
| Profile | 1.1 s | 2.3 s |
| Peak memory, ingestion and profile | 950 MB | 757 MB |
| Silver (dbt) | 6.9 s, peak 1,047 MB | 10.5 s, peak 976 MB |

The CI figures come from the job "Volume, one million rows" (artifact
`volume-report`). The gap comes from the emulation: CI, on fewer cores, is faster.

### Native ARM64 Python

The same one-million-row test, the same day, on the reference workstation: first with
Windows' emulated x64 Python, then in a Linux `arm64` container
(`ghcr.io/astral-sh/uv:python3.12-bookworm-slim`, Docker limited to 6 CPUs and 8 GB),
where Python, DuckDB and dbt are native. A native ARM64 CPython on Windows is not
possible yet: PyPI has no `win_arm64` wheel for pyarrow, cryptography, psycopg-binary
or dbt-extractor.

| Step | Windows, emulated x64 Python | Linux arm64, native (container) | Gap |
|---|---|---|---|
| Ingestion to Bronze | 2.5 s | 1.6 s | −36 % |
| Profile | 2.3 s | 1.0 s | −57 % |
| Silver (dbt) | 10.0 s | 7.2 s | −28 % |
| Gold | 6.7 s | 5.3 s | −21 % |
| Data mart | 7.7 s | 6.1 s | −21 % |
| Parquet and CSV export | 2.7 s | 1.9 s | −30 % |
| Whole test | 33.5 s | 24.6 s | −27 % |

With half the memory and four cores fewer, native code wins a good quarter: the
emulation costs more than the resources taken away. The full test suite passes in that
container (520 tests, databases excluded). On a Windows ARM64 machine, the Docker
install therefore runs Forja natively.

### dbt start and partial parsing

The run id goes to dbt as `FORJA_RUN_ID` instead of `--vars`, which forced dbt to parse
the whole project at every run.

| Measure (reference workstation, emulated Python) | `--vars`, no partial parsing | environment variable, partial parsing |
|---|---|---|
| `dbt parse` of a 20-model project, 4 runs | 5.6 to 5.8 s | 4.5 s after the first |
| Full `build_silver` of the demo shop, 4 × 5 rebuilds, median | 7.55 s | 6.7 s |

The gain is for repeated builds of one project (scheduled loads, rebuilds); the first
build of a project, or after a change of the dbt profile, is still a full parse.

### PostgreSQL table of 10 million rows, loaded incrementally

`FORJA_VOLUME_PG_ROWS=10000000 uv run pytest -s tests/campaign/test_volume_sources.py -k postgres`

| Step | Duration | Peak memory | Workspace |
|---|---|---|---|
| First load (10 M rows) | 55.8 s | 1,388 MB | 364 MB |
| Incremental load (100,000 new rows) | 3.5 s | 1,568 MB | 368 MB |
| Silver (10.1 M rows) | 29.1 s | 4,555 MB | 844 MB |

The second load reads only the rows after the cursor; the warehouse weighs 475 MB.

### 2 GB upload, cut twice

`FORJA_VOLUME_UPLOAD_MB=2048 uv run pytest -s tests/campaign/test_volume_sources.py -k upload`:
52.4 million rows, 8 MB chunks; the upload is cut at 30 % (in the middle of a chunk)
then at 70 %, and resumes where it stopped.

| Step | Duration | Peak memory | Workspace |
|---|---|---|---|
| Upload, two cuts, resume (local, no network) | 12.8 s | 293 MB | 2,036 MB |
| Ingestion and profile | 146.8 s | 6,070 MB | 1,849 MB |

The ingestion of this file reached DuckDB's limit (6 GB, the fixed setting of the
campaign): the default limit (`auto`) is now half the memory available at start,
between 1 and 16 GB; DuckDB spills to disk beyond it.

## Journeys

Measured on the reference workstation, machine idle, with `uv run pytest -m campaign`.

| Scenario | Step | Duration |
|---|---|---|
| 1. Reference: a file, a PostgreSQL table, an API | sources | 1.6 s |
| | plans, Silver, relations, Gold | 14.9 s |
| | data mart asked by an analyst, approved, published | 7.4 s |
| | scheduled load (simulated clock) and data mart refresh | 22.3 s |
| 2. Road accidents 2024 (342,515 rows, 4 files) | ingestion and profile | 8.3 s, peak 446 MB |
| | plans and Silver | 10.8 s, peak 696 MB |
| | Gold | 7.8 s, peak 622 MB |
| 3. Database drifts | column dropped: blocked | 1.3 s |
| | plan approved, Silver resumed | 7.0 s |
| | column retyped: blocked, plan approved, full rebuild | 7.8 s |
| 3. API failure during a load | 5xx, then timeouts, then recovery | 0.2 s, 1.8 s, 1.3 s |
| 7. API killed | restart, interrupted build marked failed | 5.3 s |
| | next build | 6.6 s |
| | restart and catch-up of a missed scheduled load | 6.6 s |

The real dataset is the French Ministry of the Interior's 2024 road accident database
([data.gouv.fr](https://www.data.gouv.fr/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2025),
Licence Ouverte 2.0): `caract-2024.csv`, `lieux-2024.csv`, `vehicules-2024.csv`,
`usagers-2024.csv`, 34 MB in all, not versioned. Download them into a folder, then
`FORJA_OPEN_DATA_DIR=<folder> uv run pytest tests/campaign/test_open_data.py`. Forja
finds the four relations (`num_acc` to the characteristics, `id_vehicule` of the users
to the vehicles); quality scores 100, 83, 96.8 and 99.9. Without a model, the Gold
proposal keeps the BAAC nomenclatures (lighting, severity, user category...) as
dimensions instead of summing them.

## Interface

### Canvas load (production build, Chrome)

| | First visit after sign-in | Reload |
|---|---|---|
| Before (reported stuck on its skeleton) | up to 20 s | 3.3 to 5.0 s |
| After | 1.5 to 1.8 s | 0.4 to 1.3 s |
| End-to-end test (5 runs, threshold 5 s) | ELK cold: 2.5 to 3.7 s | ranking reused: 1.6 to 3.2 s |

Playwright's Chromium, emulated x64 on this machine, takes 2.1 to 5.5 s for the same
reload: the timing test therefore runs in Chrome (the `chrome` project of
`playwright.config.ts`), the other end-to-end tests in Chromium.

### Renders while the canvas loads

Reload of the demo canvas in Playwright's Chromium (the slow browser of the
workstation), production build, 10 runs; commits counted through React's devtools hook,
times read through the DevTools protocol (`Performance.getMetrics`) until 3 s after the
nodes show.

| | Before | After |
|---|---|---|
| React commits | 35 to 41 | 22 to 24 |
| Script time (median) | 1.87 s | 1.5 s |
| Main-thread task time (median) | 4.1 s | 3.4 s |

Causes removed: a one-second timer that redrew every node as long as a successful run
existed, even an old one; a layout rebuilt (and a 340 ms tween started) for every new
graph object of identical structure; the palette commands registered again in the
shell, which redrew the whole interface. The remaining renders come mostly from React
Flow (node measurement) and the nodes' entrance.

### Lighthouse (desktop preset, Chrome, median of 3 runs)

| Screen | Score | LCP | TBT | CLS |
|---|---|---|---|---|
| Canvas (engineer) | 98 | 1.1 s | 0 ms | 0.003 |
| Analyst home | 90 | 1.0 s | 240 ms | 0.003 |
| Conversation with the agent | 99 | 1.0 s | 0 ms | 0 |
| Data mart preview | 91 | 1.0 s | 0 ms | 0 |

### JavaScript per route

`pnpm budget` (after `pnpm build`, checked in CI) adds up the gzipped first load of each
page and compares it with `apps/web/js-budget.json`.

| Routes | Measured | Budget |
|---|---|---|
| Screens of a project (20 routes) | 394 to 433 KB | 470 KB |
| Design system page | 360 KB | 400 KB |
| Sign-in, invitation, password, home, projects | 252 to 259 KB | 290 KB |

The canvas (React Flow) and ELK load afterwards, by dynamic import, outside the budget.

## Real language model

Ollama, `qwen3.5:9b` on CPU (Snapdragon X Plus, native ARM64), cache off.

| Measure | Result |
|---|---|
| Gold proposal of the reference journey | 386 s; the model's plan (`llm:ollama/qwen3.5:9b`) validated without error: `fct_commande`, `dim_client`, `dim_produit` |
| Agent evaluation, 5 representative questions | 5/5 (simple, ambiguous, two complex, out of scope) |
| Questions handled without a model | 2 of 5, in 0.9 and 2.5 s |
| Questions through the model | 3, in 128 to 146 s; 1,588 to 1,671 input tokens, 49 to 102 output |
| Average context sent | 193 tokens (schemas, statistics, semantic layer: no value) |

`FORJA_CAMPAIGN_LLM_MODEL=qwen3.5:9b uv run pytest -s tests/campaign/test_real_llm.py`
and `uv run python -m tests.agent_eval --provider ollama --subset`. On a CPU, count two
minutes per question that needs the model; a GPU or a remote provider brings them to a
few seconds.

## Limits

- One reference workstation, ARM64 with emulated Python; CI gives the x64 point of
  comparison and the arm64 container the native one.
- The 2 GB upload is measured locally, without network: the real throughput depends on
  the connection.
- Scenario durations depend on dbt starting at each run (3.3 s of imports at rest on
  this machine, much more on a loaded one; partial parsing takes about 0.8 s off since
  0.1.0); they do not measure throughput.
- Lighthouse audits signed-in screens, served by `next start` and the local API,
  without network throttling (desktop preset).
