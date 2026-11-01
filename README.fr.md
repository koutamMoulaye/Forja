# Forja

[![CI](https://github.com/forjadata/forja/actions/workflows/ci.yml/badge.svg)](https://github.com/forjadata/forja/actions/workflows/ci.yml)
[![Licence Apache 2.0](https://img.shields.io/badge/licence-Apache%202.0-blue.svg)](LICENSE)

*English: [README.md](README.md)*

**Forja transforme des fichiers et des tables bruts en données propres, documentées et
prêtes pour la BI, puis laisse les équipes métier demander en français les tables dont
elles ont besoin, avec un aperçu qu'elles vérifient avant toute publication.**

Open source et *local-first* : tout tourne sur votre machine, avec ou sans modèle d'IA.
Un modèle de langage, si vous en ajoutez un, ne voit jamais les valeurs de vos données
et n'écrit jamais de SQL.

> **L'interface est en français dans la v0.1** ; l'anglais arrive dans la version
> suivante. Le code, la documentation de référence et les tickets sont en anglais.

![Le canvas du pipeline : sources, nettoyage, modèle en étoile et diffusion](docs/assets/canvas.png)

## Ce que fait Forja

- **Ingestion** de fichiers CSV, Excel, Parquet et JSON (jusqu'à 10 Go, envoi
  reprenable, lecture en flux par DuckDB), de tables PostgreSQL, MySQL/MariaDB et SQL
  Server (complètes ou incrémentales) et d'API REST paginées ; chaque chargement est une
  version, avec détection de la dérive de schéma. Chargements **planifiés** (« tous les
  jours à 6 h ») jusqu'aux data marts publiés.
- **Profilage** de chaque colonne : types (dates et décimales à la française compris),
  valeurs manquantes, clés, doublons, données personnelles (email, téléphone, IBAN,
  noms) et score qualité.
- **Nettoyage** par un plan Silver relu règle par règle (chaque règle expliquée, valeurs
  avant et après), exécuté par [dbt](https://www.getdbt.com/) ; les lignes invalides
  vont en quarantaine, rien ne disparaît en silence.
- **Modélisation** en étoile (dimensions, SCD2, faits au grain explicite), proposée par
  un modèle d'IA ou par des règles déterministes, validée puis construite par dbt.
- **Diffusion** vers Power BI, Superset ou Metabase par une base DuckDB de diffusion, ou
  en exports Parquet et CSV, données personnelles pseudonymisées.
- **Questions en français** : un analyst demande un data mart (« CA par mois et par
  ville en 2024, clients Pro »). Forja montre ce qu'il a compris, un échantillon, le SQL
  et des contrôles de réconciliation ; l'analyst corrige un terme ou valide, un engineer
  approuve, Forja publie.

![Un court parcours : le pipeline, une table de faits dans l'inspecteur, la question d'un analyst et son aperçu](docs/assets/journey.gif)

Les engineers ont le canvas du pipeline, les plans, les runs et la gouvernance ; les
analysts un accueil, l'agent, leurs data marts et le catalogue des indicateurs. Les
notifications arrivent en direct ; l'interface existe en thème clair et sombre.

## Installation en une commande

Il faut [Docker](https://docs.docker.com/get-docker/) avec Compose v2 et environ 4 Go
d'espace libre. Les images existent pour linux/amd64 et linux/arm64.

```sh
git clone https://github.com/forjadata/forja.git && cd forja
./install.sh --demo            # macOS, Linux
.\install.ps1 -Demo            # Windows (PowerShell)
```

Le script vérifie Docker et l'espace disque, télécharge les deux images signées (API et
web) depuis GitHub Container Registry, crée l'administrateur, charge le projet de démo
avec `--demo`, démarre le tout et ouvre <http://localhost:3000>. **Le mot de passe de
l'administrateur et ceux des comptes de démo ne s'affichent qu'une fois** : notez-les ;
la première connexion demande d'en choisir un nouveau. `--build` construit plutôt les
images depuis le dépôt.

```sh
docker compose up -d           # redémarrer plus tard
docker compose down            # arrêter (les données restent dans les volumes Docker)
docker compose down -v         # arrêter et supprimer toutes les données
```

Réglages, mises à jour, sauvegarde et dépannage : [démarrer](docs/getting-started.md).
Sans Docker : [docs/development.md](docs/development.md) (uv et pnpm).

## Fournisseur d'IA : local, cloud ou aucun

Forja fonctionne sans modèle d'IA : des règles déterministes proposent le modèle en
étoile et un analyseur local comprend la plupart des questions. Un modèle aide pour les
questions ambiguës et les schémas inhabituels. Il se choisit dans **Réglages ›
Fournisseur IA**, ou dans `.env` :

| Fournisseur | Réglage | Remarques |
|---|---|---|
| Aucun | `FORJA_LLM_PROVIDER=` | Par défaut. Tout reste déterministe. |
| Ollama (local, gratuit) | `FORJA_LLM_PROVIDER=ollama` | Utilise l'Ollama de votre machine (`qwen3.5:9b` par défaut). `./install.sh --ollama` le lance plutôt dans un conteneur (plusieurs Go). |
| Anthropic | `FORJA_LLM_PROVIDER=anthropic` et `ANTHROPIC_API_KEY` | |
| OpenAI | `FORJA_LLM_PROVIDER=openai`, `OPENAI_API_KEY` et `FORJA_LLM_MODEL` | |

## Garanties de confidentialité

Elles valent quel que soit le fournisseur, et des tests les vérifient :

- **Un modèle ne reçoit jamais de valeur de données.** Il voit les schémas, des
  statistiques, les relations et la couche sémantique ; jamais une ligne, un échantillon
  ou une valeur distincte. Les valeurs tapées par un utilisateur sont résolues
  localement.
- **Un modèle n'écrit jamais de SQL.** Il renvoie une spécification structurée que Forja
  valide contre la couche sémantique ; le SQL est produit par des templates.
- **Les données personnelles sont pseudonymisées hors de Silver** : base de diffusion,
  exports, aperçus et data marts utilisent HMAC-SHA256 avec un sel par projet, rangé hors
  du dossier de données. Un analyst ne les voit jamais en clair.
- **Chaque action est journalisée** (qui, quoi, quand, sur quel objet), les rôles sont
  vérifiés sur chaque route, la session tient dans des cookies httpOnly et les pages
  s'exécutent sous une Content-Security-Policy stricte. Détails dans
  [docs/security.md](docs/security.md) ; signaler une vulnérabilité :
  [SECURITY.md](SECURITY.md).

## Chiffres clés

Mesurés pendant la campagne de tests avant publication ([mesures](docs/benchmarks.md)) :

| | |
|---|---|
| Un million de lignes, du fichier au data mart exporté | environ 33 s, pic mémoire environ 1 Go |
| Cinq millions de lignes, même parcours | 73 s |
| 10 millions de lignes PostgreSQL, puis 100 000 nouvelles | 55,8 s, puis 3,5 s en incrémental |
| Envoi de 2 Go coupé deux fois, repris | 12,8 s |
| Canvas affiché après connexion (Chrome) | 1,5 à 1,8 s ; Lighthouse 98 |
| Questions à l'agent traitées sans aucun modèle | 13 sur 20, immédiatement ; sinon ~200 tokens envoyés à un modèle, aucune valeur |

Sur le processeur d'un portable, une question qui demande un modèle local de 9B prend
environ deux minutes ; un GPU ou un fournisseur cloud la ramène à quelques secondes.

## Architecture

```
 Navigateur ─► web (Next.js) ─proxy, session httpOnly─► API (FastAPI)
                    ▲   Server-Sent Events (runs, notifications)  │
                    └─────────────────────────────────────────────┤
                                                                  ▼
  fichiers, bases, API ─► Bronze (Parquet) ─► Silver ─► Gold (étoile) ─► diffusion, exports
              profilage          dbt + DuckDB, plans relus           │
                                                                     ▼
  couche sémantique ◄── issue du Gold ──► agent : analyseur d'abord, modèle d'IA
                                          optionnel (schémas seuls) ─► aperçu ─► dbt
```

Un processus porte l'API et ses workers de jobs ; DuckDB tient le catalogue de
métadonnées et l'entrepôt ; dbt exécute les transformations. Plus de détails dans
[docs/architecture.md](docs/architecture.md).

## Documentation

| | |
|---|---|
| [Démarrer](docs/getting-started.md) | Installation, réglages, mise à jour, sauvegarde |
| [Guide engineer](docs/guide-engineer.md) · [Guide analyst](docs/guide-analyst.md) | D'un fichier à un modèle publié ; demander un data mart |
| [Connecteurs](docs/connectors.md) | Bases de données, API, planification, gros volumes |
| [Architecture](docs/architecture.md) · [Décisions](docs/decisions.md) | Comment c'est construit, et pourquoi |
| [Sécurité](docs/security.md) | Comptes, rôles, sessions, CSP, pseudonymisation |
| [Agent](docs/agent.md) · [Couche sémantique](docs/semantic-layer.md) | Comment une question devient un data mart |
| [BI](docs/bi.md) · [Profilage](docs/profiling.md) | Brancher un outil BI ; règles de profilage |
| [Développement](docs/development.md) | Sans Docker, parcours par l'API, tests |
| [Mesures](docs/benchmarks.md) · [Campagne de tests](docs/campaign-report.md) | Volumes, temps, mémoire, Lighthouse ; anomalies trouvées avant l'ouverture |

Les mêmes pages en anglais sont dans [docs/en/](docs/en/).

## État du projet

Version **0.1.0**, première version publique. Une seule instance : un processus d'API,
son planificateur, son bus d'événements en mémoire et un catalogue DuckDB. Testée de
bout en bout (Python, navigateur, installation à neuf, vraies bases, vrai modèle) mais
jeune : retours et tickets bienvenus.

## Feuille de route

- **Interface en anglais** et questions en anglais à l'agent (version suivante).
- Connexion par un fournisseur d'identité (OIDC ; l'interface est prête).
- D'autres sources : stockage objet (compatible S3), d'autres bases.
- Plusieurs instances d'API (bus d'événements, planificateur et limitation partagés).
- Paquets Python publiés (`forjadata` sur PyPI).
- L'évaluation complète de l'agent sur un modèle cloud ; Python ARM64 natif sous Windows
  quand ses dépendances auront leurs roues.

## Contribuer

Tickets, questions et pull requests sont bienvenus : voir
[CONTRIBUTING.md](CONTRIBUTING.md) (en anglais) et le
[Code de conduite](CODE_OF_CONDUCT.md). Les changements sont dans le
[CHANGELOG](CHANGELOG.md).

## Licence

[Apache 2.0](LICENSE). Composants tiers et polices : [NOTICE](NOTICE) et
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Le choix des noms est expliqué
dans [docs/naming.md](docs/naming.md).
