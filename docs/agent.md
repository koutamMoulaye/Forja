# Agent métier

*English: [en/agent.md](en/agent.md)*

Un analyst demande un data mart en français ; Forja le comprend, montre ce qu'il a
compris avec un aperçu vérifiable, et ne publie qu'après validation.

```
demande en français
  │
  ├─ 1. présélection locale ─── libellés, synonymes, valeurs distinctes (Lyon, livrée…)
  │                              → contexte de ~200 tokens, mesuré
  ├─ 2. parseur déterministe ── « CA par mois », « top 5 des produits au T1 2024 »
  │        │ confiant                       │ pas confiant (mot inconnu)
  │        ▼                                ▼
  │     MartSpec                 3. LLM (demande + présélection, aucune valeur)
  │                                         │ MartSpec | Clarification | refus
  ├─ 4. validation stricte ──── contre la couche sémantique ; valeurs résolues
  │                              localement ; terme inconnu → Clarification
  ├─ 5. compilation SQL ─────── templates déterministes (jamais de SQL du LLM)
  ├─ 6. aperçu de vérification ─ résumé, lignes, échantillon pseudonymisé, SQL, contrôles
  ├─ 7. validation par l'utilisateur (+ approbation engineer si exigée)
  └─ 8. publication ─────────── modèle dbt mart_<nom>, build, serving, Parquet / CSV
```

Chaque étape coûteuse est un **run** (`mart_request`, `publish_mart`) : `POST` répond
`202` avec la demande et son run, la progression se suit par `GET /runs/{id}`
(`progress.step` : `preselection`, `llm`, `validation`, `preview`, `dbt`, `serving`), le
run s'annule par `POST /runs/{id}/cancel` (l'appel en cours au modèle est interrompu).

## 0. Intention du message

Avant tout, `forja_core.agent.intents` découpe le message en propositions (ponctuation,
« et la… ») et dit de quoi chacune parle, sans modèle de langage :

- **demande de données** : elle nomme une métrique, un axe, une date, une période, ou un
  verbe d'ajustement (« ajoute », « retire », « seulement ») ; elle va au parseur ;
- **question sur les données** (« ce cas parle de quoi ? », « quelles données as-tu ? ») :
  réponse déterministe écrite depuis la couche sémantique et les sources (fichiers,
  lignes, mesures et leurs unités, axes, dates et années couvertes, exemples que le
  parseur comprend) ; la version `answered` ne crée pas de data mart ;
- **hors périmètre** (« la météo à Paris ») : refus poli avec ce que Forja sait mesurer.
  Une clause qui ne nomme qu'une valeur (« Paris ») est une demande seulement si rien
  d'autre n'y reste inexpliqué (« et à Paris ? ») ; avec un LLM, aussi quand ses autres
  mots ne parlent pas d'un sujet courant extérieur aux données (météo, heure,
  actualité…). « La météo actuelle à Paris » est toujours hors périmètre.

**Nouvelle question ou ajustement.** Dans une conversation qui a déjà un data mart, une
phrase autonome (une mesure, et un axe, une période ou un découpage ; sans « et » en tête,
« aussi », « seulement », « ajoute », « retire », pronom) est une **nouvelle question** :
la version est de type `question` et n'hérite d'aucun filtre, période, tri ni limite.
Sinon c'est un ajustement du data mart courant.

Les refus écrits par le LLM qui parlent de son fonctionnement (« couche sémantique
fournie », « schéma ») sont remplacés par le refus déterministe.

Un message mixte est découpé : la partie sur les données est traitée, le reste écarté en
une phrase ajoutée au résumé. Un message hors sujet n'affine jamais le data mart et ne
bloque jamais la version prête : la demande reste « aperçu prêt ».

## 1. Présélection locale

`forja_core.agent.vocabulary` indexe les libellés, synonymes et noms des métriques,
dimensions et attributs visibles, ainsi que les **valeurs distinctes** des attributs
filtrables (texte, non personnels, au plus 5 000 valeurs), lues dans les tables Gold.
La demande est normalisée (minuscules, sans accents, apostrophes et ponctuation retirées,
lemmes simples : pluriels, participes « livrées » → « livré ») puis comparée aux
expressions de l'index (plus longue correspondance d'abord, tolérance aux fautes de
frappe sur les mots de 5 lettres et plus).

Résolution des valeurs (lot 2 des tests manuels, MT-20) :

- une **valeur** n'est reconnue que si la demande la contient **en entier**, mots vides
  compris (« musées » n'est jamais la valeur « Musée de l'affiche ») ;
