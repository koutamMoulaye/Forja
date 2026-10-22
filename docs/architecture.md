# Architecture

## Principes

- **Local-first** : tout fonctionne sur un poste, sans service externe. DuckDB sert de
  moteur de calcul, de catalogue et d'entrepôt ; les données brutes sont en Parquet.
- **Même code en SaaS** : le cœur (`forja_core`) ne dépend pas de FastAPI ; le stockage
  passe par `Workspace` et l'exécution des jobs par l'interface `JobRunner`, deux points
  de remplacement (stockage objet, orchestrateur).
- **Rien n'est supprimé en silence** : une ligne Bronze finit en Silver, en quarantaine
  (`__rejects`), ou est comptée comme doublon exact dans les métriques du run.
- **Confidentialité par construction** : la couche Silver interne est en clair, tout ce
  qui sort (base serving, exports) est traité ; aucun modèle de langage ne reçoit de
  valeur de cellule.

## Monorepo

| Paquet | Import | Rôle |
|---|---|---|
| `packages/core` | `forja_core` | Catalogue, ingestion, profiling, plans Silver, relations, plans Gold, génération dbt, jobs, confidentialité, serving |
| `packages/llm` | `forja_llm` | Fournisseurs Anthropic / OpenAI / Ollama, contexte sans données brutes, proposeur Gold |
| `apps/api` | `forja_api` | API HTTP FastAPI et worker de jobs |

## Flux Bronze → Silver → Gold → serving

```
 fichier CSV / Excel / Parquet / JSON
        │  POST /projects/{id}/sources   (auto | new_source | new_version)
        ▼
 ┌──────────────────────── BRONZE ────────────────────────┐
 │ data/<p>/bronze/<source>/<horodatage>_vNNNN_<f>.parquet │  un fichier par version
 │ + _batch_id, _ingested_at, _source_file, _row_hash      │  (= lot), jamais modifié
 └───────────────────────────┬────────────────────────────┘
        │ profiling de la version          │ dérive de schéma vs version précédente
        ▼                                  ▼
 ┌─────────────── PLAN DE TRANSFORMATION (catalogue) ──────────────┐
 │ règles déterministes : types, formats, normalisation, snake_case,│
 │ déduplication, validité, clé primaire, traitement PII            │
 │ draft ──(PATCH = nouvelle version)──► approved ──(build)──► applied
 └───────────────────────────┬─────────────────────────────────────┘
        │ run build_silver : génération idempotente de data/<p>/dbt/ puis dbt build
        ▼
 ┌──────────────── SILVER : data/<p>/warehouse.duckdb ────────────────┐
 │ stg_<source>__checked (ephemeral)                                   │
 │   lignes Bronze non traitées → dédup exacte → nettoyage → typage    │
 │   → _reject_reason                                                  │
 │        ├── raison nulle ──► stg_<source>           (incrémental,     │
 │        │                     clé primaire ou _row_hash, contrat)     │
 │        └── raison ───────► stg_<source>__rejects  (incrémental,     │
 │                              valeurs brutes, quarantaine)            │
 └───────────────────────────┬────────────────────────────────────────┘
        │ fin de build_silver : détection des relations (inclusion, noms, types)
        ▼
 ┌──────────────── RELATIONS (catalogue) ──────────────────────────────┐
 │ commandes.id_client → clients.id_client  94 %  N-1                  │
 │ suggested ──(revue humaine)──► confirmed | rejected                  │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ POST /projects/{id}/gold-plan/propose
        │   LLM (contexte sûr + relations confirmées) ou heuristique
        ▼
 ┌──────────────── PLAN GOLD (catalogue) ──────────────────────────────┐
 │ dimensions (clé naturelle, clé de substitution, SCD1/SCD2), faits   │
 │ (grain, jointures N-1, FK, dates, mesures validées par sqlglot)     │
 │ validation : grain, relations confirmées, orphelins, fan-out        │
 │ draft ──(PATCH)──► approved ──(build_gold)──► applied                │
 └───────────────────────────┬─────────────────────────────────────────┘
        │ run build_gold : snapshots SCD2, dim_*, dim_date, fct_*, tests
        ▼
 ┌──────────────── GOLD : data/<p>/warehouse.duckdb ───────────────────┐
 │ snap_<source> ─► dim_<source>  (MD5 de la clé, membre inconnu -1,   │
 │                                 valid_from / valid_to / is_current) │
 │ dim_date  (AAAAMMJJ, libellés français)                             │
 │ fct_<processus>  (FK -1 si orpheline, version SCD2 à la date du fait)│
 └───────────────────────────┬─────────────────────────────────────────┘
        │ run export : tables publiées (Gold par défaut), traitement PII
        ▼
 ┌──────────────────────────── SERVING ────────────────────────────────┐
 │ data/<p>/serving/<projet>.duckdb   dim_*, fct_* + _forja_tables     │ ◄── BI en
 │ data/<p>/exports/<table>.parquet|csv                                │     lecture seule
 │ GET /tables/{id}/export · GET /tables/{id}/preview (traités)        │
 └─────────────────────────────────────────────────────────────────────┘
```

