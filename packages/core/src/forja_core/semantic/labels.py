"""French business labels and synonyms derived from column names.

The vocabulary is small and generic (sales, customers, products); an engineer
completes it through overrides, and an analyst can propose synonyms.
"""

from __future__ import annotations

from forja_core.profiling.pii import column_tokens

_WORDS = {
    "id": "identifiant",
    "num": "numéro",
    "numero": "numéro",
    "no": "numéro",
    "nb": "nombre",
    "prenom": "prénom",
    "libelle": "libellé",
    "categorie": "catégorie",
    "quantite": "quantité",
    "telephone": "téléphone",
    "adresse": "adresse",
    "annee": "année",
    "debut": "début",
    "premiere": "première",
    "frais": "frais",
    "remise": "remise",
    "region": "région",
    "departement": "département",
    "societe": "société",
    "unitaire": "unitaire",
    "inscription": "inscription",
    "livraison": "livraison",
}
_VOWELS = tuple("aeiouyéèh")

# Business labels of common measures (otherwise derived from the name).
METRIC_LABELS: dict[str, str] = {
    "montant": "Chiffre d'affaires",
    "montant_ttc": "Chiffre d'affaires TTC",
    "montant_ht": "Chiffre d'affaires HT",
    "quantite": "Quantité vendue",
}
# Synonyms by token of the column name (or of the metric name).
METRIC_SYNONYMS: dict[str, list[str]] = {
    "montant": [
        "chiffre d'affaires", "CA", "ventes", "revenu", "recettes", "montant des ventes",
        "montant", "total des ventes", "argent",
    ],
    "quantite": [
        "quantité", "quantité vendue", "quantités", "volume", "unités vendues",
        "articles vendus", "nombre d'articles", "ventes",
    ],
    "nb_lignes": ["nombre de lignes", "lignes de commande", "nombre de lignes de commande"],
    "prix_moyen": ["prix moyen", "prix unitaire moyen", "prix de vente moyen", "prix"],
    "panier_moyen": [
        "panier moyen", "valeur moyenne des commandes", "montant moyen par commande",
        "ticket moyen",
    ],
}  # fmt: skip
ATTRIBUTE_SYNONYMS: dict[str, list[str]] = {
    "ville": ["ville", "localité", "commune", "city"],
    "segment": ["segment", "type de client", "typologie de client", "clientèle"],
    "categorie": ["catégorie", "famille", "rayon", "gamme", "catégorie de produit"],
    "libelle": ["produit", "article", "libellé", "désignation", "nom du produit"],
    "statut": ["statut", "état"],
    "pays": ["pays"],
    "region": ["région"],
    "actif": ["actif", "produit actif", "référencé"],
    "canal": ["canal", "canal de vente"],
    "prix": ["prix", "prix catalogue", "tarif"],
}
DIMENSION_SYNONYMS: dict[str, list[str]] = {
    "client": ["client", "acheteur", "clientèle"],
    "produit": ["produit", "article", "référence"],
    "commande": ["commande"],
    "magasin": ["magasin", "boutique", "point de vente"],
    "fournisseur": ["fournisseur"],
}
DATE_ATTRIBUTES: dict[str, tuple[str, str]] = {
    "date": ("Date", "date"),
    "annee": ("Année", "number"),
    "trimestre": ("Trimestre", "number"),
    "mois": ("Mois (numéro)", "number"),
    "nom_mois": ("Mois", "text"),
    "semaine_iso": ("Semaine ISO", "number"),
    "jour": ("Jour du mois", "number"),
    "nom_jour": ("Jour de la semaine", "text"),
    "est_week_end": ("Week-end", "boolean"),
}
# Hierarchies, from the coarsest level to the finest, matched on attribute tokens.
HIERARCHIES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("geographie", "Géographie", ("pays", "region", "departement", "ville")),
    ("catalogue", "Catalogue", ("categorie", "sous_categorie", "libelle")),
)


def _word(token: str) -> str:
    return _WORDS.get(token, token)


def _of(word: str) -> str:
    return f"d'{word}" if word.startswith(_VOWELS) else f"de {word}"


def label(name: str) -> str:
    """``date_commande`` → « Date de commande », ``id_client`` → « Identifiant client »."""
    parts = [t for t in name.split("_") if t]
    if not parts:
        return name
    if len(parts) > 1 and parts[0] in ("date", "num", "numero", "nb", "nombre"):
        head = {"date": "date", "num": "numéro", "numero": "numéro"}.get(parts[0], "nombre")
        rest = " ".join(_word(p) for p in parts[1:])
        text = f"{head} {_of(rest)}"
    else:
        text = " ".join(_word(p) for p in parts)
    return text[:1].upper() + text[1:]


def tokens(name: str) -> set[str]:
    return column_tokens(name)[1] | set(name.split("_"))


def attribute_synonyms(name: str) -> list[str]:
    found: list[str] = []
    for token in name.split("_"):
        found += ATTRIBUTE_SYNONYMS.get(token, [])
    return list(dict.fromkeys(found))


def dimension_synonyms(entity: str) -> list[str]:
    return list(DIMENSION_SYNONYMS.get(entity, [entity]))


def entity_label(entity: str) -> str:
    text = " ".join(_word(p) for p in entity.split("_"))
    return text[:1].upper() + text[1:]


def plural(word: str) -> str:
    if word.endswith(("s", "x", "z")):
        return word
    if word.endswith("al"):
        return word[:-2] + "aux"
    return word + "s"
