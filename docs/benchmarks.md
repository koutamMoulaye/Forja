# Mesures

Chiffres de la campagne de tests de l'étape 7 (octobre 2026). Ce qu'elle a trouvé et
corrigé : [campaign-report.md](campaign-report.md). Toutes les mesures se rejouent avec
les tests cités ; `FORJA_CAMPAIGN_REPORT=<dossier>` écrit le JSON de chaque scénario.

## Environnement

| | Poste de référence | CI (GitHub Actions) |
|---|---|---|
| Processeur | Snapdragon X Plus (ARM64), 10 cœurs | 4 vCPU x64 |
| Mémoire | 31,6 Go ; Docker (WSL 2) limité à 8 Go et 6 CPU | 16 Go |
| Système | Windows 11 Famille | Ubuntu (`ubuntu-latest`) |
| Python | 3.12.15 **x64, émulé** sur ARM64 | 3.12, natif |
| Navigateur | Chrome 156 (ARM64 natif) ; Chromium de Playwright 1.64.1 (x64, émulé) | Chrome, Chromium de Playwright |
| Pile | DuckDB 2.0.0, dbt 1.12.6, dbt-duckdb 1.11.0, FastAPI 0.158.1, Node 24.19, Next.js 16.4.3, React 19.3 | identique |
| Réglages | `FORJA_DUCKDB_MEMORY_LIMIT=6GB`, `FORJA_DUCKDB_THREADS=4` | identiques |

Sur le poste de référence, l'API, DuckDB et dbt tournent en x64 émulé : les temps côté
Python y sont pessimistes. Le pic mémoire est celui du processus et de ses enfants
(dbt), échantillonné toutes les 50 ms (volumes) ou 200 ms (scénarios) ; le disque est
celui de l'espace de travail après l'étape.

## Volumes

### Fichier généré, de l'ingestion à l'export

`FORJA_VOLUME_ROWS=<n> uv run pytest -s tests/test_volume.py` : commandes générées (1 %
de doublons exacts, une colonne d'e-mails), puis profil, Silver, modèle Gold proposé sans
modèle de langage, un data mart demandé en français, export Parquet et CSV.

| Étape | 1 million (61 Mo) | 5 millions (309 Mo) |
|---|---|---|
| Ingestion vers Bronze | 2,6 s | 10,1 s |
| Profil | 2,3 s | 7,6 s |
| Pic mémoire ingestion et profil | 757 Mo | 2 792 Mo |
| Silver (dbt) | 10,5 s, pic 976 Mo | 22,5 s, pic 2 979 Mo |
| Gold | 6,8 s, pic 548 Mo | 7,2 s, pic 633 Mo |
| Data mart « Montant des commandes par ville » | 7,8 s, pic 516 Mo | 11,9 s, pic 569 Mo |
| Export Parquet et CSV | 2,4 s, pic 368 Mo | 9,2 s, pic 424 Mo |
| Disque : Bronze, entrepôt, exports, total | 35, 58, 50, 213 Mo | 176, 232, 254, 1 042 Mo |

De bout en bout : 39 s pour un million de lignes, 73 s pour cinq millions.

### Comparaison CI et poste de référence (1 million de lignes)

| Étape | CI, 4 cœurs x64 | Poste de référence, Python émulé |
|---|---|---|
| Ingestion vers Bronze | 1,4 s | 2,6 s |
| Profil | 1,1 s | 2,3 s |
| Pic mémoire ingestion et profil | 950 Mo | 757 Mo |
| Silver (dbt) | 6,9 s, pic 1 047 Mo | 10,5 s, pic 976 Mo |

Les chiffres CI sont ceux du job « Volume, one million rows » (artefact `volume-report`),
qui mesure depuis cette étape aussi Gold, le data mart et l'export. L'écart vient de
l'émulation : la CI, sur moins de cœurs, est plus rapide.

### Table PostgreSQL de 10 millions de lignes, chargée en incrémental

`FORJA_VOLUME_PG_ROWS=10000000 uv run pytest -s tests/campaign/test_volume_sources.py -k postgres`

| Étape | Durée | Pic mémoire | Espace de travail |
|---|---|---|---|
| Premier chargement (10 M lignes) | 55,8 s | 1 388 Mo | 364 Mo |
| Chargement incrémental (100 000 nouvelles lignes) | 3,5 s | 1 568 Mo | 368 Mo |
| Silver (10,1 M lignes) | 29,1 s | 4 555 Mo | 844 Mo |

Le second chargement ne lit que les lignes postérieures au curseur ; l'entrepôt pèse
475 Mo.

### Envoi d'un fichier de 2 Go, coupé deux fois

`FORJA_VOLUME_UPLOAD_MB=2048 uv run pytest -s tests/campaign/test_volume_sources.py -k upload` :
52,4 millions de lignes, morceaux de 8 Mo ; l'envoi est coupé à 30 % (au milieu d'un
morceau) puis à 70 %, et reprend là où il s'était arrêté.

| Étape | Durée | Pic mémoire | Espace de travail |
|---|---|---|---|
| Envoi, deux coupures, reprise (local, sans réseau) | 12,8 s | 293 Mo | 2 036 Mo |
| Ingestion et profil | 146,8 s | 6 070 Mo | 1 849 Mo |

L'ingestion de ce fichier atteint la limite de DuckDB (6 Go) : sur une machine de moins
de 16 Go, baisser `FORJA_DUCKDB_MEMORY_LIMIT` (DuckDB déborde alors sur disque).

## Parcours

Mesurés sur le poste de référence, machine au repos, avec `uv run pytest -m campaign`.

