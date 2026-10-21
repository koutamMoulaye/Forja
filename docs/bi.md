# Connexion d'un outil BI

Forja publie les tables Silver d'un projet dans une base DuckDB dédiée à la lecture :

```
data/<project_id>/serving/<nom_du_projet>.duckdb
```

Elle est (re)construite par un run `export` (`POST /projects/{id}/runs` avec
`{"type": "export"}`), qui écrit aussi des fichiers Parquet et CSV dans
`data/<project_id>/exports/`.

## Ce que contient la base

| Table | Contenu |
|---|---|
| `<source>` (ex. `clients`) | Lignes valides de la table Silver `stg_<source>`, sans les colonnes techniques `_…` |
| `_forja_tables` | Une ligne par table publiée : source, version du plan, nombre de lignes, colonnes traitées, date de publication |

Les données personnelles détectées sont traitées selon le plan de chaque source
(par défaut **pseudonymisation HMAC-SHA256**, sinon masquage partiel ou suppression) ;
la couche Silver interne reste en clair. Un même email donne le même pseudonyme dans
toutes les tables d'un projet : les jointures restent possibles.

Les lignes en quarantaine (`stg_<source>__rejects`) ne sont pas publiées.

## Règles d'utilisation

- **Toujours ouvrir le fichier en lecture seule.** DuckDB n'accepte qu'un processus
  écrivain ; plusieurs lecteurs en lecture seule peuvent travailler en même temps.
- **Rafraîchissement** : chaque run `export` reconstruit la base dans un fichier
  temporaire puis le substitue d'un bloc ; un outil ne lit jamais un fichier à moitié
  écrit. Sous Windows, si un outil garde le fichier ouvert, la substitution échoue et
  le run se termine en erreur `serving_in_use` : fermez la connexion (ou planifiez le
  rafraîchissement BI après l'export) et relancez.
- **Version de DuckDB** : Forja écrit le fichier avec DuckDB 2.0 (voir
  [decisions.md](decisions.md)). Utilisez un pilote ou un moteur DuckDB de même version
  ou plus récent : une version antérieure peut refuser un format de stockage plus récent.

## Power BI (pilote ODBC DuckDB)

1. Installer le pilote **DuckDB ODBC** pour Windows x64 depuis la page de
   téléchargement officielle de DuckDB, dans une version 2.0 ou supérieure.
2. Ouvrir *Sources de données ODBC (64 bits)* → *DSN utilisateur* → *Ajouter* →
   *DuckDB Driver*, puis renseigner :
   - **Database** : chemin complet du fichier, par exemple
     `C:\forja\data\<project_id>\serving\ventes.duckdb` ;
   - l'option `access_mode=READ_ONLY`.

   Équivalent en chaîne de connexion :

   ```
   Driver={DuckDB Driver};Database=C:\forja\data\<project_id>\serving\ventes.duckdb;access_mode=READ_ONLY
   ```
3. Dans Power BI Desktop : *Obtenir des données* → *ODBC* → choisir le DSN, puis
   sélectionner les tables. Le mode **Importation** est recommandé.
4. Pour un rafraîchissement planifié dans le service Power BI, la passerelle de
   données locale doit avoir accès au fichier et au pilote ODBC.

Alternative sans pilote : le connecteur *Parquet* de Power BI sur les fichiers de
`data/<project_id>/exports/`.

## Superset

1. Ajouter le dialecte SQLAlchemy de DuckDB à l'image Superset :
   `pip install duckdb-engine` (avec un paquet `duckdb` en version 2.0 ou plus).
2. Rendre le fichier accessible au conteneur, en lecture seule, par exemple :

   ```yaml
   services:
     superset:
       volumes:
         - ./data/<project_id>/serving:/forja/serving:ro
   ```
3. *Settings* → *Database Connections* → *+ Database* → *Other*, avec l'URI :

   ```
   duckdb:////forja/serving/ventes.duckdb?access_mode=read_only
   ```

## Metabase

1. Déposer le pilote communautaire DuckDB pour Metabase (projet
   `metabase_duckdb_driver` publié par MotherDuck) dans le dossier `plugins/` de
   Metabase, puis redémarrer Metabase.
2. Monter le dossier `serving` en lecture seule dans le conteneur Metabase, comme
   pour Superset.
3. *Admin* → *Databases* → *Add database* → *DuckDB* :
   - **Database file** : `/forja/serving/ventes.duckdb` ;
   - activer l'option de connexion en lecture seule (*read only*).

## Fichiers d'export

`GET /tables/{table_id}/export?format=parquet|csv` télécharge une table Silver
traitée de la même façon que la base serving. Le CSV est encodé en UTF-8, avec un
en-tête et le séparateur `;` par défaut (paramètre `delimiter`, ou
`FORJA_EXPORT_CSV_DELIMITER`).
