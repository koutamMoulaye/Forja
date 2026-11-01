# Campagne de tests avant ouverture du dépôt

Campagne de bout en bout de l'étape 7 : un parcours de référence complet, un jeu de
données public réel, des dérives, des volumes, la sécurité, les performances du front,
la résilience, un vrai modèle de langage et les parcours de l'interface. Les chiffres
sont dans [benchmarks.md](benchmarks.md) ; ce document recense ce que la campagne a
trouvé et ce qui reste à faire.

Chaque scénario est un test du dépôt, rejouable :

| Scénario | Test | Lancement |
|---|---|---|
| 1. Parcours de référence | `tests/campaign/test_reference_journey.py` | suite par défaut |
| 2. Jeu de données réel | `tests/campaign/test_open_data.py` | `FORJA_OPEN_DATA_DIR` |
| 3. Dérives | `tests/campaign/test_drifts.py` | suite par défaut |
| 4. Volumes | `tests/test_volume.py`, `tests/campaign/test_volume_sources.py` | `FORJA_VOLUME_*` |
| 5. Sécurité | `tests/campaign/test_security.py`, `tests/test_permissions.py`, `tests/test_connectors_rest.py` | suite par défaut |
| 6. Performance du front | `apps/web/e2e/05-canvas.spec.ts` (projet `chrome`), `pnpm budget` | e2e, CI |
| 7. Résilience | `tests/campaign/test_resilience.py`, `apps/web/e2e/13-plan-tabs.spec.ts` | suite par défaut, e2e |
| 8. Modèle réel | `tests/campaign/test_real_llm.py`, `python -m tests.agent_eval` | `FORJA_CAMPAIGN_LLM_MODEL` |
| 9. Parcours de l'interface | `apps/web/e2e/14-reference-journey.spec.ts` | e2e |

`uv run pytest -m campaign` rejoue tous les scénarios Python ; les scénarios optionnels
sont sautés sans leur variable.

## Le canvas bloqué sur son squelette

Le blocage n'était pas un manque de mémoire : mesuré, c'était une chaîne d'étapes lentes
mises bout à bout, aggravée sur la machine de référence par l'émulation.

| Cause mesurée | Effet | Correction |
|---|---|---|
| Les liens de la barre latérale préchargeaient dix écrans (16 rendus dynamiques) | la requête du graphe partait jusqu'à 11 s plus tard | plus de préchargement (`11ec1f4`) |
| Le graphe attendait la liste des projets puis le montage de l'écran | 0,5 à 0,7 s d'attente en série | le shell demande le graphe dès que l'adresse est connue |
| Code du canvas, worker de mise en page et ELK chargés après le graphe | plusieurs secondes en série | chargés pendant que le graphe arrive |
| Toutes les lectures du catalogue passaient par une connexion et un verrou | rafale de 13 requêtes : `/auth/me` de 27 ms à 460-720 ms, le graphe 2 à 3 s | curseur de lecture par thread : 44 à 131 ms (`573989b`) |
| La barre latérale envoyait 8 + N requêtes (une par source) | file d'attente proportionnelle aux sources | un endpoint `/counters` (`f1578ee`) |
| Le graphe lisait plan et profil source par source | 358 ms | deux requêtes, 220 ms (`77383b6`) |
| ELK recalculé à chaque visite | 0,8 à 1,9 s par chargement | classement gardé dans le navigateur ; classement rapide si ELK tarde plus de 800 ms |
| React Flow masquait pour de bon un nœud reconstruit entre deux mesures | canvas affiché sans aucun nœud, de façon intermittente | taille classée fournie en attendant la mesure |
| Un worker qui ne démarre pas laissait le squelette | rien ne s'affichait | repli sur le fil principal |

Après correction, dans Chrome sur la machine de référence : première visite après
connexion 1,5 à 1,8 s, rechargement 0,4 à 1,3 s. Le test e2e
« the canvas shows its nodes within 5 seconds » échoue au-delà de 5 s, ELK à froid comme
classement réutilisé, ou si un nœud reste masqué ; il tourne en build de production, dans
Chrome. Le Chromium de Playwright pour Windows est un binaire x64 : sur cette machine ARM64
il est émulé et exécute le même JavaScript six fois plus lentement (premier calcul d'ELK :
841 ms contre 129 ms dans Chrome natif), ce qu'aucun utilisateur ne voit.

