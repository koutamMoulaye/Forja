# Couche sémantique

La couche sémantique donne des noms métier au modèle Gold appliqué : ce que l'agent
comprend, ce que le futur front affichera, ce que les analysts manipulent. Elle est
générée par des règles déterministes (`forja_core.semantic.generate`), versionnée dans le
catalogue et éditable par un engineer.

## Contenu

### Métriques

| Champ | Exemple (`prix_moyen`) |
|---|---|
| `name`, `label`, `description` | `prix_moyen`, « Prix moyen unitaire » |
| `fact` | `fct_ventes` |
| `kind` | `aggregate` (agrégat d'une colonne du fait) ou `ratio` (de deux métriques) |
| `aggregation`, `column` | agrégats : `sum`, `count`, `count_distinct`, `min`, `max` |
| `numerator`, `denominator` | ratios : `montant`, `quantite` |
| `formula` | `sum(montant) / sum(quantite)` |
| `additivity` | `additive`, `semi_additive`, `non_additive` |
| `non_additive_dimensions` | semi-additives : les dimensions temporelles |
| `unit`, `format` | `EUR`, `currency` |
| `synonyms`, `hidden`, `default` | `["prix moyen", "prix unitaire moyen", …]` |

Règles de génération :

- une mesure Gold `sum` devient une métrique additive (`semi_additive` si son nom évoque
  un solde : stock, solde, encours, effectif) ; `count` est additive ; `count_distinct`,
  `min`, `max` sont non additives ;
- l'identifiant d'un en-tête joint au fait (l'`id_commande` des lignes) donne un comptage
  distinct : `nb_commandes`, « Nombre de commandes » (non additif : une commande couvre
  plusieurs produits) ;
- **une valeur non additive est toujours le ratio de deux métriques additives, jamais
  une moyenne de moyennes** : `prix_moyen = sum(montant) / sum(quantite)` (prix pondéré
  par les quantités), `panier_moyen = sum(montant) / count_distinct(id_commande)`. Le
  plan Gold heuristique déclare donc le prix unitaire avec l'agrégation `none` (et non
  plus `avg`) : il sert à calculer `montant` ligne à ligne, il n'est jamais agrégé ;
- une mesure `avg` ou `none` sans montant ni quantité devient le ratio de sa somme par
  le nombre de lignes du fait ;
- libellés et synonymes français : un vocabulaire commun (`montant` → « Chiffre
  d'affaires », synonymes CA, ventes, recettes… ; `quantite` → « Quantité vendue ») et,
  à défaut, un libellé dérivé du nom (`date_commande` → « Date de commande »).

### Dimensions et attributs

| Type | Source | Exemple |
|---|---|---|
| `standard` | une dimension Gold reliée au fait par une clé étrangère | `client` (dim_clients, `client_key`) |
| `degenerate` | les dimensions dégénérées gardées sur le fait | `commande` (id_commande, num_ligne, statut) |
| `time` | un rôle de `dim_date` par clé de date du fait | `date_commande` |

Chaque attribut porte un libellé, un type (`text`, `number`, `date`, `boolean`), ses
synonymes, `pii` (type de donnée personnelle hérité du plan Silver) et `filterable` :
un attribut texte non personnel dont les valeurs distinctes peuvent être lues
**localement** pour résoudre un filtre (« Lyon » → `client.ville = 'Lyon'`). Une dimension
historisée (SCD2) est marquée `historized` : ses attributs sont ceux valides à la date
du fait. `display_attribute` désigne l'attribut utilisé quand on demande la dimension
par son nom (« par produit » → `produit.libelle`).

Hiérarchies générées : calendrier `annee > trimestre > mois > date` pour chaque
dimension temporelle, géographie (`pays > region > departement > ville`) et catalogue
(`categorie > sous_categorie > libelle`) quand les attributs existent.

### Références

Une métrique se désigne par son nom (`montant`), un attribut par
`dimension.attribut` (`client.ville`), une dimension temporelle par son nom
(`date_commande`) ; les granularités sont `jour`, `semaine`, `mois`, `trimestre`, `annee`.

## Versions et éditions

- La couche est régénérée à la fin de chaque `build_gold` réussi (étape du run, avant
  qu'il soit annoncé terminé) et sur demande (`POST /projects/{id}/semantic-layer/regenerate`).
  Une nouvelle version n'est créée que si le modèle Gold ou les éditions ont changé.
- Un engineer édite par `PATCH /projects/{id}/semantic-layer` une liste d'**overrides** :
  `target` (`metric:montant`, `dimension:client`, `attribute:client.ville`), `label`,
  `description`, `synonyms` (remplace), `add_synonyms` (ajoute), `hidden`. Les overrides
  sont stockés à part (`semantic_overrides`) et réappliqués à chaque régénération : une
  édition manuelle n'est jamais écrasée. Un override dont la cible disparaît du Gold est
  conservé et signalé dans les logs (`semantic_overrides_orphaned`).
- Un élément masqué (`hidden`) disparaît pour les analysts et pour l'agent ; les
  engineers le voient avec son indicateur.

## Propositions de synonymes

Un analyst (souvent après une question de l'agent) propose un synonyme :
`POST /projects/{id}/semantic-layer/synonym-proposals`
(`{"target": "metric:montant", "synonym": "encaissements", "mart_request_id": …}`).
Un engineer l'accepte (`POST /synonym-proposals/{id}/accept`, le synonyme est ajouté par
un override et une nouvelle version est créée) ou la refuse.

## API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/projects/{id}/semantic-layer?version=` | tous (sans les éléments masqués pour les analysts) |
| `GET` | `/projects/{id}/semantic-layer/versions` | tous |
| `PATCH` | `/projects/{id}/semantic-layer` | engineer |
| `POST` | `/projects/{id}/semantic-layer/regenerate` | engineer |
| `POST` / `GET` | `/projects/{id}/semantic-layer/synonym-proposals` | tous (un analyst voit les siennes) |
| `POST` | `/synonym-proposals/{id}/accept` · `/reject` | engineer |

## Exemple : la boutique e-commerce

| Métrique | Formule | Additivité |
|---|---|---|
| Chiffre d'affaires (EUR) | `sum(montant)` | additive |
| Quantité vendue (unités) | `sum(quantite)` | additive |
| Nombre de lignes | `sum(nb_lignes)` | additive |
| Nombre de commandes | `count_distinct(id_commande)` | non additive |
| Panier moyen (EUR) | `sum(montant) / count_distinct(id_commande)` | non additive |
| Prix moyen unitaire (EUR) | `sum(montant) / sum(quantite)` | non additive |

Dimensions : `client` (id_client, nom, prenom, email personnels ; ville, segment,
date_inscription), `produit` (code_produit, libelle, categorie, prix_unitaire, actif ;
hiérarchie catégorie > produit), `commande` (dégénérée : id_commande, num_ligne,
statut), `date_commande` (calendrier).
