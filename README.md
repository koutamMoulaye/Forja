# Forja

[![CI](https://github.com/koutamMoulaye/Forja/actions/workflows/ci.yml/badge.svg)](https://github.com/koutamMoulaye/Forja/actions/workflows/ci.yml)

**Forja** est une plateforme open source de data engineering automatisée, *local-first*
et déployable en SaaS.

Vous branchez une source, Forja profile les données, propose une architecture
(Medallion par défaut), génère et exécute les transformations, puis livre des datasets
propres, exportables et connectables à votre outil BI. Les équipes métier demandent
ensuite un data mart en français à un agent, qui montre ce qu'il a compris avec un
aperçu de vérification avant publication.

> **État actuel : étape 4.** Ingestion versionnée vers Bronze, profiling, plans Silver
> relus puis exécutés par dbt, relations entre sources, modèle en étoile Gold proposé par
> un LLM ou par des règles, construit par dbt (SCD2 compris), publié pour la BI avec
> pseudonymisation ; authentification et rôles par projet, couche sémantique, agent
> métier. Le front arrive à l'étape 5.

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
- **Relations entre sources** détectées localement (inclusion des valeurs, noms
  `client_id` / `id_client` / `customer_id`, types, cardinalité), avec score de confiance
  et explication, à confirmer ou rejeter ; ajout manuel possible.
- **Modèle Gold en étoile** : dimensions (clé de substitution, SCD1 ou SCD2), faits (grain
  explicite, clés étrangères, mesures), dimension date générée. Proposé par le LLM
  configuré ou, sans LLM, par des règles déterministes ; validé (grain, relations
  confirmées, dimensions orphelines, fan-out), versionné et approuvé comme les plans
  Silver. Compilé en modèles dbt `dim_*` / `fct_*` / `dim_date` et snapshots SCD2, avec
  membre « inconnu » (-1) pour les clés orphelines.
- **Fournisseurs LLM** Anthropic, OpenAI et Ollama : sortie structurée validée, retries,
  journal des appels sans données. Ils ne reçoivent que schémas, statistiques et
  relations, jamais une valeur de ligne.
- **Moteur de jobs** (`profile`, `build_silver`, `build_gold`, `export`) exécuté en tâche de fond, avec
  logs et métriques : lignes lues, valides, rejetées, doublons retirés, durée, résultats
  des tests dbt.
- **Authentification et rôles** ([docs/security.md](docs/security.md)) : mode `local`
  (un administrateur, mot de passe initial affiché une fois dans les logs et à changer)
  ou `multi` (invitations) ; mots de passe argon2, jetons JWT courts et refresh tokens
  rotatifs, clés API personnelles ; rôles `admin`, `engineer`, `analyst` par projet sur
  toutes les routes ; journal d'audit.
- **Couche sémantique** ([docs/semantic-layer.md](docs/semantic-layer.md)) générée depuis
  le Gold appliqué : métriques en français avec formule, additivité, unité et synonymes
  (valeurs non additives en ratios : `prix_moyen = sum(montant) / sum(quantite)`),
  dimensions, attributs et hiérarchies ; versionnée, éditable sans perte à la
  régénération.
- **Agent métier** ([docs/agent.md](docs/agent.md)) : « CA et nombre de commandes par
  mois et par ville en 2024, clients segment Pro » → présélection locale de la couche
  sémantique (~200 tokens), parseur sans LLM pour les demandes simples, LLM sinon (sans
  aucune valeur de données), question en retour plutôt qu'une supposition, SQL écrit par
  des templates, aperçu de vérification (résumé, échantillon pseudonymisé, SQL,
  contrôles de réconciliation), validation, approbation optionnelle et publication en
  modèle dbt `mart_<nom>`.
- **Jobs LLM** : propositions Gold et demandes à l'agent en tâche de fond, annulables,
  reprises après interruption, réponses en cache, tokens et durées mesurés.
- **Publication** : base DuckDB `data/<project_id>/serving/<projet>.duckdb` pour Power BI,
  Superset ou Metabase ([docs/bi.md](docs/bi.md)), exports Parquet / CSV. Tables Gold
  publiées par défaut, Silver sur demande. Les données personnelles y sont
  pseudonymisées (HMAC-SHA256) par défaut ; Silver et Gold internes restent en clair.

## Démo en une commande

```bash
uv sync
uv run forja demo        # API arrêtée : un seul processus sur le catalogue DuckDB
uv run forja-api
```

`forja demo` crée (ou complète) le projet « Démo e-commerce » : fixture e-commerce
chargée, Silver construit, relations confirmées, modèle Gold heuristique approuvé et
construit, couche sémantique, deux data marts publiés par l'analyst, et deux comptes :
`ingenieur@demo.forja.local` (engineer) et `analyste@demo.forja.local` (analyst). Leurs
mots de passe ne sont affichés qu'une fois, dans le terminal ; `--reset-passwords` en
génère de nouveaux. La commande est idempotente : relancée, elle ne refait rien.

## Installation et lancement

Prérequis : [uv](https://docs.astral.sh/uv/) (il installe Python 3.12 si besoin).

```bash
git clone <url-du-depot> forja && cd forja
uv sync
uv run forja-api
```

L'API écoute sur <http://127.0.0.1:8000> ; la documentation interactive est sur
<http://127.0.0.1:8000/docs>.

**Premier démarrage.** Forja crée l'administrateur `admin@forja.local` et écrit son mot
de passe initial **une seule fois** dans les logs (`bootstrap_admin_created`). Connectez-
vous, changez-le, puis utilisez le jeton d'accès :

```bash
curl -X POST localhost:8000/auth/login -H "Content-Type: application/json" \
     -d '{"email": "admin@forja.local", "password": "<mot de passe des logs>"}'
curl -X POST localhost:8000/auth/password -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{"current_password": "<mot de passe des logs>", "new_password": "<nouveau>"}'
export TOKEN=<access_token de la réponse>
```

Les exemples ci-dessous supposent `-H "Authorization: Bearer $TOKEN"` sur chaque
commande (omis pour la lisibilité). Pour un script, créez plutôt une clé API personnelle
(`POST /auth/api-keys`, en-tête `X-API-Key`).

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

# 4. Construire la couche Silver (les relations sont détectées à la fin)
curl -X POST localhost:8000/projects/<project_id>/runs -H "Content-Type: application/json" \
     -d '{"type": "build_silver"}'
curl localhost:8000/runs/<run_id>          # statut et métriques
curl localhost:8000/runs/<run_id>/logs     # sortie de dbt

# 5. Revoir les relations, puis proposer (run en tâche de fond) et approuver le Gold
curl localhost:8000/projects/<project_id>/relations
curl -X POST localhost:8000/relations/<relation_id>/confirm
curl -X POST localhost:8000/projects/<project_id>/gold-plan/propose \
     -H "Content-Type: application/json" -d '{}'          # -> run, suivre GET /runs/<id>
curl localhost:8000/projects/<project_id>/gold-plan
curl -X POST localhost:8000/projects/<project_id>/gold-plan/approve

# 6. Construire le Gold, puis publier pour la BI
curl -X POST localhost:8000/projects/<project_id>/runs -H "Content-Type: application/json" \
     -d '{"type": "build_gold"}'
curl -X POST localhost:8000/projects/<project_id>/runs -H "Content-Type: application/json" \
     -d '{"type": "export"}'

# 7. Prévisualiser ou télécharger une table (données personnelles traitées)
curl "localhost:8000/tables/<table_id>/preview?limit=20"
curl -OJ "localhost:8000/tables/<table_id>/export?format=csv"

# 8. Demander un data mart à l'agent, vérifier l'aperçu, valider
curl -X POST localhost:8000/projects/<project_id>/mart-requests \
     -H "Content-Type: application/json" \
     -d '{"question": "Chiffre d'"'"'affaires par mois et par ville en 2024"}'
curl localhost:8000/mart-requests/<mart_id>        # résumé, aperçu, SQL, contrôles
curl -X POST localhost:8000/mart-requests/<mart_id>/refine \
     -H "Content-Type: application/json" -d '{"instruction": "seulement le T1"}'
curl -X POST localhost:8000/mart-requests/<mart_id>/validate   # publie mart_<nom>
```

Pour que le modèle Gold soit proposé par un LLM, définissez `FORJA_LLM_PROVIDER`
(`anthropic`, `openai` ou `ollama`) et la clé correspondante ; sinon des règles
déterministes le proposent.

## Utiliser un LLM local gratuit (Ollama)

[Ollama](https://ollama.com) fait tourner un modèle sur votre machine : aucune clé, aucun
coût, et rien ne sort du poste (Forja n'envoie de toute façon que schémas, statistiques
et relations, jamais de valeurs).

1. **Installer Ollama** : `winget install Ollama.Ollama` sous Windows (x64 et ARM64), ou
   l'installateur de [ollama.com/download](https://ollama.com/download) pour Windows,
   macOS et Linux. Le serveur démarre tout seul et écoute sur `http://localhost:11434`
   (`curl localhost:11434/api/version` pour vérifier).
2. **Télécharger un modèle** adapté à la machine :

   | Machine | Modèle conseillé | Taille |
   |---|---|---|
   | 8 Go de RAM, sans GPU | `qwen3.5:4b` | ~3,5 Go |
   | 16 à 32 Go de RAM, sans GPU dédié | `qwen3.5:9b` (défaut de Forja) | ~6,6 Go |
   | GPU de 24 Go de VRAM ou plus, ou 64 Go de mémoire unifiée | `qwen3.5:27b` | ~17 Go |

   ```bash
   ollama pull qwen3.5:9b
   ```
3. **Configurer Forja** dans `.env` :

   ```bash
   FORJA_LLM_PROVIDER=ollama
   FORJA_LLM_MODEL=qwen3.5:9b
   FORJA_LLM_OLLAMA_BASE_URL=http://localhost:11434
   ```

   Le délai par appel est de 30 min par défaut avec Ollama (`FORJA_LLM_TIMEOUT_SECONDS`).
   `FORJA_LLM_OLLAMA_NUM_CTX` (16 384 par défaut) fixe la fenêtre de contexte : Ollama
   tronque sans prévenir un prompt plus long. Le raisonnement des modèles « thinking »
   est désactivé (`FORJA_LLM_OLLAMA_THINK=false`), car il multiplie le temps de réponse
   sur CPU.
4. **Vérifier** : `python -m uv run pytest tests/test_llm.py` exécute alors aussi le test
   réel Ollama.

Ordre de grandeur sur un portable sans GPU (Snapdragon X Plus, 32 Go, `qwen3.5:9b`) :
~15 s pour une petite réponse JSON, 6 à 9 min pour proposer le modèle Gold du jeu
e-commerce (3 à 4 min quand le prompt est déjà en cache) ; un GPU réduit nettement ces
temps. Si la proposition du modèle reste invalide après correction, Forja retombe
sur ses règles déterministes : le résultat est toujours un plan valide.

## API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | État du service (public) |
| `POST` | `/auth/login` · `/auth/refresh` · `/auth/logout` | Jetons d'accès et de rafraîchissement |
| `POST` | `/auth/password` · `GET` `/auth/me` | Mot de passe, utilisateur et rôles |
| `GET` `POST` `DELETE` | `/auth/api-keys[/{id}]` | Clés API personnelles |
| `POST` | `/auth/register` | Créer son compte depuis une invitation (mode `multi`) |
| `POST` | `/projects` | Créer un projet (administrateur de l'instance) |
| `GET` | `/projects` | Projets dont on est membre |
| `GET` `PUT` `DELETE` | `/projects/{id}/members[/{user_id}]` | Membres et rôles |
| `POST` `GET` | `/projects/{id}/invitations` | Inviter par email (mode `multi`) |
| `GET` | `/projects/{id}/audit` · `/audit` | Journal d'audit |
| `POST` | `/projects/{id}/sources?mode=auto\|new_source\|new_version` | Charger un fichier (multipart, champ `file`) ; une source par feuille Excel |
| `GET` | `/projects/{id}/sources` | Lister les sources, avec version courante et score qualité |
| `GET` | `/sources/{id}` | Détail d'une source |
| `POST` | `/sources/{id}/versions` | Charger explicitement une nouvelle version |
| `GET` | `/sources/{id}/versions` | Versions et dérive de schéma |
| `GET` | `/sources/{id}/profile?version=` | Rapport de profiling (dernière version par défaut) |
| `GET` | `/sources/{id}/preview?limit=100` | Aperçu des lignes Bronze (désactivé par défaut, `FORJA_ALLOW_BRONZE_PREVIEW`) |
| `GET` | `/sources/{id}/plan?version=` | Plan de transformation Silver |
| `GET` | `/sources/{id}/plans` | Historique des versions du plan |
| `PATCH` | `/sources/{id}/plan` | Modifier une règle, exclure une colonne, changer un type… (nouvelle version `draft`) |
| `POST` | `/sources/{id}/plan/approve` | Approuver la dernière version |
| `GET` | `/projects/{id}/relations?status=` | Relations entre sources |
| `POST` | `/projects/{id}/relations/detect` | Relancer la détection |
| `POST` | `/projects/{id}/relations` | Déclarer une relation manuellement |
| `POST` | `/relations/{id}/confirm` · `/relations/{id}/reject` | Revue d'une relation |
| `POST` | `/projects/{id}/gold-plan/propose` | Proposer un modèle Gold (LLM ou règles) : run `gold_proposal` |
| `GET` | `/projects/{id}/gold-plan?version=` · `/projects/{id}/gold-plans` | Plan Gold et historique |
| `PATCH` | `/projects/{id}/gold-plan` | Modifier le plan Gold (nouvelle version `draft`) |
| `POST` | `/projects/{id}/gold-plan/approve` | Approuver (refusé tant qu'il reste des erreurs) |
| `POST` | `/projects/{id}/runs` | Lancer un run `profile`, `build_silver`, `build_gold` ou `export` |
| `GET` | `/projects/{id}/runs` | Runs du projet |
| `GET` | `/runs/{id}` | Statut et métriques d'un run |
| `GET` | `/runs/{id}/logs` | Logs d'un run (texte) |
| `POST` | `/runs/{id}/cancel` | Annuler un run en file, ou un run LLM en cours |
| `GET` | `/projects/{id}/tables` | Tables Silver et Gold construites |
| `GET` | `/tables/{id}` | Détail d'une table |
| `PATCH` | `/tables/{id}` | Publier ou retirer une table du serving (`{"publish": true}`) |
| `GET` | `/tables/{id}/preview?limit=100` | Aperçu traité (pseudonymisation) |
| `GET` | `/tables/{id}/export?format=parquet\|csv&delimiter=;` | Export traité d'une table |
| `GET` `PATCH` | `/projects/{id}/semantic-layer` | Couche sémantique ; éditions (engineer) |
| `POST` | `/projects/{id}/semantic-layer/regenerate` | Régénérer depuis le Gold appliqué |
| `POST` `GET` | `/projects/{id}/semantic-layer/synonym-proposals` | Proposer un synonyme |
| `POST` | `/synonym-proposals/{id}/accept` · `/reject` | Revue d'un synonyme (engineer) |
| `POST` `GET` | `/projects/{id}/mart-requests` | Demander un data mart en français |
| `GET` | `/mart-requests/{id}` | Versions, question en retour, aperçu, SQL, contrôles |
| `POST` | `/mart-requests/{id}/answer` · `/refine` · `/validate` | Répondre, affiner, valider (auteur) |
| `POST` | `/mart-requests/{id}/approve` · `/reject` | Approuver (engineer) ou rejeter |

Les erreurs ont toutes la forme `{"error": {"code", "message", "details"}}` :
`401` authentification absente ou invalide, `403` rôle insuffisant ou mot de passe initial
à changer, `404` ressource inconnue, `409` conflit (nom, plan déjà approuvé, entrepôt en cours de
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
│       ├── relations/     Détection et revue des relations entre sources
│       ├── gold/          Plans Gold, validation, heuristique, génération dbt Gold
│       ├── jobs/          Modèles, exécuteur, runners et portée (annulation) des jobs
│       ├── auth/          Utilisateurs, rôles, jetons, clés API, audit, interface OIDC
│       ├── semantic/      Couche sémantique : génération, éditions, normalisation FR
│       ├── agent/         Agent métier : présélection, parseur, validation, SQL, aperçu
│       ├── privacy.py     Pseudonymisation, masquage
│       └── serving.py     Base serving et exports
├── packages/llm/      Fournisseurs LLM, cache, contexte sans données brutes, proposeur
│                      Gold, interprète de l'agent
├── data/              Workspace local (ignoré par git)
├── tests/             Tests pytest, jeux de données générés (tests/fixtures) et
│                      évaluation de l'agent (tests/agent_eval)
└── docs/              Architecture, profiling, connexion BI, décisions
```

Voir [`docs/architecture.md`](docs/architecture.md) pour le flux Bronze → Silver →
serving, [`docs/decisions.md`](docs/decisions.md) pour les choix techniques et les
versions épinglées, [`docs/profiling.md`](docs/profiling.md) pour les règles de
profiling, [`docs/bi.md`](docs/bi.md) pour connecter un outil BI,
[`docs/security.md`](docs/security.md) pour l'authentification et les rôles,
[`docs/semantic-layer.md`](docs/semantic-layer.md) et [`docs/agent.md`](docs/agent.md)
pour la couche sémantique et l'agent métier.

## Développement

```bash
uv run pytest                 # tests (dont de vrais dbt build de bout en bout ; les
                              # tests LLM réels sont ignorés sans clé ni Ollama)
uv run ruff check .           # lint
uv run ruff format .          # formatage
uv run mypy                   # typage strict
uv run python -m tests.fixtures.generate    # régénérer les jeux de test
uv run python -m tests.fixtures.ecommerce   # régénérer le jeu e-commerce
uv run forja openapi                        # régénérer docs/openapi.json (front)
uv run forja openapi --record-examples      # réenregistrer les exemples de réponse
uv run python -m tests.agent_eval           # évaluer l'agent (modèle simulé)
uv run python -m tests.agent_eval --provider ollama --subset   # 5 questions, Ollama
```

## Licence

[Apache 2.0](LICENSE)