## Bronze et versions

- Une source est un **nom logique** (le nom du fichier, plus le nom de feuille pour
  Excel). Un upload sur un nom existant crée une **version** : un nouveau fichier
  Parquet, une ligne dans `source_versions`, un `_batch_id` propre.
- `_row_hash` est le SHA-256 du JSON canonique des valeurs de la ligne. Il sert à la
  déduplication exacte et à l'incrémental : une ligne dont le hash est déjà en Silver ou
  en quarantaine n'est pas retraitée.
- La **dérive de schéma** (colonnes ajoutées, supprimées, type physique ou inféré
  changé) est calculée à chaque version, stockée et exposée
  (`GET /sources/{id}/versions`) ; elle ne bloque jamais l'ingestion.
- Les versions sont lues ensemble avec `read_parquet(..., union_by_name = true)` : une
  colonne absente d'une version vaut NULL pour ses lignes.

## Plans de transformation

Générés par des règles déterministes à partir du profil de la dernière version (aucun
modèle de langage n'intervient). Chaque règle porte une explication en français
destinée à l'interface. Une nouvelle version de la source rafraîchit le plan en
conservant les décisions approuvées et en signalant les colonnes ajoutées, disparues
ou retypées. Le build utilise le **plan effectif** : la dernière version approuvée ou
appliquée ; un brouillon en cours n'a aucun effet tant qu'il n'est pas approuvé.

## Projet dbt généré

```
data/<p>/dbt/
├── dbt_project.yml, profiles.yml        profil DuckDB → ../warehouse.duckdb
├── macros/
│   ├── forja_unprocessed_rows.sql       filtre incrémental sur _row_hash
│   └── forja_unique_combination.sql     test d'unicité des clés composites
└── models/staging/
    ├── _bronze__sources.yml             sources = Parquet Bronze (external_location)
    ├── schema.yml                       descriptions, contrats de types, tests
    └── <source>/stg_<source>{__checked,,__rejects}.sql
```

Le projet est entièrement régénéré à chaque build, de façon idempotente : fichiers
identiques octet pour octet si les plans n'ont pas changé, fichiers obsolètes supprimés.
Il ne doit pas être modifié à la main.

**Incrémental et full refresh.** Une table n'est reconstruite depuis tout le Bronze que
si une décision touchant des lignes déjà en Silver a changé (type, nom, règle, clé,
déduplication) ou sur demande (`full_refresh`). Une colonne ajoutée par une nouvelle
version reste incrémentale (`on_schema_change='append_new_columns'`). Changer le
traitement PII d'une colonne ne reconstruit rien : il ne concerne que les sorties.

**Clé primaire.** Avec une clé, une ligne plus récente remplace l'ancienne
(`delete+insert`) ; deux lignes différentes d'un même lot avec la même clé partent en
quarantaine. Sans clé, l'unicité repose sur `_row_hash`.

## Relations

Détectées à la fin de chaque `build_silver` et sur demande
(`POST /projects/{id}/relations/detect`), entre une colonne d'une table et la clé
(primaire ou candidate, une colonne) d'une autre. Confiance = 0,6 × inclusion + 0,3 ×
similarité de noms + 0,1 × compatibilité de type ; seuils dans `FORJA_RELATION_*`. Une
relation se confirme, se rejette ou se déclare à la main (elle est alors mesurée, et sa
cible doit être unique). Voir [decisions.md](decisions.md), D11.

## Fournisseurs LLM

`forja_llm` expose `LLMProvider.generate(request, ResponseModel)` : Anthropic, OpenAI et
Ollama, sortie structurée validée par Pydantic, retries avec backoff, comptage des tokens
et journal `llm_calls` sans données. `LLMRequest` n'accepte qu'un `LLMSafeContext`,
construit par `build_safe_context` à partir des profils, des plans Silver et des
relations, sans aucune valeur de ligne. Voir D12 et D13.

## Plan Gold et génération dbt

Le plan Gold est versionné par projet (cycle `draft` → `approved` → `applied`), proposé
par le LLM configuré ou par l'heuristique, puis validé (D14). À l'approbation, le
générateur ajoute au projet dbt :

```
data/<p>/dbt/
├── snapshots/snapshots.yml          snap_<source> (SCD2, strategy check)
└── models/gold/
    ├── schema.yml                   unique/not_null sur les clés, relationships
    │                                fait → dimension et dim_date, test de grain
    ├── dim_<source>.sql             membres + membre inconnu (-1)
    ├── dim_date.sql                 du premier au dernier jour des faits
    └── fct_<processus>.sql          grain, FK, clés de date, mesures
```

Le run `build_gold` régénère le projet (Silver et Gold), exécute
`dbt build --select snap_* dim_* dim_date fct_*`, mesure les lignes par modèle et les
lignes rattachées au membre inconnu, enregistre les tables Gold (publiées par défaut) et
passe le plan à `applied`. Un `build_silver` régénère aussi les fichiers Gold, pour que le
projet reste complet. Voir D15.

## Jobs

Table `jobs` du catalogue : type (`profile`, `build_silver`, `build_gold`, `export`), statut
(`queued` → `running` → `succeeded` | `failed`), horodatages, logs, métriques.

- `JobExecutor` exécute un job : transitions de statut, logs horodatés, métriques,
  erreurs.
- `JobRunner` décide quand : `ThreadJobRunner` (worker local, un job à la fois, ce qui
  respecte le modèle mono-écrivain de DuckDB), `InlineJobRunner` (tests, scripts). Un
  orchestrateur externe implémentera la même interface.
- Au démarrage, les jobs restés `running` (processus arrêté) passent en `failed` et les
  jobs `queued` sont repris.
- dbt tourne dans un sous-processus ; sa sortie est recopiée dans les logs du run et
  `run_results.json` fournit le résultat de chaque test.

Métriques d'un `build_silver`, globales et par source : lignes lues (non encore
traitées), déjà traitées, doublons exacts retirés, valides, rejetées, remplacées par une
version plus récente de la même clé, durée, résultats des tests dbt.

