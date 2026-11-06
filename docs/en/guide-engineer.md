# Engineer guide: from a file to a published model

*Français : [guide-engineer.md](../guide-engineer.md)*

This guide follows an engineer through the interface, on the demo project or on your
own files. **The interface is in French in 0.1** (English comes in the next version):
labels are quoted as they appear on screen, followed by their meaning.

Sign in at <http://localhost:3000> with an engineer or administrator account; you land
on the **Pipeline** canvas.

## Create a project and add the team

The instance administrator creates projects: **« Nouveau projet »** (new project) in the
project selector (top left) or on the *Vos projets* (your projects) page. A name, an
optional description, and the empty canvas of the new project opens, ready for files.

*Réglages › Membres › Ajouter un membre* (settings, members, add a member) then adds an
existing account as engineer or analyst; that person finds the project in their
selector at their next sign-in. In `multi` mode, *Inviter* (invite) also sends a
registration link to an address without an account.

## 1. Load files, tables or an API

*Sources › Ajouter une source* (add a source), or drop files on the canvas of an empty
project.

- **File**: CSV, Excel (every sheet), Parquet, JSON, up to 10 GB. Above 8 MB the upload
  goes in chunks and resumes after a cut: choosing the same file again starts where it
  stopped.
- **Database**: PostgreSQL, MySQL/MariaDB or SQL Server. The wizard tests the
  connection (a read-only account is recommended), lists the tables with their
  estimated size, offers for each a full or an incremental load on a detected cursor
  column (`updated_at`, an increasing id), then a schedule.
- **API**: base URL, authentication, endpoint, pagination, path of the records; the
  preview of the first page shows the flattened columns and the child tables of nested
  lists before anything is saved.

Connections are followed in *Sources › Connexions*: state, last and next load,
« Charger » (load now), « Planifier » (schedule, e.g. every day at 6 am). Details:
[connectors.md](connectors.md).

Loading a file with the same name again, or reloading a table, creates a **new
version** of the source; schema drift (columns added, removed or retyped) is reported.

Every version is profiled: types, missing values, candidate keys, duplicates, personal
data detected (hatched columns) and a quality score. The page of a source shows all of
it, column by column.

## 2. Review the cleaning plan

A notification « Plan de nettoyage à revoir » (cleaning plan to review) arrives after
profiling. The plan (*Nettoyage*, or *Revoir* on the canvas node) lists the proposed
rules: type conversions, normalization, deduplication, validity, primary key, treatment
of personal data. Each rule comes with its explanation, its confidence, and values
before and after.

- **Valider** (accept), **Rejeter** (reject) or **Modifier** (edit) a rule; « Valider
  les règles à confiance élevée » accepts the obvious ones at once.
- **Approuver** (approve) the plan, then **Nettoyer** (clean): the run builds the Silver
  table with dbt. Invalid rows go to **quarantine** with their reason; nothing is
  dropped silently.

## 3. Confirm the relations and the star schema

After cleaning, Forja detects the relations between sources (value inclusion, column
names, types); confirm or reject them in *Modèle* (model).

« Proposer le modèle » (propose the model) produces a star schema: dimensions (with SCD2
history when needed), facts with an explicit grain, measures. The proposal comes from
the configured AI provider or, without one, from deterministic rules: they recognise
code columns (a nomenclature, a month) and keep them as dimensions instead of summing
them. The « À résoudre » list (to resolve) shows what blocks (ambiguous grain,
unconfirmed relation, fan-out). Adjust, **Valider le modèle** (validate), then
**Construire** (build): dbt builds the Gold tables and the semantic layer is
generated.

## 4. Follow the runs

The running run shows in the top bar; on the canvas each table goes from « En attente »
(waiting) to « En cours » (running) then « Réussi » (succeeded). *Runs* keeps the
history: steps table by table, metrics (rows read, valid, rejected), dbt tests and the
log. A notification announces the end or the failure, with a link to the run.

## 5. Serve and govern

- *Diffusion* (serving): tables published in the serving database (Power BI, Superset,
  Metabase, see [bi.md](bi.md)) and Parquet or CSV exports. Personal data is
  pseudonymized there.
- *Couche sémantique* (semantic layer): labels, synonyms and formulas of the metrics
  the agent uses. Synonyms proposed by analysts, and French translations proposed by
  Forja for English column names, wait for your review there.
- *À approuver* (to approve): data marts validated by analysts. The preview is the same
  as theirs; **Approuver et publier** (approve and publish) or **Rejeter** (reject) with
  a reason, which the analyst receives. In multi-user mode, your own data mart is
  approved by another engineer.
- *Gouvernance* (governance): map of personal data per layer and audit log
  (administrators), filtered by user, action, object, period and text.

## Shortcuts

`⌘K` / `Ctrl K`: search and actions. On the canvas: arrows to move between nodes,
`Enter` for the inspector, `Esc` to close it, `+` `-` `0` to zoom. `?` lists every
shortcut.