| Scénario | Étape | Durée |
|---|---|---|
| 1. Référence : fichier, table PostgreSQL, API | sources | 1,6 s |
| | plans, Silver, relations, Gold | 14,9 s |
| | data mart demandé par un analyst, approuvé, publié | 7,4 s |
| | chargement planifié (horloge simulée) et rafraîchissement du data mart | 22,3 s |
| 2. Accidents de la route 2024 (342 515 lignes, 4 fichiers) | ingestion et profil | 8,3 s, pic 446 Mo |
| | plans et Silver | 10,8 s, pic 696 Mo |
| | Gold | 7,8 s, pic 622 Mo |
| 3. Dérives en base | colonne supprimée : blocage | 1,3 s |
| | plan approuvé, Silver repris | 7,0 s |
| | colonne retypée : blocage, plan approuvé, reconstruction complète | 7,8 s |
| 3. Panne d'API en cours de chargement | 5xx, puis délais dépassés, puis reprise | 0,2 s, 1,8 s, 1,3 s |
| 7. Arrêt brutal de l'API | redémarrage, build interrompu marqué en échec | 5,3 s |
| | build suivant | 6,6 s |
| | redémarrage et rattrapage d'un chargement planifié manqué | 6,6 s |

Le jeu réel est la base annuelle des accidents corporels de la circulation routière 2024
du ministère de l'Intérieur ([data.gouv.fr](https://www.data.gouv.fr/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2025),
Licence Ouverte 2.0) : `caract-2024.csv`, `lieux-2024.csv`, `vehicules-2024.csv`,
`usagers-2024.csv`, 34 Mo en tout, non versionnés. Les télécharger dans un dossier, puis
`FORJA_OPEN_DATA_DIR=<dossier> uv run pytest tests/campaign/test_open_data.py`. Forja y
trouve les quatre relations (`num_acc` vers les caractéristiques, `id_vehicule` des usagers
vers les véhicules) ; scores de qualité 100, 83, 96,8 et 99,9.

## Interface

### Chargement du canvas (build de production, Chrome)

| | Première visite après connexion | Rechargement |
|---|---|---|
| Avant (squelette signalé) | jusqu'à 20 s | 3,3 à 5,0 s |
| Après | 1,5 à 1,8 s | 0,4 à 1,3 s |
| Test e2e (5 passages, seuil 5 s) | ELK à froid : 2,5 à 3,7 s | classement réutilisé : 1,6 à 3,2 s |

Le Chromium de Playwright, x64 émulé sur ce poste, met 2,1 à 5,5 s pour le même
rechargement : le test de durée tourne donc dans Chrome (projet `chrome` de
`playwright.config.ts`), les autres tests e2e dans Chromium.

### Lighthouse (préréglage desktop, Chrome, médiane de 3 passages)

| Écran | Score | LCP | TBT | CLS |
|---|---|---|---|---|
| Canvas (ingénieur) | 98 | 1,1 s | 0 ms | 0,003 |
| Accueil analyst | 90 | 1,0 s | 240 ms | 0,003 |
| Conversation avec l'agent | 99 | 1,0 s | 0 ms | 0 |
| Aperçu d'un data mart | 91 | 1,0 s | 0 ms | 0 |

### JavaScript par route

`pnpm budget` (après `pnpm build`, vérifié en CI) additionne le gzip du premier chargement
de chaque page et le compare à `apps/web/js-budget.json`.

| Routes | Mesuré | Budget |
|---|---|---|
| Écrans d'un projet (20 routes) | 394 à 433 Ko | 470 Ko |
| Page du design system | 360 Ko | 400 Ko |
| Connexion, invitation, mot de passe, accueil, projets | 252 à 259 Ko | 290 Ko |

Le canvas (React Flow) et ELK se chargent ensuite par import dynamique, hors budget.

## Modèle de langage réel

Ollama, `qwen3.5:9b` sur CPU (Snapdragon X Plus, natif ARM64), cache désactivé.

| Mesure | Résultat |
|---|---|
| Proposition Gold du parcours de référence | 386 s ; plan du modèle (`llm:ollama/qwen3.5:9b`) validé sans erreur : `fct_commande`, `dim_client`, `dim_produit` |
| Évaluation de l'agent, 5 questions représentatives | 5/5 (simple, ambiguë, deux complexes, hors périmètre) |
| Questions traitées sans modèle | 2 sur 5, en 0,9 et 2,5 s |
| Questions passées par le modèle | 3, en 128 à 146 s ; 1 588 à 1 671 tokens en entrée, 49 à 102 en sortie |
| Contexte moyen envoyé | 193 tokens (schémas, statistiques, couche sémantique : aucune valeur) |

`FORJA_CAMPAIGN_LLM_MODEL=qwen3.5:9b uv run pytest -s tests/campaign/test_real_llm.py` et
`uv run python -m tests.agent_eval --provider ollama --subset`. Sur CPU, compter deux
minutes par question qui demande le modèle ; un GPU ou un fournisseur distant les ramène à
quelques secondes.

## Limites

- Un seul poste de référence, ARM64 avec Python émulé ; la CI donne le point de
  comparaison x64.
- L'envoi de 2 Go est mesuré en local, sans réseau : le débit réel dépend de la connexion.
- Les durées des scénarios dépendent du démarrage de dbt à chaque run (3,3 s d'import au
  repos sur ce poste, bien davantage sur une machine chargée) ; elles ne mesurent pas un
  débit.
- Lighthouse audite des écrans connectés, servis par `next start` et l'API locale, sans
  limitation réseau (préréglage desktop).
