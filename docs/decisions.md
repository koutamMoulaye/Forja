# Décisions techniques

Chaque entrée indique le contexte, la décision et ses conséquences.

## D1 — Versions de dbt et DuckDB

**Contexte.** dbt-duckdb embarque sa propre dépendance à DuckDB ; une version de DuckDB
trop récente peut casser l'adaptateur. L'étape 1 avait résolu DuckDB 2.0.0 avec
dbt-core 1.12.6 et dbt-duckdb 1.11.0 sans les avoir exécutés ensemble.

**Vérification.** Un vrai projet dbt minimal a été exécuté avec ces versions :
modèle `view`, puis modèle `incremental` (`delete+insert`, `unique_key`) lisant du Parquet
via `read_parquet`, contrat de types appliqué (`contract.enforced: true`), tests
`unique` / `not_null`, puis un second run incrémental ajoutant un nouveau fichier. Tout passe ;
le résultat lu depuis Python avec DuckDB 2.0.0 est correct.

**Décision.** Pas de retour en arrière de DuckDB. Les versions vérifiées sont épinglées
dans `packages/core/pyproject.toml` sur leur série mineure :

| Paquet | Contrainte | Verrouillé |
|---|---|---|
| duckdb | `>=2.0.0,<2.1` | 2.0.0 |
| dbt-core | `>=1.12.6,<1.13` | 1.12.6 |
| dbt-duckdb | `>=1.11.0,<1.12` | 1.11.0 |

**Conséquences.**
- Toute montée de version passe par le test de bout en bout `tests/test_e2e.py`, qui
  exécute un vrai `dbt build`.
- dbt impose qu'un modèle incrémental sous contrat déclare `on_schema_change`
  (`append_new_columns` ou `fail`). Forja utilise `append_new_columns`, cohérent avec la
  gestion de la dérive de schéma (D3).
- DuckDB 2.0 refuse d'enchaîner une requête sur une connexion dont le résultat
  `execute()` n'a pas été entièrement lu ; le code lit les résultats intégralement
  (`fetchall`) avant toute autre requête.
