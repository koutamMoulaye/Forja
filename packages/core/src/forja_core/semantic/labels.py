"""French business labels and synonyms derived from column names.

The vocabulary is small and generic (sales, customers, products); an engineer
completes it through overrides, and an analyst can propose synonyms.
"""

from __future__ import annotations

from forja_core.profiling.naming import name_words
from forja_core.profiling.pii import column_tokens
from forja_core.utils import strip_accents

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
    "musee": "musée",
    "entree": "entrée",
    "entrees": "entrées",
    "frequentation": "fréquentation",
    "periode": "période",
    "ecole": "école",
    "eleve": "élève",
    "eleves": "élèves",
    "etablissement": "établissement",
    "activite": "activité",
    "creation": "création",
    "operation": "opération",
    "siege": "siège",
    "electricite": "électricité",
    "energie": "énergie",
    "theatre": "théâtre",
    "cinema": "cinéma",
    "evenement": "événement",
    "categories": "catégories",
    "duree": "durée",
    "cout": "coût",
    "ferme": "fermé",
    "insee": "INSEE",
    "tva": "TVA",
    "ht": "HT",
    "ttc": "TTC",
    "siren": "SIREN",
    "siret": "SIRET",
    "naf": "NAF",
    "ape": "APE",
}
# Heads of a name that read « <head> de <rest> »: date_commande, annee_fermeture.
_HEADS = {
    "date": "date",
    "num": "numéro",
    "numero": "numéro",
    "nb": "nombre",
    "nombre": "nombre",
    "annee": "année",
    "mois": "mois",
}
# Level of a time dimension, as the head of its label.
TIME_HEADS = {"day": "Date", "month": "Mois", "quarter": "Trimestre", "year": "Année"}
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
    "nb_lignes": ["nombre de lignes"],
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
# Other names of a hierarchy: « par géographie » reads its coarsest level.
HIERARCHY_SYNONYMS: dict[str, list[str]] = {
    "geographie": ["géographie", "zone géographique", "territoire", "localisation"],
    "catalogue": ["catalogue", "gamme de produits"],
}
# Hierarchies, from the coarsest level to the finest, matched on attribute tokens.
HIERARCHIES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("geographie", "Géographie", ("pays", "region", "departement", "ville")),
    ("catalogue", "Catalogue", ("categorie", "sous_categorie", "libelle")),
)


# French words for common English column names: proposed as synonyms, for an engineer
# to accept, so that a question asked in French finds columns named in English.
ENGLISH_WORDS: dict[str, list[str]] = {
    "amount": ["montant"], "revenue": ["chiffre d'affaires", "revenu"], "sales": ["ventes"],
    "sale": ["vente"], "turnover": ["chiffre d'affaires"], "price": ["prix", "tarif"],
    "cost": ["coût"], "profit": ["bénéfice"], "margin": ["marge"], "discount": ["remise"],
    "tax": ["taxe"], "quantity": ["quantité"], "qty": ["quantité"], "count": ["nombre"],
    "total": ["total"], "customer": ["client"], "client": ["client"], "order": ["commande"],
    "invoice": ["facture"], "payment": ["paiement"], "product": ["produit", "article"],
    "item": ["article"], "category": ["catégorie"], "brand": ["marque"],
    "supplier": ["fournisseur"], "vendor": ["fournisseur"], "store": ["magasin"],
    "shop": ["boutique"], "date": ["date"], "year": ["année"], "month": ["mois"],
    "week": ["semaine"], "day": ["jour"], "city": ["ville"], "country": ["pays"],
    "region": ["région"], "address": ["adresse"], "name": ["nom"], "status": ["statut"],
    "channel": ["canal"], "employee": ["employé"], "shipping": ["livraison"],
    "delivery": ["livraison"], "unit": ["unité"], "weight": ["poids"], "phone": ["téléphone"],
    "segment": ["segment"], "label": ["libellé"], "description": ["description"],
}  # fmt: skip
# Compounds whose French word order is not "head de modifier".
ENGLISH_PHRASES: dict[str, list[str]] = {
    "unit_price": ["prix unitaire"], "total_amount": ["montant total"],
    "net_amount": ["montant net"], "gross_amount": ["montant brut"],
    "total_price": ["prix total"], "line_count": ["nombre de lignes"],
    "first_name": ["prénom"], "last_name": ["nom de famille"], "zip_code": ["code postal"],
    "postal_code": ["code postal"], "order_count": ["nombre de commandes"],
}  # fmt: skip
_FRENCH_VOCABULARY = (METRIC_SYNONYMS, ATTRIBUTE_SYNONYMS, DIMENSION_SYNONYMS)
MAX_TRANSLATIONS = 6


def _english(token: str) -> list[str] | None:
    if token in ENGLISH_WORDS:
        return ENGLISH_WORDS[token]
    if token.endswith("s") and token[:-1] in ENGLISH_WORDS:  # customers, orders
        return ENGLISH_WORDS[token[:-1]]
    return None


def french_synonyms(name: str) -> list[str]:
    """French synonyms of an English name (``amount`` → montant, chiffre d'affaires...).

    A single word brings its translations and the French vocabulary of the first one
    (``amount`` → the synonyms of ``montant``); two words read as "modifier head"
    (``order_date`` → date de commande). Empty for a name that is not English."""
    if name in ENGLISH_PHRASES:
        return list(ENGLISH_PHRASES[name])
    parts = [p for p in name.split("_") if p]
    translated = [_english(p) for p in parts]
    if not parts or any(t is None for t in translated):
        return []
    words = [t for t in translated if t is not None]
    if len(words) == 1:
        found = list(words[0])
        vocabulary_key = strip_accents(found[0]).replace(" ", "_")
        for vocabulary in _FRENCH_VOCABULARY:
            found += vocabulary.get(vocabulary_key, [])
    elif len(words) == 2:
        found = [f"{head} {_of(modifier)}" for head in words[1][:1] for modifier in words[0][:1]]
    else:
        return []
    return list(dict.fromkeys(s for s in found if s != name))[:MAX_TRANSLATIONS]