- un empan qui nomme une **mesure, une dimension ou un attribut** est cet élément, jamais
  une valeur ; à empan égal, une correspondance exacte l'emporte sur une approchée ;
- un texte **entre guillemets** cherche les valeurs qui le contiennent : une seule donne
  un filtre, plusieurs une question ;
- dans le doute, une question avec options, jamais un filtre silencieux.

Sont retenus : les éléments reconnus, les métriques de base (`default`), l'attribut
d'affichage de chaque dimension, les dimensions temporelles et les granularités. Le
contexte est rendu en texte compact (une ligne par élément) ; sa taille est estimée à
3,2 caractères par token et enregistrée avec chaque version de la demande
(`context_tokens`). Objectif : moins de 1 500 tokens ; mesuré sur les 20 questions
d'évaluation : **200 tokens en moyenne, 249 au plus**. Les valeurs distinctes ne quittent
jamais le processus.

## 2. Parseur déterministe

`forja_core.agent.parser` reconnaît sans LLM :

- **périodes** : année (`en 2024`), trimestre (`T1 2024`, `premier trimestre`), semestre,
  mois, plage de mois (`de janvier à mars 2024`), relatives (`l'année dernière`, `cette
  année`, `depuis le début de l'année`) ; sans année, celle des données ;
- **granularité** : `par mois`, `mensuel`, `par trimestre`… ; `évolution` sans
  granularité = par mois ;
- **top N** : `top 5`, `les 3 meilleurs`, `les 10 premiers` (tri décroissant), `les 5
  pires` (croissant), tri `par <métrique>` ; « Top N des X les plus Y » : X est l'axe, tri
  décroissant sur Y, limite N (« les moins Y » : croissant) ;
- **comptage d'entité** : « nombre de musées », « combien de musées » lisent la métrique
  générée « Nombre de <entité> » (comptage distinct de la clé, membre inconnu exclu) ;