## Anomalies

Classement : **bloquante** (empêche un parcours), **majeure** (résultat faux, données ou
sécurité exposées, ou parcours très dégradé), **mineure** (gêne, cas limite, confort).

| # | Anomalie | Gravité | Statut | Correction et test |
|---|---|---|---|---|
| 1 | Canvas bloqué sur le squelette (chaîne de causes ci-dessus) | bloquante | corrigé | `573989b`, `77383b6`, `f1578ee`, `11ec1f4` ; `05-canvas.spec.ts` |
| 2 | Canvas sans nœuds : React Flow masquait des nœuds reconstruits | bloquante | corrigé | `11ec1f4` ; même test (aucun nœud masqué) |
| 3 | Un projet d'un seul fichier n'obtenait aucun fait Gold : modèle impossible à approuver | bloquante | corrigé | `2596397`, `8467bb3` ; `test_a_project_of_one_file_gets_a_fact` |
| 4 | SSRF : nom résolu deux fois, une réponse DNS changée entre-temps (rebinding) atteignait une adresse privée | majeure | corrigé | `c3e4746` ; tests de rebinding, redirection, IPv4 mappée, TLS |
| 5 | Chargement incrémental : une ligne validée en retard, datée juste avant le curseur, n'était jamais lue | majeure | corrigé | `87d69a3` (fenêtre de relecture, dédoublonnage `_row_hash`) |
| 6 | Barre latérale : 8 + N requêtes par page, croissant avec le nombre de sources | majeure | corrigé | `f1578ee` ; matrice des rôles |
| 7 | Une dérive de schéma ne bloquait que le chargement qui l'apportait ; le suivant reconstruisait Silver avec le plan d'avant | majeure | corrigé | `6edcdd3` ; scénario 3 |
| 8 | Un plan modifié dans un autre onglet pouvait être approuvé sans avoir été vu | majeure | corrigé | `6c14bb0` ; `test_two_tabs_on_the_same_plan`, `13-plan-tabs.spec.ts` |
| 9 | Après un arrêt brutal de l'API, dbt survivait et gardait l'entrepôt ouvert : le build suivant échouait | majeure | corrigé | `0282ead` ; scénario 7 |
| 10 | Des identifiants groupés par espaces (« 155 781 758 ») étaient des décimaux : relation manquée sur les données réelles | majeure | corrigé | `9558523` ; scénario 2, `test_type_inference` |
| 11 | Écran Modèle vide : impossible de confirmer les relations avant la première proposition | mineure | corrigé | `c3964a0` ; `14-reference-journey.spec.ts` |
| 12 | dbt démarre à chaque run : 3,3 s d'import au repos (Python émulé), jusqu'à 28 s avant le premier modèle sur une machine chargée ; l'analyse partielle ne servait pas, `forja_run_id` changeait à chaque run | mineure | corrigé (étape 8) | `65cff9e` : identifiant par `FORJA_RUN_ID`, analyse partielle gardée ; Silver reconstruit 7,55 → 6,7 s ; `test_e2e.py` (identifiant du second run) |
| 13 | Sans modèle de langage, la proposition Gold somme des colonnes de codes (nomenclatures BAAC) comme des mesures | mineure | corrigé (étape 8) | `9db523e` : codes reconnus (nom, peu d'entiers courts), gardés en dimensions dégénérées ; `test_code_columns_are_not_measures` |
| 14 | Un mois écrit « 03 » est inféré comme texte (zéro initial) | mineure | corrigé (étape 8) | `bef850a` : entier avec mention si le zéro n'est qu'un remplissage, texte pour un code ; `test_a_leading_zero_is_padding_or_part_of_a_code` |
| 15 | Sans modèle de langage, une question en français sur des colonnes nommées en anglais est refusée tant que la couche sémantique n'a pas de synonymes ; l'agent propose la forme comprise | mineure | corrigé (étape 8) | `b6c57e9` : synonymes français proposés par dictionnaire, validés par un engineer ; `test_english_names_get_french_synonyms_to_validate` |
| 16 | Relation suggérée à 85 % entre des noms de clients (texte) de deux sources | mineure | ouvert | reste une suggestion à confirmer |
| 17 | Pic mémoire de l'ingestion d'un fichier de 2 Go : 6,1 Go, la limite par défaut de DuckDB (6 Go) | mineure | corrigé (étape 8) | `520751b` : limite `auto` (moitié de la mémoire disponible, limite du conteneur comprise, entre 1 et 16 Go) ; `test_duckdb_memory_limit_is_computed_or_overridden` |
| 18 | Thread principal occupé environ 2 s au chargement du canvas dans un navigateur lent (rendus React répétés) | mineure | corrigé (étape 8) | `7a58f32` : 22 à 24 commits React au lieu de 35 à 41, script 1,87 → 1,5 s (médianes, Chromium émulé) |
| 19 | macOS : rien ne lie dbt à la vie de l'API (pas de job object ni de `PR_SET_PDEATHSIG`) | mineure | corrigé (étape 8) | `3fc856e` : groupe de processus arrêté à la fermeture, gardien sous macOS ; `tests/test_children.py` (Linux en CI) |
| 20 | Premier passage du volume PostgreSQL en échec juste après l'arrêt des conteneurs par la suite complète | mineure | corrigé (étape 8) | `94c9bae` : contrôle de santé en TCP (le serveur temporaire du premier démarrage écoute sur le socket seulement), trois réponses d'affilée exigées |

Pendant la campagne, une régression introduite par la réécriture du SSRF (un hôte autorisé
par son nom était résolu à l'enregistrement) a été trouvée par la suite et corrigée avant
tout commit.

## Recommandations avant de rendre le dépôt public

État à l'étape 8 : 1 fait (identifiant de run par variable d'environnement ; dbt en
processus, `dbtRunner`, n'est pas retenu pour garder l'isolation), 2 étudié (Python
ARM64 natif bloqué sous Windows par les roues manquantes, natif en conteneur arm64 :
[development.md](development.md#windows-sur-arm64-snapdragon)), 3, 4, 5 et 6 faits,
7 fait (actions épinglées par commit, Ubuntu 24.04). Seule l'anomalie 16 reste ouverte :
une suggestion à confirmer, par construction.

Recommandations d'origine :

1. **Démarrage de dbt.** Passer l'identifiant de run par une variable d'environnement
   plutôt que `--vars` permettrait l'analyse partielle (le tiers environ du démarrage) ;
   un dbt invoqué en processus (`dbtRunner`) éviterait l'import à chaque run, au prix de
   l'isolation.
2. **Python natif sur ARM64.** Sur la machine de référence, l'API, DuckDB et dbt tournent
   en x64 émulé : tous les temps côté Python y sont pessimistes. Vérifier les roues ARM64
   de pyarrow et DuckDB avant de le conseiller.
3. **Limite mémoire de DuckDB.** Le défaut de 6 Go suppose une machine de 16 Go ou plus ;
   le documenter dans l'installation, ou le calculer depuis la mémoire disponible.
4. **Proposition Gold sans modèle.** Reconnaître les colonnes de codes (peu de valeurs
   distinctes, nom court) pour ne pas en faire des mesures.
5. **Synonymes de la couche sémantique.** Proposer des synonymes français pour les noms
   anglais courants (amount, customer, order) quand aucun modèle n'est configuré.
6. **Rendus du canvas.** Réduire les rendus en cascade au chargement (requêtes qui
   arrivent l'une après l'autre) : environ 2 s de fil principal dans un navigateur lent.
7. **CI.** Les actions `astral-sh/setup-uv@v6` visent Node.js 20, déprécié par GitHub ;
   `ubuntu-latest` passe à Ubuntu 26 : épingler la version ou vérifier la compatibilité.

État de la CI et chiffres détaillés : [benchmarks.md](benchmarks.md).
