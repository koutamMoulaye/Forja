# Forja

**Forja** est une plateforme open source de data engineering automatisée, *local-first*
et déployable en SaaS.

Vous branchez une source, Forja profile les données, propose une architecture
(Medallion par défaut), génère et exécute les transformations, puis livre des datasets
propres, exportables et connectables à votre outil BI. À terme, un agent permettra aux
équipes métier de demander un data mart en langage naturel, avec un aperçu de
vérification avant publication.

> **État actuel : étape 1.** Socle du dépôt, ingestion de fichiers vers la couche Bronze
> et profiling automatique. La génération Silver/Gold (dbt) arrive à l'étape 2.

## Fonctionnalités

- **Projets** : espaces de travail isolés (`data/<project_id>/{bronze,silver,gold}`),
  enregistrés dans un catalogue de métadonnées DuckDB (`data/forja_meta.duckdb`).
- **Ingestion** de CSV, Excel (`.xlsx`, toutes les feuilles), Parquet et JSON / JSON Lines :
  - détection automatique de l'encodage (BOM, UTF-8, puis détection statistique) et du
    séparateur CSV (`,` `;` tabulation `|`) ;
  - écriture brute en Parquet avec les colonnes techniques `_ingested_at`,
    `_source_file` et `_row_hash` (SHA-256 des valeurs de la ligne) ;
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

Avec Docker :

```bash
docker compose up --build
```

Les données sont conservées dans `./data` (monté dans le conteneur).

La configuration se fait par variables d'environnement préfixées par `FORJA_` ou via
un fichier `.env` (voir [`.env.example`](.env.example)).

## Exemple

```bash
# Créer un projet
curl -X POST localhost:8000/projects -H "Content-Type: application/json" \
     -d '{"name": "Ventes"}'

# Charger un fichier (remplacer <project_id>)
curl -X POST localhost:8000/projects/<project_id>/sources \
     -F "file=@tests/fixtures/clients_fr_sale.csv"

# Consulter le profil et un aperçu (remplacer <source_id>)
curl localhost:8000/sources/<source_id>/profile
curl "localhost:8000/sources/<source_id>/preview?limit=20"
```

## API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | État du service |
| `POST` | `/projects` | Créer un projet (`name`, `description`, `architecture`) |
| `GET` | `/projects` | Lister les projets |
| `POST` | `/projects/{id}/sources` | Charger un fichier (multipart, champ `file`) ; renvoie une source par feuille Excel |
| `GET` | `/projects/{id}/sources` | Lister les sources d'un projet, avec leur score qualité |
| `GET` | `/sources/{id}/profile` | Rapport de profiling complet |
| `GET` | `/sources/{id}/preview?limit=100` | Aperçu des lignes Bronze |

Les erreurs ont toutes la forme `{"error": {"code", "message", "details"}}` :
`404` ressource inconnue, `409` conflit de nom, `413` fichier trop volumineux,
`415` format non supporté, `422` fichier vide, corrompu ou illisible.

## Architecture

```
forja/
├── apps/api/          FastAPI : routes, gestion des erreurs, logs de requêtes
├── packages/core/     Logique métier
│   └── forja_core/
│       ├── config.py      Configuration (variables FORJA_*)
│       ├── catalog.py     Catalogue de métadonnées DuckDB
│       ├── storage.py     Arborescence du workspace local
│       ├── ingestion/     Détection, lecteurs de fichiers, écriture Bronze
│       ├── profiling/     Inférence de types, PII, clés, score qualité
│       └── preview.py     Lecture d'aperçus
├── packages/llm/      Interface LLMProvider et contexte sans données brutes
├── data/              Workspace local (ignoré par git)
├── tests/             Tests pytest et jeux de données générés (tests/fixtures)
└── docs/              Documentation détaillée
```

Voir [`docs/architecture.md`](docs/architecture.md) pour les choix techniques et
[`docs/profiling.md`](docs/profiling.md) pour le détail des règles de profiling et du
score qualité.

## Développement

```bash
uv run pytest                 # tests
uv run ruff check .           # lint
uv run ruff format .          # formatage
uv run mypy                   # typage strict
uv run python -m tests.fixtures.generate   # régénérer les jeux de test
```

## Licence

[Apache 2.0](LICENSE)