## Verrous

Un verrou par projet protège `warehouse.duckdb` : pendant un build (écriture par dbt),
les exports attendent (`FORJA_EXPORT_LOCK_TIMEOUT_SECONDS`) puis répondent `409
warehouse_busy`.

## Catalogue

`forja_meta.duckdb` : `projects`, `sources`, `source_versions`, `profiles` (par
version), `plans` (versionnés), `jobs`, `warehouse_tables` (tables Silver et Gold, avec
leur indicateur de publication), `relations`, `gold_plans` et `llm_calls`. Le schéma
évolue par migrations numérotées (`catalog/migrations.py`) appliquées au démarrage ; un
catalogue d'une étape précédente est migré sans perte.

## Confidentialité

- **Silver** : en clair, réservé au moteur.
- **Sorties** : traitement par colonne défini dans le plan — `hash` (HMAC-SHA256, sel
  aléatoire de 32 octets par projet dans `FORJA_SECRETS_DIR`, hors du dépôt), `mask`
  (masquage partiel), `drop` (colonne retirée) ou `none`. Défaut : `hash` pour toute
  donnée personnelle détectée avec une confiance moyenne ou élevée.
- **LLM** : `forja_llm.context.build_safe_context` ne copie que schéma et statistiques
  (voir étape 1).

## Journalisation

Logs structurés via structlog (JSON par défaut, `FORJA_LOG_FORMAT=console` pour un
affichage lisible). Chaque requête HTTP reçoit un `request_id` ; chaque job journalise
`job_id`, `project_id` et `type`.