- **mesures composées** : « fréquentation payante et gratuite » = entrées payantes +
  entrées gratuites (noms composés générés pour chaque mesure qualifiée d'un comptage,
  expression la plus longue d'abord) ;
- **hiérarchies** : « par géographie », « par territoire » lisent le niveau le plus large
  de la hiérarchie (région) ;
- **métriques**, **axes** (`par ville`, `par catégorie et segment`, `des produits`) et
  **filtres** par valeur (`à Lyon`, `livrées`, `clients de Lyon et Paris` → `in`, `hors
  jardin` → `neq`, `segment Pro` → préfixe unique d'une valeur de l'attribut nommé).

Il est **confiant** quand chaque mot significatif est expliqué (mots vides et mots de
liaison connus mis à part). Un mot qui désigne plusieurs métriques (« ventes » : chiffre
d'affaires ou quantité ?) ou une métrique et un attribut (« prix » : prix moyen de
vente ou prix catalogue ?) produit directement une Clarification. Sinon, le LLM est
appelé ; **sans LLM configuré**, Forja pose une question sur le mot inconnu (options
proches + « Ignorer ») ou refuse si rien n'en approche. Un **adjectif inconnu qui suit
une entité** (« musées labellisés ») est demandé avant tout appel au LLM, avec les
attributs qui pourraient le traduire : une date secondaire renseignée (« Avec une date
d'appellation renseignée », filtre `not_null`), cette date comme date du découpage
(« Par année d'appellation »), ou « Ignorer ». La réponse indique le chemin
utilisé : `path` = `parser`, `llm` ou `llm_cache`.

## 3. LLM

`forja_llm.agent.LLMMartInterpreter` envoie la consigne, la demande, la présélection
(rendue par `SemanticContext`, modèle Pydantic fermé dont les champs sont des noms,
libellés et synonymes) et, pour un affinage, le MartSpec courant ; jamais de valeur de
données. Il répond par un `AgentAnswer` validé par Pydantic : `mart` (MartSpec), une
`clarification` (question, terme, 2 à 4 options `metric:` / `attribute:`) ou un
`refusal`. Les réponses sont mises en cache par empreinte (fournisseur, modèle, schéma,
prompt) : la même question sur la même couche sémantique ne rappelle pas le modèle.
Tokens et durée de chaque appel sont journalisés (`llm_calls`, run, version de la
demande).

### MartSpec

```json
{
  "metrics": ["montant", "nb_commandes"],
  "axes": ["client.ville"],
  "time_grain": "mois",
  "time_dimension": "date_commande",
  "filters": [{"field": "client.segment", "operator": "eq", "value": "professionnel"}],
  "period": {"start": "2024-01-01", "end": "2024-12-31", "label": "2024"},
  "order_by": [{"field": "montant", "direction": "desc"}],
  "limit": 10,
  "name": "ca_commandes_par_mois_ville_2024"
}
```

Opérateurs : `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `contains`. Un filtre
sur une métrique (`montant > 100`) porte sur les totaux (`having`).

## 4. Validation

`forja_core.agent.validate` : toute référence doit exister et être visible ; les
métriques d'un même data mart viennent d'un même fait ; un axe doit être relié à ce
fait ; une valeur de filtre texte est résolue contre les valeurs distinctes (exacte,
préfixe unique, puis proche : « Lyonn » → Lyon) ; une valeur introuvable ou ambiguë
devient une Clarification (valeurs proches) ou un refus. Pas de filtre sur la valeur
d'une donnée personnelle. Une granularité ou une période sans date dans le fait est
refusée. Rien n'est deviné.

Un axe sur un attribut qu'un filtre fige à une seule valeur (« CA par ville à Lyon ») ne
donnerait qu'une colonne constante : un modèle le demande parfois. Forja retire l'axe,
de façon déterministe, et le dit à la fin du résumé (« Axe « Ville » retiré : le filtre
ne garde que Lyon. »). Un filtre sur plusieurs valeurs garde son axe.

## 5. SQL

`forja_core.agent.compile` écrit une requête unique à partir de templates :

```sql
with base as (
    select
        cast(date_trunc('month', date_commande.date) as date) as mois,
        client.ville as ville,
        f.montant as _m_montant,
        f.id_commande as _m_nb_commandes
    from fct_ventes as f
    left join dim_date as date_commande on date_commande.date_key = f.date_commande_key
    left join dim_clients as client on client.client_key = f.client_key
    where client.segment = 'professionnel'
        and date_commande.date >= DATE '2024-01-01'
        and date_commande.date <= DATE '2024-12-31'
)
select mois, ville, sum(_m_montant) as montant, count(distinct _m_nb_commandes) as nb_commandes
from base
group by mois, ville
order by mois asc, montant desc, ville asc
```

Ratios : `cast(<numérateur> as double) / nullif(<dénominateur>, 0)` (arrondi à 2
décimales pour les montants), jamais `avg`. Métriques semi-additives : valeur à la
dernière date de chaque groupe. Les valeurs sont des littéraux échappés, issus de la
validation. La même requête, avec `{{ ref('fct_ventes') }}`, devient le modèle dbt publié.

## 6. Aperçu de vérification

| Élément | Contenu |
|---|---|
| `summary` | « Chiffre d'affaires et nombre de commandes par mois et par ville, sur 2024, clients segment professionnel. » |
| `preview.row_count`, `rows` | nombre de lignes et échantillon (`FORJA_MART_PREVIEW_ROWS`, 50) |
| `preview.pseudonymized` | colonnes personnelles pseudonymisées (toujours pour un analyst ; selon le plan pour un engineer) |
| `sql` | SQL compilé lisible |
| `controls` | voir ci-dessous |
| `summary_parts` | le résumé découpé : chaque élément du MartSpec (métrique, découpage, axe, période, filtre, limite) est un terme avec sa question et ses options |
| `option_counts` | pour une question en retour, ce que couvre chaque option : membres ayant la valeur (« 1 284 clients »), valeurs distinctes d'un attribut, total d'une métrique |

Les options d'un terme viennent de la couche sémantique et des données : autres métriques
du même fait, autres attributs de la dimension (« retirer cet axe »), années et
trimestres couverts, valeurs de l'attribut filtré (« retirer ce filtre »), 5, 10 ou 20
premiers. Corriger un terme crée une version `correction` dont le MartSpec choisi est
prévisualisé tel quel, sans parseur ni LLM.

Contrôles (`ok`, `info`, `warning`, `error`) :

- **réconciliation** : pour chaque métrique additive, total du data mart = total du fait
  sur le même périmètre (mêmes filtres et période, avant la limite de lignes) ; un écart
  (`error`) bloque la validation ; les métriques non additives sont signalées `info` ;
- **membre inconnu** : part des lignes du fait rattachées au membre « inconnu » (-1)
  d'une dimension utilisée (`warning` si non nulle) ;
- **colonnes vides** : entièrement (`warning`) ou partiellement (`info`) ;
- **résultat vide** : `error` (bloquant) qui dit pourquoi — période hors des données
  couvertes (« les données couvrent de 2013 à 2023 »), filtre trop restrictif — et
  propose quoi faire (`details.suggestions`) ; « Valider et publier » est désactivé ;
- **total et composantes** : quand la source a une colonne total qui est la somme
  d'autres colonnes (total = payant + gratuit, repéré au profilage), l'aperçu mesure
  l'écart sur le périmètre (lignes, total, par année) et le signale en `warning` ;
- **cohérence temporelle** : la réconciliation compare le data mart au fait *sur le même
  périmètre* et ne voit donc pas un périmètre lu sur la mauvaise date. `warning` si la date
  filtrée est remplie sur moins de 50 % des lignes du fait, ou si elle retient moins d'un
  cinquième des lignes que la date la mieux remplie donne sur la même période.

**Date lue.** Une période ou un découpage portent sur la **date principale** du fait,
choisie avec le modèle Gold (dans le grain, la plus remplie). Si la période n'a pas de
données sur elle mais en a sur une autre date du fait, l'agent demande laquelle. Le
résumé nomme toujours la date lue : « Fréquentation par région, en 2023 (année de
fréquentation). » Une date annuelle n'offre ni mois ni trimestre : un découpage plus fin
est ramené à l'année, et dit.

**Réponse dans la conversation** (`preview.insight`). Quand l'aperçu est prêt, la
conversation montre une phrase calculée du résultat (`agent/insight.py` : total, part du
premier, trois premiers ; pour une courbe, évolution, point haut, point bas et plus
forte variation d'un point au suivant, pour chaque mesure, et leur répartition ; jamais
écrite par le LLM, qui ne voit aucune valeur), un visuel choisi par la forme du résultat
(tuile pour une valeur, une courbe par mesure avec légende pour un axe de temps seul,
barres horizontales triées jusqu'à 15 membres, au-delà les 10 premiers et une barre
« Autres » avec le classement complet dépliable, tableau pour plusieurs axes), les dix
premières lignes dépliables (mesures avec séparateurs de milliers) et les actions : ouvrir l'aperçu, valider
et publier (Power BI, Superset, CSV, Parquet), exporter, affiner. Les valeurs
personnelles y sont pseudonymisées selon le rôle, comme dans l'échantillon. Graphiques :
décision D33.

## 7. Cycle de vie

| Statut | Signification |
|---|---|
| `drafted` | en cours de compréhension, ou question en attente de réponse |
| `previewed` | aperçu prêt |
| `validated` | validé par son auteur ; attend l'approbation si `FORJA_MART_REQUIRE_APPROVAL=true` |
| `published` | modèle construit, servi, exporté |
| `rejected` | rejeté par l'auteur ou un engineer |

Chaque question, réponse ou affinage crée une **version** (`iterations`) : texte
interprété, chemin, présélection et taille du contexte, appel LLM (tokens, durée),
MartSpec, Clarification ou refus, résumé, SQL, aperçu.

| Méthode | Route | Effet |
|---|---|---|
| `POST` | `/projects/{id}/mart-requests` | `{"question"}` : nouvelle demande (v1) |
| `GET` | `/projects/{id}/mart-requests` · `/mart-requests/{id}` | les siennes (toutes pour un engineer) |
| `POST` | `/mart-requests/{id}/answer` | `{"option": 0}` ou `{"text": "…"}` : répond à la question |
| `POST` | `/mart-requests/{id}/refine` | `{"instruction": "seulement le T1"}` : nouvelle version |
| `POST` | `/mart-requests/{id}/correct` | `{"version", "term", "option"}` : corrige un terme souligné |
| `POST` | `/mart-requests/{id}/validate` | `{"destination": "powerbi"}` (facultatif) : publie, ou attend l'approbation |
| `POST` | `/mart-requests/{id}/approve` | engineer : approuve et publie |
| `POST` | `/mart-requests/{id}/reject` | `{"reason"}` |

Un engineer (droit d'approuver) qui valide sa propre demande l'approuve du même coup
si `FORJA_MART_ALLOW_SELF_APPROVAL` le permet : vrai par défaut en mode local, faux en
mode multi, où un autre engineer approuve. L'aperçu garde les étapes de publication
(validé, en attente d'approbation quand elle a eu lieu, approuvé par, publié) ; chaque
décision est notifiée à l'auteur, le rejet avec son motif.

`GET /projects/{id}/mart-requests` renvoie une page (`limit`, `offset`, `status`) des
demandes les plus récemment modifiées ; par défaut chacune n'y porte que sa dernière
version, et la dernière avec un aperçu (`versions=all` pour l'historique complet, que
donne aussi `GET /mart-requests/{id}`).
`GET /projects/{id}/agent/overview` donne la date du dernier build Gold réussi et des
questions suggérées : écrites depuis la couche sémantique (métriques par défaut, axes
nommés, jamais de code ni d'identifiant), elles ne sont gardées que si le parseur les
comprend seul et qu'elles passent la validation, d'où un aperçu immédiat.

Une réponse par option fixe le sens du terme pour la suite de la demande (`bindings`) ;
une réponse libre remplace le terme dans la demande. Un affinage (« ajoute le nombre de
commandes », « seulement le T1 », « retire la ville », « par trimestre ») s'applique au
MartSpec de la dernière version prévisualisée ; un trimestre sans année prend celle de
la période courante.

## 8. Publication

Run `publish_mart` : modèle `models/marts/mart_<nom>.sql` (description = résumé, colonnes
documentées avec leur additivité), `dbt build --select mart_<nom>`, table enregistrée
(`layer = mart`, propriétaire, publiée), base serving reconstruite, exports
`exports/mart_<nom>.parquet|csv` pseudonymisés. Un data mart publié est conservé dans le
projet dbt à chaque régénération ; un affinage puis une nouvelle validation le
republient sous le même nom.

## Évaluation

`tests/agent_eval` : 20 questions sur la fixture e-commerce avec le résultat attendu —
9 simples (parseur seul), 5 formulations complexes (LLM), 4 ambiguës (Clarification
attendue), 2 hors périmètre (refus). Le score compare métriques, axes, granularité,
filtres (valeurs normalisées), période et limite.

```bash
uv run pytest tests/test_agent_eval.py                     # fournisseur simulé (CI)
uv run python -m tests.agent_eval                          # idem, rapport détaillé
uv run python -m tests.agent_eval --provider ollama --subset    # 5 questions, modèle local
uv run python -m tests.agent_eval --provider anthropic     # jeu complet, modèle cloud
```

Avec un vrai fournisseur le cache est désactivé : durée et tokens sont mesurés pour
chaque question.

| Fournisseur | Score | Sans LLM | Contexte moyen |
|---|---|---|---|
| simulé (20 questions) | 20/20 | 65 % (13/20) | 200 tokens |
| Ollama `qwen3.5:9b`, CPU (5 questions) | 5/5 | 2/5 | 193 tokens |

Passages Ollama successifs (Snapdragon X Plus, 32 Go, CPU seul, cache de Forja désactivé,
une question à la fois, aucun autre calcul en parallèle) :

| Passage | s02 | c01 | c03 | a04 | r01 | Score |
|---|---|---|---|---|---|---|
| 1 (étape 4) | ✓ parseur 0,6 s | ✗ 118 s | ✓ 122 s | ✗ 125 s | ✓ 118 s | 3/5 |
| 2 : indices du parseur, « vendus » | ✓ 0,6 s | ✓ 131 s | ✗ 136 s | ✓ parseur 0,1 s | ✓ 121 s | 4/5 |
| 3 : consigne resserrée, « argent » | ✓ 0,6 s | ✗ 127 s | ✓ 125 s | ✓ 0,1 s | ✓ 120 s | 4/5 |
| 4 : filtres locaux conservés | ✓ 0,6 s | ✓ 12 s* | ✓ 10 s* | ✓ 0,1 s | ✓ 5 s* | **5/5** |

Tokens par appel LLM : 1 566 à 1 671 lus (consigne, présélection et schéma JSON), 49 à
166 écrits. \* Au passage 4 les prompts étaient identiques au passage 3 et le modèle
était resté chargé : Ollama a réutilisé son propre cache de prompt. Les durées
représentatives à froid sont celles des passages 1 à 3 : **~2 min par appel** sur ce
CPU ; la réponse du modèle à c01 est identique à celle du passage 3.

Ce que chaque échec a appris :

- **c01** (« clientèle professionnelle ») : le modèle en faisait un axe, puis l'oubliait.
  Le parseur lui transmet ce qu'il a reconnu localement (« filtre sur client.segment,
  valeur telle qu'écrite », période, granularité ; jamais de valeur de données) et, si le
  modèle omet un filtre trouvé sur une valeur réelle des données ou la période, Forja le
  réintègre (sauf si le champ est utilisé comme axe) : la donnée est une preuve plus
  sûre que la lecture du modèle.
- **a04** (« les plus vendus ») : le modèle tranchait au lieu de demander. « vendus » sans
  métrique est désormais une question déterministe du parseur (chiffre d'affaires ou
  quantité ?), sans appel au modèle.
- **c03** (« rapporte le plus d'argent ») : une consigne trop prudente faisait demander
  « CA ou nombre de commandes ? ». La consigne ne demande plus qu'en cas de deux
  métriques également plausibles, et « argent » est un synonyme du chiffre d'affaires.

### Proposition du modèle en étoile par un LLM local (cas 1 bis)

Au retest du cas 1 bis, la proposition Gold de `qwen3.5:9b` (Ollama, CPU) était
« invalide après correction, 5 erreurs » et Forja retombait sur l'heuristique. Rejeu sur
la fixture de même forme (`tests/fixtures/attendance.py`), script de rejeu hors dépôt,
cache désactivé, Snapdragon X Plus, CPU seul :

| | Propositions valides | Essais | Erreurs |
|---|---|---|---|
| Avant (code de #5) | **0/1** | 2 sur 2 refusés | 2 à chaque essai, identiques : `[unknown_source]` — le modèle nommait la source par sa table Silver (`stg_entrees_et_categories_de_public`) au lieu de son nom de source |
| Après | **3/3** | 3 valides au premier essai | aucune ; mais les 3 prenaient `dateappellation` (remplie pour un tiers des lignes, hors grain) comme date principale, corrigé par Forja |

Le nombre d'erreurs diffère du constat (2 au lieu de 5) : le fichier réel a plus de
colonnes ; le message d'erreur journalisé ne disait pas lesquelles. Ce qui a changé :

- **consigne** : « nom de source, jamais le nom de table `stg_` » ;
- **boucle de réparation** : avant validation, les références de source écrites avec le
  nom de table ou une autre casse sont ramenées au nom de source ; la proposition est
  validée telle qu'elle sera enregistrée (dates principales et rôles complétés comme le
  fait l'heuristique) ; les erreurs sont journalisées (`gold_llm_proposal_invalid`,
  champ `issues`) et les trois premières citées dans l'avertissement du plan ;
- **schéma** : une date principale hors du grain ou remplie à moins de 50 % alors qu'une
  autre date du grain l'est est remplacée par celle-ci (règle MT-3), quelle que soit la
  proposition.

Durées : 142 s pour une proposition à chaud ; les autres mesures (2 102 s et plus) ont
été faussées par une mise en veille du poste pendant le rejeu et ne sont pas
représentatives. Tests : `tests/test_manual_case_1_batch_2.py::test_mt40_*`.

### Questions réelles du cas 1 bis (fixture « musées »)

`tests/agent_eval/museums.py` : les questions posées lors du retest manuel, sur la
fixture annuelle `tests/fixtures/attendance.py`, en mode parseur sans LLM
(`uv run python -m tests.agent_eval --museums`, et `tests/test_agent_eval.py` en CI) :

| Id | Question | Attendu |
|---|---|---|
| m01 | Fréquentation totale par région en 2023 | fréquentation par région, 2023 |
| m02 | ce cas parle de quoi ? et donne-moi la météo actuelle à Paris | réponse sur les données, météo écartée, ni version ni question |
| m03 | Évolution de la fréquentation payante et gratuite par année | entrées payantes et gratuites par année, sans la fréquentation totale |
| m04 | Top 10 des musées les plus visités en 2023 | fréquentation par musée, 2023, 10 premiers, aucun filtre |
| m05 | Nombre de musées labellisés par année | question sur « labellisés » (date d'appellation renseignée, par année d'appellation) |
| m06 | Nombre de musées par région, après le top 10 de 2023 | nouvelle question : nombre de musées par région, sans période ni limite |
| m07 | Combien de musées par région | nombre de musées par région |
| m08 | Fréquentation par année, après « … par région en 2023 » | nouvelle question : fréquentation par année |

Score : **1/8** (12 %) avant le lot 2 (code de #5 ; m05 et m07 partaient au LLM), **8/8** (100 %) après, toutes par le parseur.

Limite : avec un modèle 9b sur CPU, le résultat d'une question peut changer quand la
consigne change, même à température 0. Les garde-fous déterministes (questions du
parseur, filtres conservés, validation stricte) rendent le résultat moins dépendant du
modèle ; le jeu complet de 20 questions reste à passer sur un modèle cloud
(`--provider anthropic`).
