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

## D9 — Montants en DECIMAL(18,2)

**Contexte.** En `DOUBLE`, `0,1 + 0,2` ne vaut pas exactement `0,3` : les agrégats
financiers du Gold doivent être exacts.

**Décision.** Une colonne décimale dont le nom évoque un montant (`montant`, `prix`,
`total`, `frais`, `ht`, `ttc`, `amount`, `price`…) et dont les valeurs ont au plus deux
décimales (mesuré au profiling, `max_decimals`) est typée `DECIMAL(18,2)` dans le plan
Silver. Les autres décimaux restent en `DOUBLE` (poids, taux, coordonnées).

**Conséquences.**
- La règle s'applique aux plans générés à partir de cette version. Les plans déjà
  approuvés gardent leur décision ; un passage de `DOUBLE` à `DECIMAL(18,2)` (ou
  l'inverse), par `PATCH` ou par un nouveau plan, modifie le type d'une colonne existante
  et **déclenche donc un full refresh** de la table Silver au build suivant.
- Une valeur à trois décimales dans une colonne déjà typée `DECIMAL(18,2)` est arrondie
  par DuckDB à la conversion.

## D10 — Prévisualisation et accès aux données ; authentification à l'étape 4

**Contexte.** Forja n'a pas encore d'authentification : toute personne qui atteint l'API
voit tout ce que l'API expose. Le Bronze contient les valeurs brutes, données
personnelles comprises.

**Décision.**
- `GET /sources/{id}/preview` (Bronze) répond `403` par défaut ; il faut
  `FORJA_ALLOW_BRONZE_PREVIEW=true` pour l'activer (usage local, données de test).
- `GET /tables/{id}/preview` montre une table Silver ou Gold avec exactement les
  traitements des exports et du serving (pseudonymisation par défaut).

**À venir (étape 4).** L'authentification et les rôles (qui peut voir le Bronze en clair,
approuver un plan, lancer un build, publier) arrivent à l'étape 4. D'ici là :
- l'API doit rester sur `127.0.0.1` (valeur par défaut de `FORJA_API_HOST`) ou derrière
  un proxy authentifiant ;
- `FORJA_ALLOW_BRONZE_PREVIEW` ne doit pas être activé sur une instance partagée.

## D11 — Relations détectées localement, confirmées par une personne

**Décision.** Les relations sont mesurées sur les tables Silver (valeurs nettoyées et
typées, celles que le Gold joint) : taux d'inclusion des valeurs distinctes sur un
échantillon déterministe (`FORJA_RELATION_SAMPLE_SIZE`), similarité de noms FR/EN,
compatibilité de type, cardinalité. Les colonnes entières ne sont comparées que si leurs
noms se ressemblent (une quantité serait sinon « incluse » dans n'importe quel
identifiant). Une relation détectée est `suggested` ; seul un humain la passe à
`confirmed` (ou `FORJA_AUTO_CONFIRM_RELATIONS=true` en local). Une nouvelle détection
rafraîchit les statistiques sans jamais écraser une décision de revue.

**Limite.** Les clés étrangères composites ne sont pas détectées (déclaration manuelle
prévue plus tard).

## D12 — Fournisseurs LLM : SDK officiels, sortie structurée, aucun SQL libre

**Décision.**
- Anthropic et OpenAI passent par leurs SDK officiels, Ollama par son API REST. La
  sortie est contrainte par le schéma JSON du modèle Pydantic attendu
  (`output_config.format` chez Anthropic) puis validée par Pydantic.
- Les retries (429, 408, 409, 5xx, timeouts) sont gérés par Forja avec backoff
  exponentiel ou `retry-after` ; les retries des SDK sont désactivés pour que le journal
  compte les tentatives de façon homogène. Une réponse invalide est renvoyée une fois
  avec les erreurs de validation.
- Anthropic : `claude-opus-5-5` par défaut, effort explicite (`high`), bascule serveur en
  cas de refus (`fallbacks: "default"`), désactivable par
  `FORJA_LLM_REFUSAL_FALLBACK=false`.
- Journal `llm_calls` : empreinte SHA-256 du prompt, durée, tentatives, tokens, statut.
  Jamais le prompt ni la réponse.
- Sans `FORJA_LLM_PROVIDER`, aucun fournisseur n'est créé : Forja fonctionne entièrement
  avec ses règles déterministes.

## D13 — Le contexte LLM ne contient aucune valeur

**Décision.** En plus des top valeurs, les minimums, maximums et moyennes ont été
retirés du contexte : un maximum est une valeur de ligne (le salaire le plus élevé). Le
contexte ne contient que des noms, des types, des formats issus d'une liste fermée, des
taux et des comptages. Un test sérialise le contexte du projet e-commerce et échoue si une
seule valeur de cellule des fixtures y apparaît.

