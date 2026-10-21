# Architecture

## Principes

- **Local-first** : tout fonctionne sur un poste, sans service externe. DuckDB sert à la
  fois de moteur de calcul et de catalogue ; les données sont stockées en Parquet.
- **Même code en SaaS** : le cœur (`forja_core`) ne dépend ni de FastAPI ni d'un
  système de fichiers particulier au-delà de `Workspace`, qui pourra être remplacé par un
  stockage objet.
- **Confidentialité par construction** : rien de ce qu'un modèle de langage reçoit ne
  peut contenir une valeur de cellule (voir plus bas).

## Monorepo

Un workspace uv regroupe trois paquets :

| Paquet | Import | Rôle |
|---|---|---|
| `packages/core` | `forja_core` | Projets, catalogue, ingestion, profiling, stockage, configuration |
| `packages/llm` | `forja_llm` | Interface `LLMProvider`, sélection du fournisseur, contexte sûr |
| `apps/api` | `forja_api` | API HTTP FastAPI |

`dbt-core` et `dbt-duckdb` sont déjà déclarés dans `forja-core` pour l'étape 2.

## Flux d'ingestion

```
upload multipart ──► _staging/ (taille limitée) ──► detect_format
                                                         │
             ┌───────────────┬───────────────┬───────────┴──┐
           CSV            Excel          Parquet          JSON
   encodage + séparateur  1 table/feuille  lecture Arrow   tableau, objet ou JSON Lines
             └───────────────┴───────┬───────┴──────────────┘
                                     ▼
                     normalisation des en-têtes
          (vides, réservés, doublons insensibles à la casse)
                                     ▼
         + _ingested_at, _source_file, _row_hash ──► Parquet zstd
           data/<project_id>/bronze/<source>/<horodatage>_<fichier>.parquet
                                     ▼
                catalogue : source + schéma ──► profiling ──► catalogue : rapport
```

Choix notables :

- **Bronze = brut.** Les CSV sont stockés en texte : l'interprétation des types relève du
  profiling puis de la couche Silver. Excel, Parquet et JSON gardent leurs types natifs
  quand une colonne est homogène, sinon la colonne passe en texte.
- **Une source par chargement.** Recharger un même fichier crée une nouvelle source
  (`clients`, `clients_2`…). La gestion de versions / l'append sur une source existante
  est à trancher à l'étape 2.
- **JSON imbriqué** : les objets sont aplatis avec des noms pointés (`user.email`), les
  listes sont conservées en texte JSON.
- **`_row_hash`** : SHA-256 du JSON canonique des valeurs de la ligne, hors colonnes
  techniques. Deux lignes identiques ont le même hash, ce qui sert à détecter les
  doublons et servira à l'incrémental.

## Catalogue

`forja_meta.duckdb` contient trois tables : `projects`, `sources` (schéma en JSON,
avertissements, chemin Bronze relatif au workspace) et `profiles` (rapport JSON complet
et score qualité). DuckDB n'autorisant qu'un processus écrivain, l'API possède une seule
connexion protégée par un verrou.

## Contexte envoyé aux LLM

`forja_llm.context.build_safe_context` est le seul moyen de construire ce qu'un
fournisseur reçoit, et `LLMProvider.generate` n'accepte qu'un `LLMSafeContext`.

- Les modèles sont `extra="forbid"` et immuables : aucun champ ne peut être ajouté.
- Les seuls champs texte sont des identifiants (noms de projet, source, colonne), des
  types et des formats de date issus d'une liste fermée.
- Les top valeurs, min/max texte et lignes d'exemple ne sont jamais copiés ; les
  agrégats numériques sont retirés pour les colonnes détectées comme personnelles.
- La réponse du modèle est validée par le modèle Pydantic demandé ; une réponse non
  conforme lève `LLMResponseError`.

Les fournisseurs Anthropic, OpenAI et Ollama sont des squelettes (`NotImplementedError`) ;
le choix se fait avec `FORJA_LLM_PROVIDER`.

## Journalisation

Logs structurés via structlog (JSON par défaut, `FORJA_LOG_FORMAT=console` pour un
affichage lisible). Chaque requête HTTP reçoit un `request_id` (repris de l'en-tête
`x-request-id` s'il est fourni) propagé dans tous les logs de la requête.