def _word(token: str) -> str:
    return _WORDS.get(token, token)


def _of(word: str) -> str:
    return f"d'{word}" if word.startswith(_VOWELS) else f"de {word}"


def of(word: str) -> str:
    """« d'entrées », « de musées »: the French « de » before a noun."""
    return _of(word)


# Words around numbers in a name: ``moins_18_ans`` reads « moins de 18 ans ».
_BOUNDS = {"moins": "moins de", "plus": "plus de", "sup": "plus de", "inf": "moins de"}
_NUMBER_WORDS = frozenset({"ans", "an", "de", "et", "a", "mois", "jours", "h", "km", "m"})


def _with_numbers(parts: list[str]) -> list[str]:
    """Numbers kept and read: ``18 25 ans`` → « 18-25 ans », ``moins 18 ans`` →
    « moins de 18 ans », ``plus de 65 ans`` → « plus de 65 ans »."""
    out: list[str] = []
    for index, part in enumerate(parts):
        joined = index > 0 and parts[index - 1].isdigit() and out and out[-1][-1:].isdigit()
        if part.isdigit() and joined:
            out[-1] = f"{out[-1]}-{part}"
            continue
        if (
            part in _BOUNDS
            and index + 1 < len(parts)
            and (parts[index + 1].isdigit() or parts[index + 1] == "de")
        ):
            out.append(_BOUNDS[part] if parts[index + 1].isdigit() else part)
            continue
        out.append(part)
    return out


def _has_number(parts: list[str]) -> bool:
    return any(p.isdigit() for p in parts)


def label(name: str) -> str:
    """``date_commande`` → « Date de commande », ``id_client`` → « Identifiant client »,
    ``dateappellation`` → « Date d'appellation », ``nom_du_musee`` → « Nom du musée »,
    ``_18_25_ans`` → « 18-25 ans », ``moins_18_ans`` → « Moins de 18 ans »."""
    parts = [t for t in name_words(name) if t]
    if not parts:
        return name
    if _has_number(parts):
        text = " ".join(_word(p) for p in _with_numbers(parts))
        return text if text[:1].isdigit() else text[:1].upper() + text[1:]
    if len(parts) > 1 and parts[0] in _HEADS:
        rest = " ".join(_word(p) for p in parts[1:])
        text = f"{_HEADS[parts[0]]} {_of(rest)}"
    else:
        text = " ".join(_word(p) for p in parts)
    return text[:1].upper() + text[1:]


def time_label(level: str, role: str, column: str) -> str:
    """« Année de fréquentation », « Date de commande », « Date d'appellation »."""
    if not role:
        return label(column)
    words = " ".join(_word(w) for w in role.split())
    return f"{TIME_HEADS.get(level, 'Date')} {_of(words)}"


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
    text = " ".join(_word(p) for p in name_words(entity))
    return text[:1].upper() + text[1:]


def _feminine_plural(word: str) -> str:
    """payant → payantes, individuel → individuelles, scolaire → scolaires."""
    if word.endswith("s"):
        return word
    if word.endswith("el"):
        return word + "les"
    if word.endswith("e"):
        return word + "s"
    return word + "es"


def qualifier(measure: str) -> str:
    """What a measure adds to its count: « payantes », « 18-25 ans », « moins de 18 ans »."""
    words = [w for w in name_words(measure) if w]
    if _has_number(words):
        return " ".join(_word(w) for w in _with_numbers(words))
    return " ".join(_feminine_plural(_word(w)) for w in words)


def qualified_count(unit: str, measure: str) -> str:
    """« Entrées payantes » for the measure payant of a count of entrées, « Entrées
    18-25 ans » for ``_18_25_ans``: the numbers of a name are kept."""
    if not [w for w in name_words(measure) if w]:
        return label(measure)
    return f"{unit[:1].upper()}{unit[1:]} {qualifier(measure)}"


def qualified_synonyms(unit: str, measure: str, count_synonyms: list[str]) -> list[str]:
    """Other names of a qualified count: « fréquentation payante », « visiteurs payants »,
    « payantes », so that « fréquentation payante et gratuite » finds both measures."""
    words = [w for w in name_words(measure) if w]
    if not words or _has_number(words):
        text = qualifier(measure)
        return [text, f"{unit} {text}"] if words else []
    masculine = " ".join(_word(w) for w in words)
    feminine = " ".join(_feminine(_word(w)) for w in words)
    found = [f"{unit} {qualifier(measure)}", masculine, feminine]
    for synonym in count_synonyms:
        head = synonym.split(" ")[0]
        if " " in synonym or head in ("total", "totale"):
            continue  # « nombre d'entrées », « total des entrées »: not qualified this way
        singular_head = head.removesuffix("s")
        feminine_head = singular_head.endswith(("tion", "ence", "ance", "ée", "ite", "té"))
        found.append(f"{head} {feminine if feminine_head else masculine}")
    return list(dict.fromkeys(found))


def _feminine(word: str) -> str:
    """payant → payante, gratuit → gratuite, individuel → individuelle, scolaire."""
    if word.endswith(("e", "s", "x")):
        return word
    if word.endswith("el"):
        return word + "le"
    return word + "e"


def plural(word: str) -> str:
    if word.endswith(("s", "x", "z")):
        return word
    if word.endswith("al"):
        return word[:-2] + "aux"
    return word + "s"
