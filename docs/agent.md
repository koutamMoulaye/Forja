# Agent métier

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

## 1. Présélection locale

`forja_core.agent.vocabulary` indexe les libellés, synonymes et noms des métriques,
dimensions et attributs visibles, ainsi que les **valeurs distinctes** des attributs
filtrables (texte, non personnels, au plus 5 000 valeurs), lues dans les tables Gold.
La demande est normalisée (minuscules, sans accents, apostrophes et ponctuation retirées,
lemmes simples : pluriels, participes « livrées » → « livré ») puis comparée aux
expressions de l'index (plus longue correspondance d'abord, tolérance aux fautes de
frappe sur les mots de 5 lettres et plus).

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
  pires` (croissant), tri `par <métrique>` ;
- **métriques**, **axes** (`par ville`, `par catégorie et segment`, `des produits`) et
  **filtres** par valeur (`à Lyon`, `livrées`, `clients de Lyon et Paris` → `in`, `hors
  jardin` → `neq`, `segment Pro` → préfixe unique d'une valeur de l'attribut nommé).

Il est **confiant** quand chaque mot significatif est expliqué (mots vides et mots de
liaison connus mis à part). Un mot qui désigne plusieurs métriques (« ventes » : chiffre
d'affaires ou quantité ?) ou une métrique et un attribut (« prix » : prix moyen de
vente ou prix catalogue ?) produit directement une Clarification. Sinon, le LLM est
appelé ; **sans LLM configuré**, Forja pose une question sur le mot inconnu (options
proches + « Ignorer ») ou refuse si rien n'en approche. La réponse indique le chemin
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

Contrôles (`ok`, `info`, `warning`, `error`) :

- **réconciliation** : pour chaque métrique additive, total du data mart = total du fait
  sur le même périmètre (mêmes filtres et période, avant la limite de lignes) ; un écart
  (`error`) bloque la validation ; les métriques non additives sont signalées `info` ;
- **membre inconnu** : part des lignes du fait rattachées au membre « inconnu » (-1)
  d'une dimension utilisée (`warning` si non nulle) ;
- **colonnes vides** : entièrement (`warning`) ou partiellement (`info`) ;
- **période vide** : `warning` avec la période couverte par les données.

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
| `POST` | `/mart-requests/{id}/validate` | valide l'aperçu ; publie, ou attend l'approbation |
| `POST` | `/mart-requests/{id}/approve` | engineer : approuve et publie |
| `POST` | `/mart-requests/{id}/reject` | `{"reason"}` |

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
| Ollama `qwen3.5:9b`, CPU (5 questions) | 3/5 | 1/5 | 200 tokens |

Mesures Ollama (Snapdragon X Plus, 32 Go, CPU seul, cache désactivé) : contexte
présélectionné ~200 tokens, prompt complet lu par le modèle 1 506 à 1 531 tokens
(consigne et schéma JSON compris), 49 à 137 tokens écrits, **118 à 125 s par appel**. La
question simple (s02) passe par le parseur en 0,6 s. Réussites : top 1 des catégories
(c03), refus de la météo (r01). Échecs : « clientèle professionnelle » traitée comme un
axe au lieu d'un filtre (c01), et « les 5 produits les plus vendus » deviné en chiffre
d'affaires au lieu de demander (a04).

Correctifs apportés ensuite, validés par le jeu simulé mais **pas encore mesurés sur
Ollama** (le second passage a été interrompu, faute de mémoire sur la machine) : le
parseur transmet au modèle ce qu'il a reconnu localement (« filtre sur client.segment,
valeur telle qu'écrite », période, granularité, sans valeur de données), la consigne
précise qu'un mot désignant une valeur est un filtre, et « vendus » sans métrique
devient une question déterministe (chiffre d'affaires ou quantité ?) posée par le
parseur. À relancer : `uv run python -m tests.agent_eval --provider ollama --subset`.
