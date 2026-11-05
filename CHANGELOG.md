# Changelog

All notable changes to Forja are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Forja adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0, a minor
version may change the API or the plans' format; the notes say how to upgrade.

## [Unreleased]

## [0.1.0] - 2026-11-01

First public release. The interface is in French; English arrives in the next version.

### Added

- **Ingestion** of CSV, Excel, Parquet and JSON files up to 10 GB (resumable chunked
  upload, streamed by DuckDB), of PostgreSQL, MySQL/MariaDB and SQL Server tables (full
  or incremental) and of paginated REST APIs. Every load is a version; schema drift is
  detected and blocks the build until a plan is approved. Scheduled loads refresh the
  published data marts.
- **Profiling** of every column: types (French dates and decimals included), missing
  values, candidate keys, duplicates, personal data (email, phone, IBAN, names) and a
  quality score.
- **Silver cleaning plans** reviewed rule by rule, each rule explained with values
  before and after, run by dbt on DuckDB; invalid rows go to quarantine.
- **Gold star schemas** (dimensions, SCD2, facts with an explicit grain) proposed by a
  language model or by deterministic rules, validated, then built by dbt.
- **Semantic layer** generated from the star schema: French labels, synonyms,
  additivity, hierarchies; engineers edit it, analysts propose synonyms.
- **Data marts asked in French** by analysts: Forja shows what it understood, a sample,
  the SQL and reconciliation checks; an engineer approves, Forja publishes.
- **Serving** to Power BI, Superset or Metabase through a DuckDB serving database, or
  as Parquet and CSV exports, personal data pseudonymized (HMAC-SHA256, per-project
  salt).
- **AI providers**: none (deterministic, the default), Ollama (local), Anthropic or
  OpenAI. A model never receives data values and never writes SQL.
- **Accounts and roles** (admin, engineer, analyst), local or multi-user mode, httpOnly
  sessions, API keys, audit log, strict Content-Security-Policy.
- **Web interface** (Next.js): pipeline canvas, plans, runs, governance, the analyst
  home and the agent, live notifications, light and dark themes.
- **One-command install** with Docker (`install.sh`, `install.ps1`), from the published
  images for linux/amd64 and linux/arm64; a demo project.

### Fixed during the release test campaign

- The Gold proposal without a model groups code columns (nomenclatures such as the
  BAAC road accident codes, months, departments) instead of summing them.
- A padded month ("03") is read as an integer, the zeros dropped and said so, while a
  code keeps its leading zero as text.
- French synonyms are proposed for common English column names (`amount`, `customer`,
  `order`, `price`...), for an engineer to accept.
- The DuckDB memory limit follows the memory available by default (`auto`: half of it,
  a container's limit included, between 1 and 16 GB).
- dbt keeps its partial parsing between runs (the run id is an environment variable).
- dbt is bound to the life of the API on macOS and Linux, as on Windows.
- The pipeline canvas renders far less while it loads.

### Fixed during the manual tests

- The administrator creates a project from the interface (« Nouveau projet » in the
  project selector and on the projects page), then adds existing accounts to it as
  engineer or analyst from the members settings, in local mode too.
- The canvas no longer frames its compartments under the transparent top bar (a
  remembered camera) nor under the sidebar once opened: it is framed again.

### Security

- Secret scanning of the whole history (gitleaks), dependency audit (pip-audit,
  pnpm audit), CodeQL and Dependabot in CI; the images are signed with cosign and carry
  SBOM and provenance attestations.

[Unreleased]: https://github.com/forjadata/forja/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/forjadata/forja/releases/tag/v0.1.0
