# Profiling

Chaque table Bronze est profilée juste après l'ingestion. Le rapport (`ProfileReport`)
est stocké dans le catalogue et exposé par `GET /sources/{id}/profile`. Les colonnes
techniques sont exclues des statistiques, sauf `_row_hash` utilisé pour les doublons.

## Valeurs nulles

Une valeur est nulle si elle est `NULL` ou, pour une colonne texte, vide ou composée
uniquement d'espaces.

## Inférence de types

Pour les colonnes natives (Parquet, Excel, JSON typé), le type DuckDB est repris tel quel.
Pour les colonnes texte, les valeurs distinctes (jusqu'à `FORJA_PROFILING_SAMPLE_SIZE`)
sont testées, pondérées par leur nombre d'occurrences. Un type est retenu si au moins
`FORJA_PROFILING_TYPE_THRESHOLD` (95 % par défaut) des valeurs le respectent, dans cet ordre :

| Type | Règle |
|---|---|
| `boolean` | au plus 2 valeurs parmi true/false, vrai/faux, oui/non, yes/no, y/n, t/f |
| `integer` | entiers ; **exclus** si une valeur commence par `0` ou `+` (codes postaux, téléphones, identifiants) |
| `decimal` | séparateur décimal déduit des valeurs : `12,5`, `1 234,56`, `1.234,56` (FR) ou `12.5`, `1,234.56` (EN) |
| `date` | `%Y-%m-%d`, `%d/%m/%Y`, `%m/%d/%Y`, `%d-%m-%Y`, `%d.%m.%Y`, `%Y/%m/%d`, `%d/%m/%y` |
| `datetime` | variantes avec heure et ISO 8601 (avec fuseau) |
| `string` | sinon |

En cas d'ambiguïté jour/mois (`01/02/2024`), le format jour-en-premier l'emporte ; il
suffit d'une valeur comme `12/31/2024` pour basculer en format américain.

Le rapport indique `match_ratio` (part des valeurs conformes) et le `format` / le
`decimal_separator` retenus : ce sont exactement les paramètres de conversion à utiliser
en Silver. Si une colonne texte est conforme à un type pour 60 à 95 % de ses valeurs,
`near_type` et `near_type_ratio` le signalent (ex. dates mêlées de « inconnu »).

Les statistiques min / max / moyenne / écart-type sont calculées sur les valeurs
converties (une colonne `1 234,56` donne bien `1234.56`).

## Clés candidates

- **Simples** : colonne sans nul dont toutes les valeurs sont distinctes.
- **Composites** : paires de colonnes non uniques seules, sans nul, dont la combinaison
  est unique (au plus `FORJA_PROFILING_MAX_KEY_COLUMNS` colonnes examinées, triées par
  cardinalité).
- Types éligibles : entier, texte, date, datetime. Aucune clé n'est proposée si la table
  contient des doublons exacts.

## Doublons exacts

`duplicate_rows` = nombre de lignes − nombre de `_row_hash` distincts ;
`duplicate_groups` = nombre de lignes distinctes présentes plusieurs fois.

## Données personnelles

Analyse des colonnes texte. La confiance est dans [0, 1], le niveau est `high` (≥ 0,8),
`medium` (≥ 0,5) ou `low`. Seules les détections ≥ 0,3 sont rapportées.

| Type | Méthode |
|---|---|
| `email` | expression régulière ; confiance = part des valeurs conformes (+0,1 si le nom de colonne l'évoque : mail, courriel) |
| `phone` | formats français (`06 12 34 56 78`, `+33 6…`, `01.23…`) et E.164 ; +0,1 si tel/téléphone/phone/mobile… |
| `iban` | structure IBAN **et** clé de contrôle mod-97 ; +0,1 si iban/rib |
| `first_name`, `last_name`, `full_name` | nom de colonne (prénom, nom, last_name, surname…), forme des valeurs (mots alphabétiques capitalisés) et dictionnaire de prénoms courants ; sans indice dans le nom de colonne, une détection par dictionnaire reste au plus `medium` |

Les noms de colonnes contenant un qualificatif non personnel (`nom_produit`, `ville`,
`societe`…) ne sont pas traités comme des noms de personnes. Le rapport ne contient
jamais d'exemple de valeur détectée, seulement la méthode et le taux de correspondance.

## Score qualité

```
score = 35 × complétude + 25 × unicité + 25 × validité + 15 × identifiabilité
```

| Composante | Calcul |
|---|---|
| complétude | 1 − taux moyen de nulls par colonne |
| unicité | 1 − taux de lignes en doublon exact |
| validité | moyenne, par colonne, de la part des valeurs conformes au type inféré (`near_type_ratio` si présent) |
| identifiabilité | 1 si une clé simple existe, 0,7 si seulement composite, 0 sinon |

Le rapport `quality` détaille chaque composante (poids, score, points, explication) et
liste les problèmes rencontrés : colonnes vides ou majoritairement nulles, colonnes
constantes, doublons, absence de clé, types incohérents, présence de données personnelles.
