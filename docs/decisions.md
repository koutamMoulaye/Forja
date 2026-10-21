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
- DuckDB 2.0 exige numpy pour enregistrer une fonction Python en SQL
  (`create_function`). Plutôt que d'ajouter numpy, les traitements PII s'appliquent en
  Python sur des lots Arrow (D7).

## D2 — Versions de sources plutôt que sources homonymes

**Contexte.** L'étape 1 créait `clients_2` quand on rechargeait `clients.csv`.

**Décision.** Le nom logique (nom de fichier slugifié, plus la feuille pour Excel)
identifie la source ; un upload crée une version. `mode=new_source` force une source
distincte, `mode=new_version` ou `POST /sources/{id}/versions` exigent une source
existante (cette dernière route accepte un fichier de nom différent).

**Conséquences.** Le profil et le plan sont ceux de la dernière version ; les profils des
versions précédentes restent consultables (`?version=`).

## D3 — Dérive de schéma : signaler, ne jamais bloquer

**Décision.** La dérive est calculée sur les types physiques et inférés, stockée avec la
version et reportée dans le plan rafraîchi sous forme d'avertissements. Les décisions
approuvées sont conservées : une colonne retypée garde sa règle et ses valeurs non
conformes vont en quarantaine ; une colonne ajoutée reçoit les règles par défaut et
attend l'approbation du nouveau plan ; une colonne disparue est conservée (NULL pour les
nouvelles lignes).

## D4 — Incrémental sur `_row_hash`, mise à jour par clé

**Décision.** Une ligne Bronze n'est traitée qu'une fois : son `_row_hash` est exclu dès
qu'il est présent en Silver ou en quarantaine. Avec une clé primaire, la table Silver est
mise à jour en `delete+insert` (la version la plus récente d'une clé gagne) ; sans clé,
`_row_hash` sert de clé.

**Conséquences.**
- Une ligne modifiée dans une nouvelle version a un nouveau hash : elle est retraitée et
  remplace l'ancienne si une clé existe, sinon elle s'ajoute.
- Une version qui ajoute une colonne change le hash de toutes ses lignes ; en pratique
  les nouvelles versions sont des deltas ou des extractions complètes que la clé
  dédoublonne.
- Les lignes en quarantaine ne sont pas réévaluées automatiquement : un changement de
  plan qui touche les colonnes existantes déclenche un full refresh, qui les réévalue.

## D5 — Clés primaires quasi uniques

**Contexte.** Une extraction réelle contient souvent un identifiant vide ou en conflit ;
une clé strictement unique n'existe alors pas et rien ne serait mis en quarantaine.

**Décision.** À défaut de clé stricte, une colonne de type identifiant (`id`, `*_id`,
`code`, `ref`…) unique à 95 % au moins avec au plus 5 % de nuls est retenue et signalée
`quasi_unique`. Les lignes sans clé ou en conflit dans un lot partent en quarantaine.

## D6 — dbt en sous-processus, un projet par projet Forja

**Décision.** `dbt build` est lancé dans un sous-processus (`cwd` = projet dbt, chemins
relatifs), jamais dans le processus de l'API : dbt garde un état global et n'est pas
prévu pour des invocations concurrentes. Le worker exécute un job à la fois, ce qui
respecte aussi le modèle mono-écrivain de DuckDB. Le projet dbt est une sortie générée,
régénérée à chaque build ; il ne doit pas être édité.

**Conséquences.** Un démarrage de dbt coûte quelques secondes par build. Un
orchestrateur pourra exécuter plusieurs projets en parallèle (un entrepôt par projet).

## D7 — Pseudonymisation à la sortie

**Décision.** HMAC-SHA256 avec un sel aléatoire par projet stocké dans
`FORJA_SECRETS_DIR` (par défaut `~/.forja/secrets`, un volume nommé sous Docker), hors du
dépôt et du dossier de données. Le traitement est appliqué à la publication (serving,
exports), pas en Silver. Le choix par colonne vient du plan effectif, si bien qu'un
changement de traitement s'applique au prochain export sans reconstruire Silver.

**Conséquences.**
- Perdre le sel change tous les pseudonymes publiés : le dossier doit être sauvegardé.
- Les pseudonymes sont stables dans un projet (jointures possibles entre tables) mais
  différents d'un projet à l'autre.

## D8 — Base serving reconstruite et substituée

**Décision.** La base serving est reconstruite dans un fichier temporaire puis substituée
d'un bloc. Plus simple et plus sûr qu'une mise à jour en place pendant que des outils BI
lisent. Sous Windows, un fichier ouvert par un autre programme ne peut pas être remplacé :
le run échoue explicitement (`serving_in_use`).
