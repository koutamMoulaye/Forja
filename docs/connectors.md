# Connecteurs, chargements planifiés et gros volumes

Une source Forja peut venir d'un fichier, d'une base de données ou d'une API REST. Une
table ou un endpoint chargé devient une source comme une autre : versions, dérive de
schéma, profil, plan Silver, puis Gold et diffusion. Les choix techniques sont expliqués
dans [decisions.md](decisions.md) (D28 à D32).

## Ajouter une source

**Sources → Ajouter une source** propose trois chemins :

| Choix | Assistant |
|---|---|
| Fichier | CSV, Excel, Parquet, JSON, jusqu'à 10 Go ; au-delà de 8 Mo, envoi par morceaux reprenable |
| Base de données | Connexion → Test → Tables (mode complet ou incrémental) → Planification |
| API | Connexion → Test → Endpoint (pagination, incrémental) → Aperçu → Planification |

L'écran **Sources → Connexions** liste les connexions : état (active, chargement en
cours, injoignable, jamais chargée), dernier et prochain chargement, sources alimentées
et leur mode ; on y lance un chargement, change la planification, teste ou supprime une
connexion (ses sources restent, avec leurs versions). Sur le canvas, une source chargée
depuis une base ou une API porte l'icône de son connecteur, et l'inspecteur donne son
prochain chargement.

Réservé aux rôles **admin** et **engineer** (`connection.manage`). Chaque action est
journalisée (`connection.*`, `schedule.*`), sans identifiant ni valeur.

## Bases de données

| Base | Pilote | Port par défaut |
|---|---|---|
| PostgreSQL | psycopg 3 | 5432 |
| MySQL, MariaDB | PyMySQL | 3306 |
| SQL Server | pymssql | 1433 |

- **Compte** : utilisez un compte en lecture seule, limité aux tables à charger. Forja
  ne fait que lire, ouvre ses sessions en lecture seule quand la base le permet
  (PostgreSQL, MySQL), et le test de connexion signale un compte qui peut écrire.
- **Exploration** : schémas, tables et vues, colonnes avec leur type dans la base et leur
  type Bronze, nombre de lignes estimé (statistiques de la base), clé primaire, colonnes
  curseur proposées.
- **Modes** : *complet* relit toute la table à chaque chargement (une nouvelle version,
  les nouvelles lignes comptées par `_row_hash`) ; *incrémental* ne lit que les lignes
  dont la colonne curseur dépasse la plus grande valeur du chargement précédent. Une date
  de modification reprend ajouts et modifications ; une date de création ou un
  identifiant croissant, les ajouts seulement. Un chargement sans nouvelle ligne ne crée
  pas de version.
- **Lecture** : par lots de 50 000 lignes (`FORJA_CONNECTOR_BATCH_ROWS`) avec un curseur
  côté serveur, écrits en Parquet au fil de l'eau ; la progression (lignes, lots)
  s'affiche dans le run.

Correspondance des types : voir D28.

## API REST

| Réglage | Options |
|---|---|
| Authentification | aucune, clé (en-tête ou paramètre), jeton Bearer, Basic, OAuth2 client credentials |
| Pagination | aucune, numéro de page, décalage et limite, curseur (chemin du curseur suivant), en-tête `Link`, URL suivante (chemin dans la réponse) |
| Enregistrements | chemin `a.b` dans la réponse, détecté s'il est vide (`data`, `items`, `results`…) |
| Incrémental | paramètre envoyé (`since`) et champ des enregistrements dont la plus grande valeur est retenue (`updated_at`), valeur de départ |
| Robustesse | limite de débit (appels par seconde), nouvelles tentatives sur 429 et 5xx avec backoff exponentiel, `Retry-After` respecté, délai de 30 s |

- **Aperçu** : la première page, aplatie, avant d'enregistrer : chemin détecté, nombre
  d'enregistrements, page suivante, tables enfants et relations proposées.
- **JSON imbriqué** : objets → colonnes `client.ville` ; listes → tables enfants
  `endpoint__liste`, liées par `endpoint_id` (ou `_forja_key`) avec `_position`.
- **Adresses privées** : refusées par défaut (protection SSRF). L'administrateur de
  l'instance autorise des hôtes, IP ou plages CIDR dans **Réglages → Connecteurs** ou par
  `FORJA_CONNECTOR_ALLOWED_HOSTS='["crm.interne", "10.0.0.0/8"]'`.

## Planification

Par connexion (toutes ses sources) ou par source chargée depuis une connexion. Saisie en
français, interprétée en direct avec les trois prochaines exécutions :

| Saisie | Signification |
|---|---|
| `manuel` | chargements à la main |
| `toutes les heures`, `toutes les heures à la minute 15` | chaque heure |
| `toutes les 15 minutes`, `toutes les 2 heures` | intervalle régulier |
| `tous les jours à 6 h`, `chaque jour à 6h30`, `à midi` | quotidien |
| `du lundi au vendredi à 7h30`, `en semaine à 18:45`, `le week-end à 10h` | jours choisis |
| `chaque lundi et jeudi à 8 h`, `hebdomadaire` | hebdomadaire |
| `le 1er de chaque mois à 5 h` | mensuel |
| `0 6 * * 1-5` | expression cron à cinq champs |

Un chargement planifié enchaîne extraction → profil → Silver → Gold → data marts publiés
→ serving, avec les plans approuvés (jamais modifiés). Le planificateur tourne dans le
processus de l'API : **une seule instance d'API** (D31). Fuseau : `FORJA_TIMEZONE`.

## Gros volumes

| Réglage | Défaut | Rôle |
|---|---|---|
| `FORJA_MAX_UPLOAD_MB` | 10240 | taille maximale d'un fichier |
| `FORJA_UPLOAD_CHUNK_MB` | 8 | taille d'un morceau d'envoi |
| `FORJA_UPLOAD_SESSION_HOURS` | 48 | durée de vie d'un envoi inachevé |
| `FORJA_DUCKDB_MEMORY_LIMIT` | 6GB | mémoire de DuckDB avant débordement sur disque |
| `FORJA_DUCKDB_THREADS` | 4 | threads de DuckDB |
| `FORJA_DUCKDB_TEMP_DIRECTORY` | `<data_dir>/_tmp` | dossier de débordement |
| `FORJA_PROFILING_FULL_SCAN_ROWS` | 1000000 | au-delà, statistiques fines sur échantillon |
| `FORJA_PROFILING_SAMPLE_ROWS` | 200000 | taille de l'échantillon |

### Mesures

<!-- volume -->
