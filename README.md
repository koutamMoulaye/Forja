# Forja

**Forja** est une plateforme open source de data engineering automatisée, *local-first*
et déployable en SaaS.

Vous branchez une source, Forja profile les données, propose une architecture
(Medallion par défaut), génère et exécute les transformations, puis livre des datasets
propres, exportables et connectables à votre outil BI. À terme, un agent permettra aux
équipes métier de demander un data mart en langage naturel, avec un aperçu de
vérification avant publication.

> **État actuel : étape 2.** Ingestion versionnée vers Bronze, profiling, plans de
> transformation Silver relus puis exécutés par dbt, moteur de jobs, publication pour la
> BI et exports avec pseudonymisation. La modélisation Gold arrive à l'étape 3.

## Fonctionnalités

- **Projets** : espaces de travail isolés (`data/<project_id>/{bronze,silver,gold}`),
  enregistrés dans un catalogue de métadonnées DuckDB (`data/forja_meta.duckdb`).
- **Ingestion** de CSV, Excel (`.xlsx`, toutes les feuilles), Parquet et JSON / JSON Lines :
  - détection automatique de l'encodage (BOM, UTF-8, puis détection statistique) et du
    séparateur CSV (`,` `;` tabulation `|`) ;
  - écriture brute en Parquet avec les colonnes techniques `_batch_id`, `_ingested_at`,
    `_source_file` et `_row_hash` (SHA-256 des valeurs de la ligne) ;
  - **versions** : recharger une source crée une nouvelle version, avec détection de la
    dérive de schéma (colonnes ajoutées, supprimées, retypées) sans bloquer ;
  - erreurs explicites : fichier vide, corrompu, encodage inconnu, format non supporté,
    colonnes dupliquées (renommées par défaut ou rejetées selon la configuration).
- **Profiling** de chaque table Bronze, stocké dans le catalogue :
  - type inféré par colonne, y compris dates au format texte (`JJ/MM/AAAA`, ISO…) et
    nombres à virgule décimale française (`1 234,56`) ;
  - % de nulls, cardinalité, unicité, min / max / moyenne / écart-type, top valeurs ;
  - clés primaires candidates simples et composites (2 colonnes) ;
  - doublons exacts ;
  - détection de données personnelles (email, téléphone, IBAN avec contrôle mod-97,
    nom / prénom) avec niveau de confiance ;
  - score qualité 0-100 avec le détail de son calcul.
- **Plans de transformation Silver**, générés par règles déterministes depuis le profil :
  conversions de types (dates `JJ/MM/AAAA`, virgule décimale, oui/non…), normalisation
  des textes, renommage snake_case, déduplication exacte, règles de validité (clé non
  nulle, formats email / téléphone / IBAN), clé primaire, traitement des données
  personnelles. Chaque règle est expliquée en français. Cycle `draft` → `approved` →
  `applied`, modifiable par `PATCH`, approbation automatique possible en local
  (`FORJA_AUTO_APPROVE_SILVER=true`).
- **Génération dbt** idempotente (`data/<project_id>/dbt/`) : modèles incrémentaux
  `stg_<source>` sur `_row_hash`, quarantaine `stg_<source>__rejects` avec
  `_reject_reason`, contrats de types, tests `unique` / `not_null` /
  `accepted_values`, descriptions issues du profil.
- **Moteur de jobs** (`profile`, `build_silver`, `export`) exécuté en tâche de fond, avec
  logs et métriques : lignes lues, valides, rejetées, doublons retirés, durée, résultats
  des tests dbt.
- **Publication** : base DuckDB `data/<project_id>/serving/<projet>.duckdb` pour Power BI,
  Superset ou Metabase ([docs/bi.md](docs/bi.md)), exports Parquet / CSV. Les données
  personnelles y sont pseudonymisées (HMAC-SHA256) par défaut ; Silver reste en clair.
- **Abstraction LLM** (`packages/llm`) : interface de génération structurée validée par
  Pydantic, fournisseurs Anthropic / OpenAI / Ollama sélectionnés par variable
  d'environnement. Seuls le schéma et les statistiques de profiling peuvent être envoyés
  à un modèle, jamais de données brutes.

## Installation et lancement

