# Connecting a BI tool

*Français : [bi.md](../bi.md)*

Forja publishes the Gold tables of a project (and the Silver tables you choose) in a
DuckDB database made for reading:

```
data/<project_id>/serving/<project_name>.duckdb
```

It is (re)built by an `export` run (`POST /projects/{id}/runs` with
`{"type": "export"}`), which also writes Parquet and CSV files in
`data/<project_id>/exports/`. With Docker, `data/` is the `forja-data` volume.

## What the database holds

By default only the **Gold tables** (the star schema) are published:

| Table | Content |
|---|---|
| `fct_<process>` (e.g. `fct_ventes`) | One row per grain of the fact (e.g. an order line): keys to the dimensions, date keys, degenerate dimensions (order number, status, codes), measures |
| `dim_<source>` (e.g. `dim_clients`) | One row per member, or per version with SCD2 (`valid_from`, `valid_to`, `is_current`), plus the "Unknown" member with key `-1` |
| `dim_date` | One day per row (`date_key` as YYYYMMDD), year, quarter, month, ISO week, day and French labels, plus the `-1` member |
| `<source>` (e.g. `commandes`) | A Silver table, only if it was published explicitly (`PATCH /tables/{id}` with `{"publish": true}`) |
| `_forja_tables` | One row per published table: layer, origin table, plan version, row count, treated columns, publication date |

### Using the star schema

- Relate each key of the fact to the key of its dimension (`fct_ventes.client_key` →
  `dim_clients.client_key`, `fct_ventes.date_commande_key` → `dim_date.date_key`),
  many-to-one, filtering from the dimension to the fact. In Power BI, mark `dim_date` as
  the date table (column `date`).
- SCD2 dimensions hold one row per version: the fact already points to the version
  valid at its date, no filter is needed. For the "current" state of customers, filter
  `is_current = true`.
- Fact rows whose key matches no member point to the "Unknown" member (`-1`): totals
  stay right and those rows stay visible.
- The default aggregation of each measure (sum, average...) is given in the Gold plan
  and in `models/gold/schema.yml` (`meta.aggregation`).

Detected personal data is treated as the plan of each source says (by default
**HMAC-SHA256 pseudonymization**, otherwise partial masking or removal); the internal
Silver layer stays in clear. One email gives the same pseudonym in every table of a
project: joins still work.

Quarantined rows (`stg_<source>__rejects`) are not published.

## Rules of use

- **Always open the file read-only.** DuckDB accepts one writing process; several
  read-only readers can work at the same time.
- **Refresh**: each `export` run rebuilds the database in a temporary file, then
  swaps it in one move; a tool never reads a half-written file. On Windows, if a tool
  keeps the file open the swap fails and the run ends with the error `serving_in_use`:
  close the connection (or schedule the BI refresh after the export) and run again.
- **DuckDB version**: Forja writes the file with DuckDB 2.0 (see
  [decisions.md](../decisions.md)). Use a DuckDB driver or engine of the same version or
  newer: an older one may refuse a newer storage format.

## Power BI (DuckDB ODBC driver)

1. Install the **DuckDB ODBC** driver for Windows x64 from DuckDB's official download
   page, version 2.0 or later.
2. Open *ODBC Data Sources (64-bit)* → *User DSN* → *Add* → *DuckDB Driver*, then set:
   - **Database**: the full path of the file, for instance
     `C:\forja\data\<project_id>\serving\sales.duckdb`;
   - the option `access_mode=READ_ONLY`.

   The same as a connection string:

   ```
   Driver={DuckDB Driver};Database=C:\forja\data\<project_id>\serving\sales.duckdb;access_mode=READ_ONLY
   ```
3. In Power BI Desktop: *Get data* → *ODBC* → choose the DSN, then the tables.
   **Import** mode is recommended.
4. For a scheduled refresh in the Power BI service, the on-premises data gateway needs
   access to the file and to the ODBC driver.

Without a driver: Power BI's *Parquet* connector on the files of
`data/<project_id>/exports/`.

## Superset

1. Add DuckDB's SQLAlchemy dialect to the Superset image: `pip install duckdb-engine`
   (with a `duckdb` package version 2.0 or later).
2. Make the file reachable from the container, read-only, for instance:

   ```yaml
   services:
     superset:
       volumes:
         - ./data/<project_id>/serving:/forja/serving:ro
   ```
3. *Settings* → *Database Connections* → *+ Database* → *Other*, with the URI:

   ```
   duckdb:////forja/serving/sales.duckdb?access_mode=read_only
   ```

## Metabase

1. Put the community DuckDB driver for Metabase (the `metabase_duckdb_driver` project
   published by MotherDuck) in Metabase's `plugins/` folder, then restart Metabase.
2. Mount the `serving` folder read-only in the Metabase container, as for Superset.
3. *Admin* → *Databases* → *Add database* → *DuckDB*:
   - **Database file**: `/forja/serving/sales.duckdb`;
   - turn on the read-only connection option.

## Export files

`GET /tables/{table_id}/export?format=parquet|csv` downloads a Silver table treated
the same way as the serving database. CSV files are UTF-8, with a header and `;` as the
default separator (`delimiter` parameter, or `FORJA_EXPORT_CSV_DELIMITER`).
