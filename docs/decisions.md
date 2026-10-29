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

**Étape 4.** L'authentification et les rôles sont en place (D20) : l'aperçu Bronze est
réservé au rôle `admin` en plus de `FORJA_ALLOW_BRONZE_PREVIEW`, et un analyst ne reçoit
jamais de donnée personnelle en clair.

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
plusieurs minutes : depuis l'étape 4 c'est un run en tâche de fond (D18). Si la
proposition reste invalide, Forja se rabat sur l'heuristique.

## D18 — Appels LLM en runs annulables et repris

**Contexte.** Sur CPU, `qwen3.5:9b` lit 11 à 15 tokens/s : une proposition Gold prend
plusieurs minutes, une demande à l'agent une à deux. Une requête HTTP synchrone expire,
bloque le worker et se perd si la machine se met en veille.

**Décision.**
- Proposition Gold (`gold_proposal`) et agent (`mart_request`) sont des runs ; `POST`
  répond `202` avec le run, la progression (`progress`) et le résultat (`result`) sont
  attachés au run. Le mode synchrone de `POST /gold-plan/propose` est supprimé.
- Le worker local a deux files : entrepôt (builds, exports, publications, en série,
  comme l'exige DuckDB) et LLM ; un modèle lent ne retarde plus un build.
- Annulation : l'appel au fournisseur s'exécute dans un fil secondaire surveillé toutes
  les 200 ms ; à l'annulation la connexion est fermée (Ollama arrête le calcul) et le run
  passe `cancelled`. Les builds ne s'annulent qu'en file : dbt écrit l'entrepôt.
- La portée du run (identifiant, annulation, progression) passe par une variable de
  contexte (`forja_core.jobs.scope`) plutôt que par toutes les signatures.
- Reprise : au démarrage, un run LLM resté `running` est remis en file (3 exécutions au
  plus) ; il ne lit que le catalogue, le relancer est sans risque. Un build interrompu
  échoue comme avant.

## D19 — Cache des réponses LLM par empreinte

**Décision.** Une réponse validée est stockée sous le SHA-256 de (fournisseur, modèle,
nom du schéma, prompt système, prompt). Le prompt contient tout ce qui détermine la
réponse : contexte, consigne, demande. La même question sur la même couche sémantique
(ou le même plan Gold sur les mêmes tables) ne rappelle pas le modèle ; un changement
de couche, de modèle ou de consigne change l'empreinte. Une entrée qui ne valide plus
contre le modèle Pydantic est ignorée. Le journal `llm_calls` distingue `cached`, et
chaque appel enregistre son run, ses tokens et sa durée.

## D20 — Authentification : argon2, JWT de session, refresh rotatif

**Décision.**
- Mots de passe argon2 (argon2-cffi) ; un email inconnu coûte une vérification factice
  pour ne pas révéler les comptes par le temps de réponse.
- Jeton d'accès JWT HS256 de 15 min portant l'identifiant de session ; la session est
  vérifiée à chaque requête (une requête au catalogue), ce qui rend la déconnexion et la
  révocation immédiates sans liste noire de jetons.
- Refresh token opaque à usage unique, stocké en SHA-256 ; un refresh déjà utilisé
  révoque la session (détection de vol).
- Clés API `fja_<préfixe>_<secret>` en SHA-256 (secrets longs et aléatoires : un hachage
  lent n'apporte rien), préfixe affiché pour les reconnaître.
- Mode `local` : un administrateur d'instance créé au premier démarrage, mot de passe
  aléatoire journalisé une fois, changement obligatoire. Mode `multi` : invitations.
  Pas d'OIDC à cette étape, mais l'interface `IdentityProvider` et les colonnes
  `identity_provider` / `external_subject` sont prêtes.
- Rôles par projet `admin`, `engineer`, `analyst` ; une route = une action de la matrice
  ; le projet est déduit du chemin. La matrice est dans le code
  (`ROLE_ACTIONS`), documentée dans `security.md` et vérifiée par un test qui appelle
  chaque route avec chaque rôle et échoue si une route n'y figure pas.
- Sans `data.unmasked`, toute colonne personnelle laissée en clair par le plan est
  pseudonymisée (aperçus, exports, échantillons de l'agent) : « l'analyst ne voit jamais
  de PII en clair » ne dépend pas d'un réglage de plan.

**Correction associée.** Les traitements d'une table Gold publiée étaient lus dans le
plan Gold *effectif* : un plan approuvé mais pas encore construit qui ne décrivait plus
la table la laissait sans traitement, et l'email partait en clair. Ils sont lus dans le
plan avec lequel la table a été construite.

## D21 — Couche sémantique déterministe, ratios plutôt que moyennes

**Décision.**
- Générée par des règles depuis le plan Gold appliqué : même plan, même couche. Une
  version n'est créée que si le contenu change.
- Une valeur non additive est le ratio de deux métriques additives
  (`sum(montant) / sum(quantite)`), jamais une moyenne : la moyenne des prix unitaires
  d'un groupe pondère par le nombre de lignes, pas par les quantités, et une moyenne de
  moyennes est fausse dès qu'on change de niveau. Le plan Gold heuristique déclare donc
  les prix et taux avec l'agrégation `none` au lieu de `avg`.
- Le comptage distinct d'un identifiant d'en-tête (`nb_commandes`) est non additif ; les
  sommes de soldes (stock, encours) sont semi-additives sur le temps.
- Les éditions d'un engineer sont des overrides stockés à part, réappliqués à chaque
  régénération : un libellé corrigé ne revient jamais en arrière.

## D22 — Agent : parseur d'abord, LLM sur la présélection, jamais de supposition

**Contexte.** Chaque appel à un modèle local coûte une à deux minutes et le contexte qu'il
lit en est la cause principale.

**Décision.**
- Une présélection locale réduit la couche sémantique aux éléments que la demande
  mentionne (plus les éléments de base), rendue en texte compact : ~200 tokens au lieu
  de la couche entière. Les valeurs distinctes servent à reconnaître les filtres et ne
  sont jamais envoyées.
- Un parseur par mots-clés traite les demandes simples sans LLM ; il n'est confiant que
  si chaque mot significatif est expliqué. Le LLM n'est appelé qu'à défaut ; sans LLM,
  Forja pose une question sur le mot inconnu ou refuse. Le chemin utilisé est enregistré.
- Un terme ambigu ou inconnu donne une Clarification de 2 à 4 options (ou un refus si
  rien n'approche), produite par le parseur, le LLM ou la validation : Forja ne devine pas.
- Le MartSpec est validé contre la couche ; le SQL est écrit par des templates à partir
  du MartSpec validé ; le LLM n'écrit jamais de SQL. Les valeurs de filtre sont
  résolues localement (« Lyonn » → Lyon), un filtre sur une donnée personnelle est
  refusé.
- Le schéma JSON de la réponse reste dans le prompt (D17) ; la consigne est courte.

## D23 — Aperçu de vérification, approbation et publication en dbt

**Décision.**
- Avant toute publication, l'utilisateur voit ce qui a été compris (résumé en français
  généré depuis le MartSpec, pas par le LLM), un échantillon pseudonymisé selon son
  rôle, le SQL et des contrôles : réconciliation des totaux additifs avec le fait sur le
  même périmètre (un écart bloque la validation), membres inconnus, colonnes vides,
  période sans données.
- `FORJA_MART_REQUIRE_APPROVAL=true` ajoute l'approbation d'un engineer entre la
  validation et la publication.
- Un data mart publié est un modèle dbt (`models/marts/mart_<nom>.sql`) construit,
  enregistré (couche `mart`, propriétaire), servi et exporté comme les tables Gold ; il
  reste dans le projet dbt à chaque régénération. Ses colonnes personnelles sont
  toujours pseudonymisées : un mart est partagé entre analysts.

## D24 — Évaluation de l'agent : modèle simulé en CI, sous-ensemble en local

**Décision.** Le jeu de 20 questions (`tests/agent_eval`) tourne dans pytest et en CI
avec un fournisseur simulé, qui répond comme un modèle discipliné : il mesure le
pipeline (présélection, parseur, validation, compilation, aperçu), pas le modèle.
Un modèle réel s'évalue par une commande dédiée, hors de la suite par défaut : 5
questions représentatives avec Ollama (une par type de chemin), le jeu complet avec un
fournisseur cloud. Le cache est alors désactivé pour mesurer durée et tokens.

**Mesures.** Simulé : 20/20, 13/20 sans LLM, contexte moyen 200 tokens. Ollama
`qwen3.5:9b` sur CPU : 3/5, ~2 min par appel pour ~1 500 tokens de prompt. Les échecs
(un filtre pris pour un axe, une ambiguïté tranchée) ont conduit à transmettre au modèle
les éléments reconnus localement et à traiter « vendus » sans métrique dans le parseur ;
ces correctifs restent à mesurer sur Ollama. Sur CPU, chaque question confiée au parseur
économise environ deux minutes : élargir le parseur rapporte plus que raccourcir le
prompt.


## D25 — Préparation du front : limitation des tentatives, CORS, démo, OpenAPI

**Décision.**
- Limitation des tentatives dans le catalogue (`auth_throttle`) : fenêtre glissante par
  compte et par IP, verrouillage progressif (60 s, puis ×2 jusqu'à 1 h), refus avant
  toute vérification avec une réponse identique que le compte existe ou non ; même
  limitation par IP pour le refresh et les invitations. Choisi plutôt qu'un proxy pour
  que l'instance locale soit protégée telle quelle.
- CORS limité à `FORJA_CORS_ORIGINS` (front local par défaut), sans cookie.
- `forja demo` construit un projet complet et deux comptes ; idempotente, elle affiche
  les mots de passe une seule fois dans le terminal et ne les écrit nulle part.
- `docs/openapi.json` est généré (`forja openapi`) et vérifié en CI. Résumés et
  descriptions en français sont écrits à un seul endroit (`forja_api.openapi`) ; les
  exemples de réponse sont enregistrés depuis un vrai projet de démo, raccourcis et sans
  secret ni donnée personnelle.
- La couche sémantique est générée depuis le dernier plan Gold **appliqué** : un plan
  approuvé mais pas encore construit ne décrit pas l'entrepôt.


## D26 — Notifications côté serveur et flux d'événements (SSE)

**Décision.** Les notifications sont stockées par utilisateur dans le catalogue
(`notifications`) et produites par le serveur : run terminé ou en échec, plan Silver à
revoir, data mart à approuver, approuvé, rejeté (avec le motif) ou publié, proposition
du modèle ou réponse de l'agent prête. Un bus d'événements en mémoire relie les threads
de travail aux flux ouverts ; `GET /events` (Server-Sent Events, relayé par le proxy Next
avec le cookie de session) pousse les notifications et l'état des runs que l'appelant
peut suivre. Un `ping` toutes les 15 s garde la connexion ouverte et permet au
navigateur de détecter un flux mort ; le flux se ferme à l'expiration du jeton d'accès
ou à la révocation de la session, et le navigateur se reconnecte (le proxy rafraîchit
alors les jetons). Tant que le flux est ouvert, le front n'interroge plus les runs ni
l'agent ; s'il tombe, l'interrogation périodique reprend, et une reconnexion
rafraîchit ce qui a pu être manqué.

**Pourquoi.** Les notifications dérivées côté front (calculées à partir des runs et des
demandes interrogés toutes les quelques secondes) ne voyaient que le projet ouvert,
oubliaient l'état lu d'un navigateur à l'autre et multipliaient les requêtes. SSE plutôt
que WebSocket : le flux est descendant, passe par le proxy HTTP existant et se
reconnecte nativement.

**Limite.** Le bus est en mémoire : une seule instance d'API. Plusieurs instances
demanderaient un bus partagé (Postgres LISTEN/NOTIFY, Redis).


## D27 — CSP stricte avec nonces, rendu dynamique de toutes les pages

**Décision.** Chaque page reçoit du proxy une Content-Security-Policy avec un nonce
neuf : `script-src 'self' 'nonce-…' 'strict-dynamic'`, styles par nonce, aucun cadre
(`frame-ancestors 'none'`), aucun objet, formulaires et connexions vers l'origine seule.
Next.js pose le nonce sur ses scripts, le layout racine sur le script de thème. Seuls
les attributs `style` restent autorisés (`style-src-attr`), car les composants rendus
côté serveur s'en servent et un attribut n'exécute rien. Les routes `/api` répondent
avec `default-src 'none'`. En production derrière HTTPS : `Strict-Transport-Security`.
Un test de bout en bout échoue sur toute violation signalée dans la console.

**Conséquence.** Un nonce est propre à une requête : les pages ne peuvent plus être
prérendues. `cacheComponents` et le préchargement partiel sont désactivés, toutes les
pages sont rendues à la demande. Le coût est faible ici : les écrans sont derrière une
session et leurs données se chargent côté client.


## D28 — Connecteurs de bases : SQLAlchemy plutôt que dlt ou les extensions DuckDB

**Contexte.** Trois candidats pour lire PostgreSQL, MySQL/MariaDB et SQL Server : la
source `sql_database` de dlt, les extensions `postgres_scanner` et `mysql_scanner` de
DuckDB, SQLAlchemy avec les pilotes de chaque base.

**Décision.** SQLAlchemy 2 (psycopg 3, PyMySQL, pymssql).

- **Une seule API pour les trois bases** : introspection (`inspect` : schémas, tables,
  vues, colonnes, clés primaires), types réfléchis, citation des identifiants selon le
  dialecte (`quoted_name(..., quote=True)` : toujours quotés), paramètres liés pour la
  valeur du curseur. Aucune requête n'est construite depuis une saisie libre : les noms
  viennent du catalogue de la base, et une table ou une colonne absente de
  l'introspection est refusée (404, 422).
- **Lecture en flux** : curseur côté serveur (`stream_results`, `yield_per`), lots de
  50 000 lignes convertis en lots Arrow, écrits en Parquet par DuckDB (`COPY` d'un
  `RecordBatchReader`). La mémoire ne dépend pas de la taille de la table.
- **Lecture seule doublée** : en plus du compte en lecture seule recommandé, les
  sessions PostgreSQL sont ouvertes avec `default_transaction_read_only=on` et MySQL avec
  `SET SESSION TRANSACTION READ ONLY`. Le test de connexion dit si le compte peut écrire.
- **dlt écarté** : il tient son propre état, ses fichiers normalisés et sa destination,
  qui feraient doublon avec Bronze (versions, `_row_hash`, dérive de schéma, profil) ;
  il ajoute une quarantaine de dépendances. **Extensions DuckDB écartées** : pas de SQL
  Server, téléchargement de l'extension au premier usage (poste hors ligne), version liée
  à celle de DuckDB.

**Incrémental.** Une colonne curseur est proposée par l'exploration : une date de
modification (`updated_at`, `modifie_le`…) d'abord, puis une date de création, puis un
identifiant entier croissant (clé primaire simple). Un chargement lit `curseur >
dernière valeur`, trié par le curseur, et retient la plus grande valeur vue. Une date
de création ou un identifiant ne reprennent pas les modifications (affiché dans
l'assistant). Limite connue : une ligne validée plus tard avec une valeur de curseur
déjà dépassée est manquée ; un chargement complet périodique la rattrape.

**Correspondance des types** (Bronze) : entiers → `int64`, numériques de précision ≤ 38
→ `decimal128(p, s)` (sinon texte), réels → `float64`, booléens et `BIT` → `bool`,
dates → `date32`, horodatages → `timestamp[us]` (avec fuseau : UTC), heures →
`time64[us]`, binaires → texte hexadécimal, JSON et tableaux → texte JSON, le reste
(UUID, intervalles, énumérations) → texte. Le profil infère ensuite les types fins comme
pour un fichier.

## D29 — Connecteur API REST : httpx et un garde SSRF plutôt que dlt `rest_api`

**Décision.** Un client httpx propre à Forja : authentification (clé en en-tête ou en
paramètre, Bearer, Basic, OAuth2 client credentials avec renouvellement du jeton),
pagination (numéro de page, décalage, curseur, en-tête `Link`, URL suivante), chemin des
enregistrements donné ou détecté, paramètre incrémental, limite de débit, nouvelles
tentatives sur 429 (en-tête `Retry-After` respecté), 5xx et erreurs réseau avec un
backoff exponentiel plafonné à 60 s.

**Pourquoi.** Chaque requête, chaque page suivante et chaque redirection doit passer par
le garde SSRF (`forja_core.connectors.ssrf`) : la source `rest_api` de dlt utilise sa
propre session et suit les redirections. Les pages suivantes doivent rester sur le site
de l'API (sinon les identifiants partiraient ailleurs) ; l'authentification n'est jamais
envoyée à une autre origine.

**Garde SSRF.** Avant chaque requête, l'hôte est résolu ; une adresse privée, de
bouclage, lien-local, multicast, réservée ou non globale (IPv4 mappée en IPv6 comprise)
est refusée, sauf si l'administrateur de l'instance l'autorise (hôte, IP ou plage CIDR,
dans Réglages > Connecteurs, ou `FORJA_CONNECTOR_ALLOWED_HOSTS`). Les redirections sont
suivies à la main et revérifiées. Après la connexion, l'adresse du pair est vérifiée à
nouveau avant de lire la réponse (rebinding DNS). Limite : la requête elle-même est
partie quand ce second contrôle échoue ; seule la réponse n'est pas lue.

**Aplatissement.** Les objets imbriqués deviennent des colonnes `a.b` ; les listes
imbriquées deviennent des tables enfants (`commandes__lignes`), liées au parent par une
colonne `<parent>_<clé>` (l'`id` de l'enregistrement, ou une empreinte `_forja_key`),
avec la position `_position`. Le détecteur de relations propose ensuite ces liens comme
pour des fichiers. Les enregistrements sont écrits en JSON lines puis lus par DuckDB :
le schéma s'unifie sur tous les enregistrements, sans tout garder en mémoire.

## D30 — Identifiants chiffrés au repos, jamais renvoyés

**Décision.** Les secrets d'une connexion (mot de passe, jeton, clé, secret client) sont
chiffrés en AES-256-GCM avec une clé aléatoire de 32 octets, `connections.key`, créée
dans `FORJA_SECRETS_DIR` (lisible par l'utilisateur seul, hors du dépôt et du dossier de
données). L'identifiant de la connexion sert de donnée associée : un chiffré recopié sur
une autre connexion ne se déchiffre pas. L'API ne renvoie que la liste des champs
renseignés (`secrets_set`) ; les messages d'erreur des bases et des API sont expurgés des
valeurs secrètes avant d'être renvoyés ou journalisés ; le journal d'audit ne note que
les noms des champs modifiés. Le modèle de langage ne voit jamais une connexion.

**Conséquence.** Perdre `connections.key` oblige à ressaisir les identifiants
(message explicite) ; il se sauvegarde avec les sels de pseudonymisation.

## D31 — Planificateur dans le processus de l'API, une seule instance

**Décision.** Un fil du processus de l'API vérifie toutes les 30 s
(`FORJA_SCHEDULER_TICK_SECONDS`) les planifications échues et lance un run `load` avec
`chain` : extraction → profil → Silver (sources dont le plan approuvé s'applique) →
Gold → data marts publiés → serving. Les plans ne sont jamais modifiés : une nouvelle
version crée au besoin un plan à revoir, et le build utilise le dernier plan approuvé.
Une **dérive bloquante** (colonne supprimée, type physique changé) écarte la source de
la reconstruction et notifie les engineers ; une colonne ajoutée ne bloque pas.

- **Pas de chevauchement** : si un chargement de la connexion est en file ou en cours, la
  planification est sautée jusqu'à sa prochaine échéance (`last_status: skipped`).
- **Rattrapage** : après un arrêt, une échéance passée déclenche un seul run, puis le
  rythme normal reprend ; les occurrences manquées ne sont pas rejouées une à une.
- **Notifications** : un chargement planifié réussi ne notifie personne ; un échec
  notifie les engineers et admins du projet.
- **Saisie** : en français (« tous les jours à 6 h », « du lundi au vendredi à 7h30 »,
  « le 1er de chaque mois à 5 h », « toutes les 15 minutes ») par une grammaire
  déterministe, ou en cron à cinq champs ; fuseau `FORJA_TIMEZONE` (Europe/Paris), heures
  sautées au changement d'heure exécutées juste après.
- **Horloge injectable** : les tests avancent le temps à la main.

**Pourquoi dans l'API.** DuckDB n'admet qu'un processus écrivain par fichier : le
catalogue et les entrepôts sont déjà propres au processus de l'API. Un ordonnanceur
externe (cron, Dagster) devrait passer par l'API. **Il faut une seule instance d'API**
(sinon chaque instance lancerait les chargements) ; `FORJA_SCHEDULER_ENABLED=false`
désactive le fil, par exemple pour une instance de secours.

## D32 — Gros volumes : DuckDB en flux, profil échantillonné, envoi reprenable

- **Ingestion** : DuckDB lit lui-même CSV, Parquet et JSON et écrit Bronze par `COPY`,
  colonnes techniques et `_row_hash` compris (SHA-256 du JSON compact des valeurs,
  identique octet pour octet au calcul Python précédent pour du texte : les nouvelles
  lignes restent bien comptées d'une version à l'autre). Le lecteur strict et parallèle
  de DuckDB prend les CSV conformes ; ceux qu'il refuse (lignes de largeurs inégales,
  guillemets mal fermés) passent par le module `csv` de Python, en deux passes en flux
  et par lots Arrow. Les encodages mono-octets sont transcodés en flux. Aucun pandas.
- **Profil** : comptes exacts (lignes, valeurs vides, distinctes, doublons) en un
  parcours de la table ; au-delà d'un million de lignes, inférence de type, valeurs
  fréquentes et statistiques sur un échantillon reproductible de 200 000 lignes. La durée
  est enregistrée et affichée.
- **DuckDB** : `memory_limit` 6 Go, 4 threads, `temp_directory` `<data_dir>/_tmp` par
  défaut (une machine de 16 Go garde de la place pour l'API, le front et un navigateur),
  appliqués à toutes les connexions et au profil dbt.
- **Envoi** : au-delà d'un morceau (`FORJA_UPLOAD_CHUNK_MB`, 8 Mo), le navigateur envoie
  le fichier par morceaux à l'offset où s'arrête la copie du serveur ; après une coupure
  ou une page rouverte, le même fichier (nom, taille, date) reprend sa session. Limite
  10 Go (`FORJA_MAX_UPLOAD_MB`). Le fichier complet est ingéré par un run `ingest`, puis
  supprimé ; une session inachevée expire après 48 h.
- **Front** : le canvas (React Flow) se charge après la page (`next/dynamic`), ELK dans
  un worker à la demande ; aucun autre écran ne les embarque.

Mesures : `docs/connectors.md`.