Prérequis : [uv](https://docs.astral.sh/uv/) (il installe Python 3.12 si besoin).

```bash
git clone <url-du-depot> forja && cd forja
uv sync
uv run forja-api
```

L'API écoute sur <http://127.0.0.1:8000> ; la documentation interactive est sur
<http://127.0.0.1:8000/docs>.

Si `uv` a été installé avec `pip` et n'est pas dans le `PATH`, préfixez chaque commande
par `python -m` : `python -m uv sync`, `python -m uv run forja-api`, etc.

Avec Docker :

```bash
docker compose up --build
```

Les données sont conservées dans `./data` (monté dans le conteneur) et les sels de
pseudonymisation dans le volume Docker `forja-secrets`.

La configuration se fait par variables d'environnement préfixées par `FORJA_` ou via
un fichier `.env` (voir [`.env.example`](.env.example)).

## Parcours complet

```bash
# 1. Créer un projet
curl -X POST localhost:8000/projects -H "Content-Type: application/json" \
     -d '{"name": "Ventes"}'

# 2. Charger un fichier (remplacer <project_id>) ; recharger le même nom crée une version
curl -X POST localhost:8000/projects/<project_id>/sources \
     -F "file=@tests/fixtures/clients_v1.csv;filename=clients.csv"

# 3. Relire le profil et le plan Silver proposé, l'ajuster puis l'approuver
curl localhost:8000/sources/<source_id>/profile
curl localhost:8000/sources/<source_id>/plan
curl -X PATCH localhost:8000/sources/<source_id>/plan -H "Content-Type: application/json" \
     -d '{"columns": {"commentaire": {"included": false}}}'
curl -X POST localhost:8000/sources/<source_id>/plan/approve

# 4. Construire la couche Silver puis publier pour la BI
curl -X POST localhost:8000/projects/<project_id>/runs -H "Content-Type: application/json" \
     -d '{"type": "build_silver"}'
curl localhost:8000/runs/<run_id>          # statut et métriques
curl localhost:8000/runs/<run_id>/logs     # sortie de dbt
curl -X POST localhost:8000/projects/<project_id>/runs -H "Content-Type: application/json" \
     -d '{"type": "export"}'

# 5. Télécharger une table
curl -OJ "localhost:8000/tables/<table_id>/export?format=csv"
```

## API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | État du service |
| `POST` | `/projects` | Créer un projet (`name`, `description`, `architecture`) |
| `GET` | `/projects` | Lister les projets |
| `POST` | `/projects/{id}/sources?mode=auto\|new_source\|new_version` | Charger un fichier (multipart, champ `file`) ; une source par feuille Excel |
| `GET` | `/projects/{id}/sources` | Lister les sources, avec version courante et score qualité |
| `GET` | `/sources/{id}` | Détail d'une source |
| `POST` | `/sources/{id}/versions` | Charger explicitement une nouvelle version |
| `GET` | `/sources/{id}/versions` | Versions et dérive de schéma |
| `GET` | `/sources/{id}/profile?version=` | Rapport de profiling (dernière version par défaut) |
| `GET` | `/sources/{id}/preview?limit=100` | Aperçu des lignes Bronze |
| `GET` | `/sources/{id}/plan?version=` | Plan de transformation Silver |
| `GET` | `/sources/{id}/plans` | Historique des versions du plan |
| `PATCH` | `/sources/{id}/plan` | Modifier une règle, exclure une colonne, changer un type… (nouvelle version `draft`) |
| `POST` | `/sources/{id}/plan/approve` | Approuver la dernière version |
| `POST` | `/projects/{id}/runs` | Lancer un run `profile`, `build_silver` ou `export` |
| `GET` | `/projects/{id}/runs` | Runs du projet |
| `GET` | `/runs/{id}` | Statut et métriques d'un run |
| `GET` | `/runs/{id}/logs` | Logs d'un run (texte) |
| `GET` | `/projects/{id}/tables` | Tables Silver construites |
| `GET` | `/tables/{id}` | Détail d'une table |
| `GET` | `/tables/{id}/export?format=parquet\|csv&delimiter=;` | Export traité d'une table |

Les erreurs ont toutes la forme `{"error": {"code", "message", "details"}}` :
`404` ressource inconnue, `409` conflit (nom, plan déjà approuvé, entrepôt en cours de
construction), `413` fichier trop volumineux, `415` format non supporté, `422` fichier
vide, corrompu ou illisible, ou modification de plan invalide.

## Architecture

```
forja/
├── apps/api/          FastAPI : routes, erreurs, logs de requêtes, worker de jobs
├── packages/core/     Logique métier
│   └── forja_core/
│       ├── config.py      Configuration (variables FORJA_*)
│       ├── catalog/       Catalogue DuckDB et ses migrations
│       ├── storage.py     Arborescence du workspace local
│       ├── ingestion/     Détection, lecteurs, versions, dérive de schéma
│       ├── profiling/     Inférence de types, PII, clés, score qualité
│       ├── silver/        Plans de transformation, génération et exécution dbt
│       ├── jobs/          Modèles, exécuteur et runners de jobs
│       ├── privacy.py     Pseudonymisation, masquage
│       └── serving.py     Base serving et exports
├── packages/llm/      Interface LLMProvider et contexte sans données brutes
├── data/              Workspace local (ignoré par git)
├── tests/             Tests pytest et jeux de données générés (tests/fixtures)
└── docs/              Architecture, profiling, connexion BI, décisions
```

Voir [`docs/architecture.md`](docs/architecture.md) pour le flux Bronze → Silver →
serving, [`docs/decisions.md`](docs/decisions.md) pour les choix techniques et les
versions épinglées, [`docs/profiling.md`](docs/profiling.md) pour les règles de
profiling et [`docs/bi.md`](docs/bi.md) pour connecter un outil BI.

## Développement

```bash
uv run pytest                 # tests (dont un vrai dbt build de bout en bout)
uv run ruff check .           # lint
uv run ruff format .          # formatage
uv run mypy                   # typage strict
uv run python -m tests.fixtures.generate   # régénérer les jeux de test
```

## Licence

[Apache 2.0](LICENSE)
