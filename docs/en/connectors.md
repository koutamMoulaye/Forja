# Connectors, scheduled loads and large volumes

*Français : [connectors.md](../connectors.md)*

A Forja source comes from a file, a database or a REST API. A loaded table or endpoint
is a source like any other: versions, schema drift, profile, Silver plan, then Gold and
serving. The technical choices are explained (in French) in
[decisions.md](../decisions.md) (D28 to D32).

## Add a source

**Sources › Ajouter une source** (add a source) offers three paths:

| Choice | Wizard |
|---|---|
| File | CSV, Excel, Parquet, JSON, up to 10 GB; above 8 MB, a resumable chunked upload |
| Database | Connection → Test → Tables (full or incremental) → Schedule |
| API | Connection → Test → Endpoint (pagination, incremental) → Preview → Schedule |

**Sources › Connexions** lists the connections: state (active, loading, unreachable,
never loaded), last and next load, the sources they feed and their mode. From there you
load now, change the schedule, test or delete a connection (its sources stay, with
their versions). On the canvas, a source loaded from a database or an API carries the
icon of its connector, and the inspector gives its next load.

Restricted to the **admin** and **engineer** roles (`connection.manage`). Every action
is audited (`connection.*`, `schedule.*`), without credentials or values.

## Databases

| Database | Driver | Default port |
|---|---|---|
| PostgreSQL | psycopg 3 | 5432 |
| MySQL, MariaDB | PyMySQL | 3306 |
| SQL Server | pymssql | 1433 |

- **Account**: use a read-only account, limited to the tables to load. Forja only
  reads, opens read-only sessions where the database allows it (PostgreSQL, MySQL), and
  the connection test warns about an account that can write.
- **Exploration**: schemas, tables and views, columns with their database type and
  their Bronze type, estimated row count (from the database statistics), primary key,
  proposed cursor columns.
- **Modes**: *full* reads the whole table at each load (a new version, new rows counted
  by `_row_hash`); *incremental* reads only the rows whose cursor column is beyond the
  largest value of the previous load. A modification date catches inserts and updates;
  a creation date or an increasing id, inserts only. A load without new rows creates no
  version. Rows committed late, just before the cursor, are caught by a re-read window
  and deduplicated.
- **Reading**: batches of 50,000 rows (`FORJA_CONNECTOR_BATCH_ROWS`) through a
  server-side cursor, written to Parquet as they come; the run shows the progress (rows,
  batches).

Type mapping: see D28.

## REST APIs

| Setting | Options |
|---|---|
| Authentication | none, key (header or query parameter), Bearer token, Basic, OAuth2 client credentials |
| Pagination | none, page number, offset and limit, cursor (path of the next cursor), `Link` header, next URL (path in the response) |
| Records | path `a.b` in the response, detected when empty (`data`, `items`, `results`...) |
| Incremental | parameter sent (`since`) and record field whose largest value is kept (`updated_at`), starting value |
| Robustness | rate limit (calls per second), retries on 429 and 5xx with exponential backoff, `Retry-After` honoured, 30 s timeout |

- **Preview**: the first page, flattened, before saving: detected path, number of
  records, next page, child tables and proposed relations.
- **Nested JSON**: objects → columns `client.ville`; lists → child tables
  `endpoint__list`, linked by `endpoint_id` (or `_forja_key`) with `_position`.
- **Private addresses**: refused by default (SSRF protection, names resolved once and
  pinned, redirects checked). The instance administrator allows hosts, IPs or CIDR
  ranges in **Réglages › Connecteurs** (settings) or with
  `FORJA_CONNECTOR_ALLOWED_HOSTS='["crm.internal", "10.0.0.0/8"]'`.

## Scheduling

Per connection (all its sources) or per source loaded from a connection. Typed in
French and interpreted live, with the next three runs:

| Input | Meaning |
|---|---|
| `manuel` | manual loads only |
| `toutes les heures`, `toutes les heures à la minute 15` | every hour (at minute 15) |
| `toutes les 15 minutes`, `toutes les 2 heures` | every 15 minutes, every 2 hours |
| `tous les jours à 6 h`, `chaque jour à 6h30`, `à midi` | every day at 6:00, 6:30, noon |
| `du lundi au vendredi à 7h30`, `en semaine à 18:45`, `le week-end à 10h` | weekdays, weekends |
| `chaque lundi et jeudi à 8 h`, `hebdomadaire` | weekly |
| `le 1er de chaque mois à 5 h` | monthly |
| `0 6 * * 1-5` | a five-field cron expression |

A scheduled load chains extraction → profile → Silver → Gold → published data marts →
serving, with the approved plans (never changed by the schedule). The scheduler runs in
the API process: **a single API instance** (D31). Time zone: `FORJA_TIMEZONE`. A load
missed while the API was stopped is caught up once at the next start.

## Large volumes

| Setting | Default | Role |
|---|---|---|
| `FORJA_MAX_UPLOAD_MB` | 10240 | largest file |
| `FORJA_UPLOAD_CHUNK_MB` | 8 | size of an upload chunk |
| `FORJA_UPLOAD_SESSION_HOURS` | 48 | lifetime of an unfinished upload |
| `FORJA_DUCKDB_MEMORY_LIMIT` | `auto` | memory DuckDB may use before spilling to disk; `auto`: half the memory available at start (a container's limit included), between 1 and 16 GB |
| `FORJA_DUCKDB_THREADS` | 4 | DuckDB threads |
| `FORJA_DUCKDB_TEMP_DIRECTORY` | `<data_dir>/_tmp` | spill directory |
| `FORJA_PROFILING_FULL_SCAN_ROWS` | 1000000 | above it, fine statistics come from a sample |
| `FORJA_PROFILING_SAMPLE_ROWS` | 200000 | size of the sample |

Nothing is loaded whole: files are streamed by DuckDB, tables read in batches, and
memory stays far below the data size. Measures (one and five million rows, a
PostgreSQL table of ten million rows loaded incrementally, a 2 GB upload cut twice):
[benchmarks.md](benchmarks.md). Run them again with
`FORJA_VOLUME_ROWS=5000000 uv run pytest -s tests/test_volume.py`.