## D14 — Modèle Gold : le LLM propose, des règles valident, des templates compilent

**Décision.**
- Le LLM (ou, sans LLM, une heuristique déterministe) produit un `GoldModel` JSON :
  dimensions, faits, grain, clés, mesures. Il n'écrit jamais de SQL ; seules les
  expressions de mesures sont libres, parsées par sqlglot avec une liste blanche de
  nœuds, de fonctions (`coalesce`, `nullif`, `abs`, `round`, `least`, `greatest`, `case`,
  `cast`…) et de colonnes existantes.
- La validation bloque l'approbation : grain sans la clé primaire, clé étrangère sans
  relation confirmée, dimension orpheline, jointure dans le sens 1-N (fan-out), mesure
  additive lue sur une table jointe (ex. `frais_port` d'une commande sommé par ligne).
- Heuristique : une source qui ne fait que référencer est un fait, une source
  intermédiaire est jointe au fait (en-tête), une source seulement référencée est une
  dimension ; SCD2 si la dimension porte des attributs qui évoluent (ville, segment,
  catégorie, statut) ou des données personnelles.

## D15 — Clés de substitution, membre inconnu et SCD2

**Décision.**
- Clé de substitution = MD5 de la clé naturelle (et du début de version en SCD2) :
  déterministe, stable d'un build à l'autre, sans séquence à maintenir.
- Chaque dimension a un membre « inconnu » de clé `-1` ; une clé étrangère sans
  correspondance y est rattachée au lieu de supprimer la ligne de fait. Le nombre de
  lignes concernées est une métrique du run `build_gold`.
- SCD2 par snapshot dbt (`strategy: check` sur les attributs) de la table Silver. La
  première version d'une clé est valide depuis 1900-01-01, sinon les faits antérieurs au
  premier snapshot ne trouveraient aucune version. Un fait pointe vers la version valide
  à sa date (première clé de date du fait), ou vers la version courante sans date.

**Conséquence.** L'historique SCD2 commence au premier `build_gold` : les changements
survenus entre deux versions Bronze traitées avant ce premier build ne sont pas
reconstitués.

## D16 — Serving : Gold par défaut, Silver sur demande

**Décision.** La base serving et les exports du run `export` ne contiennent plus que les
tables marquées `publish` : toutes les tables Gold par défaut, une table Silver
uniquement après `PATCH /tables/{id}` avec `{"publish": true}`. La décision de
publication est conservée d'un build à l'autre. Les colonnes Gold héritent du traitement
PII de leur colonne Silver d'origine (surchargeable par attribut dans le plan Gold).

## D17 — LLM local : Ollama et Qwen 3.5

**Décision.**
- Ollama est le fournisseur gratuit recommandé : rien ne sort du poste, aucune clé.
  Modèle par défaut `qwen3.5:9b` (famille la plus récente de la bibliothèque Ollama,
  sortie structurée fiable, tient dans 16 Go de RAM sans GPU).
- Le délai par appel dépend du fournisseur : 120 s pour les API, 30 min pour Ollama
  (`FORJA_LLM_TIMEOUT_SECONDS` pour l'imposer).
- Forja fixe la fenêtre de contexte (`num_ctx`, 16 384 tokens) : la valeur par défaut
  d'Ollama tronquerait le prompt du plan Gold sans erreur. Le raisonnement des modèles
  « thinking » est coupé (`think: false`) et le modèle reste chargé 30 min.
- Le schéma JSON reste dans le prompt même si `format` contraint déjà la sortie :
  essayé sans, le prompt est 35 % plus court mais le 9b ne remplit plus les dimensions
  et le plan est rejeté.
- Les relations du contexte nomment les tables par source (`commandes`), comme le plan
  attendu ; les noms Silver (`stg_commandes`) poussaient les modèles à les recopier.

**Mesures** (Snapdragon X Plus, 32 Go, CPU seul, fixture e-commerce) : un plan Gold lit
~3 700 tokens de prompt à 11-15 tokens/s et en écrit ~1 000 à 4,5-8 tokens/s, soit
6 à 9 min à froid et ~3,5 min quand Ollama réutilise le prompt en cache. Le plan proposé
(identique sur deux essais, température 0) passe la validation du premier coup et se
construit : mêmes 79 lignes de fait et 13 tests dbt verts que le plan heuristique.
`qwen3.5:4b` est deux fois plus rapide mais propose un fait sans mesure. Un GPU réduit nettement ces temps.

**Conséquence.** Sur CPU, la proposition Gold par LLM local est une opération de
plusieurs minutes : à exécuter en tâche de fond à l'étape 4 plutôt que dans une requête
HTTP. Si la proposition reste invalide, Forja se rabat sur l'heuristique.
