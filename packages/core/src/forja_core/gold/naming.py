"""Business names read from the content of a source: the process a fact records, the
entity a dimension describes, what its counts count.

Names come from the words of the source and column names against a small, generic
vocabulary of processes (sales, attendance, consumption...). Nothing is specific to a
dataset: a file of entries and visitors is an attendance (``fct_frequentation``),
whatever the venues; a file of order lines is sales (``fct_ventes``). Without a match
the source name is kept. Every name stays editable in the plan.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from forja_core.profiling.naming import IDENTIFIER_TOKENS, name_words
from forja_core.relations.naming import singular

_STOPWORDS = frozenset(
    {"et", "de", "des", "du", "la", "le", "les", "d", "l", "a", "au", "aux", "en", "par",
     "pour", "sur", "the", "of", "and", "by", "per", "stg", "src", "data", "donnees",
     "export", "extract", "fichier", "table", "liste", "base"}
)  # fmt: skip


@dataclass(frozen=True)
class Process:
    """A business process recognized from the words of a source."""

    fact: str
    label: str
    words: frozenset[str]
    count_unit: str = ""
    """What a count of this process counts (« entrées »), for the units of metrics."""
    count_synonyms: tuple[str, ...] = ()
    """Business names of the main count (« fréquentation », « entrées », « visiteurs »)."""
    count_label: str = ""
    amount_label: str = ""
    """Label of the main amount of the process (« Chiffre d'affaires » of sales)."""
    amount_synonyms: tuple[str, ...] = ()


PROCESSES: tuple[Process, ...] = (
    Process(
        fact="ventes",
        label="vente",
        words=frozenset(
            {
                "ligne",
                "line",
                "commande",
                "order",
                "vente",
                "sale",
                "facture",
                "invoice",
                "achat",
                "ticket",
                "panier",
            }
        ),
        amount_label="Chiffre d'affaires",
        amount_synonyms=(
            "chiffre d'affaires",
            "ca",
            "ventes",
            "revenu",
            "recettes",
            "montant des ventes",
            "total des ventes",
            "montant vendu",
        ),
    ),
    Process(
        fact="frequentation",
        label="fréquentation",
        words=frozenset(
            {
                "entree",
                "visite",
                "visiteur",
                "frequentation",
                "public",
                "spectateur",
                "billet",
                "billetterie",
                "affluence",
                "audience",
                "passage",
                "scolaire",
                "payant",
                "gratuit",
                "attendance",
                "visitor",
                "admission",
            }
        ),
        count_unit="entrées",
        count_synonyms=(
            "fréquentation",
            "fréquentation totale",
            "entrées",
            "nombre d'entrées",
            "total des entrées",
            "visiteurs",
            "nombre de visiteurs",
            "visites",
            "nombre de visites",
            "affluence",
        ),
        count_label="Fréquentation",
    ),
    Process(
        fact="paiements",
        label="paiement",
        words=frozenset(
            {"paiement", "payment", "reglement", "versement", "encaissement", "transaction"}
        ),
        amount_label="Montant payé",
        amount_synonyms=(
            "montant payé",
            "montant total payé",
            "total payé",
            "montant des paiements",
            "paiements",
            "montant réglé",
            "encaissements",
        ),
    ),
    Process(
        fact="avis",
        label="avis",
        words=frozenset(
            {"avis", "review", "rating", "evaluation", "feedback", "notation", "satisfaction"}
        ),
    ),
    Process(
        fact="consommation",
        label="consommation",
        words=frozenset({"conso", "consommation", "consumption", "energie", "electricite"}),
    ),
    Process(
        fact="effectifs",
        label="effectif",
        words=frozenset({"effectif", "eleve", "inscrit", "etudiant", "salarie", "headcount"}),
        count_unit="personnes",
    ),
)
# How many words of a process a source must use (its name and its columns together).
_MIN_WORDS = 2


def _lemmas(names: Iterable[str]) -> list[str]:
    return [singular(w) for name in names for w in name_words(name) if w not in _STOPWORDS]


def process_of(source: str, columns: Iterable[str]) -> Process | None:
    """The process a source records, from its name and its columns' names: a word of the
    source name counts twice, then each column using a word of the process once (a file
    of payments of orders has one order column and four payment columns)."""
    source_words = set(_lemmas([source]))
    column_words = [set(_lemmas([c])) for c in columns]
    best: tuple[int, Process] | None = None
    for process in PROCESSES:
        hits = len(process.words & source_words) * 2 + sum(
            1 for words in column_words if process.words & words
        )
        if hits >= _MIN_WORDS and (best is None or hits > best[0]):
            best = (hits, process)
    return best[1] if best else None


def fact_name(source: str, columns: Iterable[str]) -> str:
    process = process_of(source, columns)
    return f"fct_{process.fact}" if process else f"fct_{source}"


def process_label(source: str, columns: Iterable[str]) -> str:
    """What the fact's main date is the date of: « fréquentation », « vente »."""
    process = process_of(source, columns)
    if process is not None:
        return process.label
    words = [w for w in _lemmas([source]) if not w.isdigit()]
    return words[0] if words else source


# Name patterns of the attribute that names an entity: nom_du_musee, libelle_produit.
_NAMING_HEADS = frozenset({"nom", "name", "libelle", "lib", "intitule", "designation", "label"})


def entity_name(key: str, attributes: Iterable[str]) -> str:
    """The entity a key and its attributes describe: ``musee`` for idmuseofile with
    nom_du_musee; the key without its identifier words otherwise."""
    for attribute in attributes:
        words = [w for w in name_words(attribute) if w not in _STOPWORDS]
        if len(words) >= 2 and words[0] in _NAMING_HEADS:
            return "_".join(singular(w) for w in words[1:])
        if len(words) >= 2 and words[-1] in _NAMING_HEADS:
            return "_".join(singular(w) for w in words[:-1])
    words = [w for w in name_words(key) if w not in IDENTIFIER_TOKENS and w not in _STOPWORDS]
    return "_".join(singular(w) for w in words) or "entite"


# Words of a source name that say nothing of its content.
_NOISE = frozenset(
    {"dataset", "datasets", "data", "donnees", "table", "tbl", "src", "source", "raw", "stg",
     "export", "extract", "extraction", "fichier", "file", "liste", "list", "base", "dump",
     "csv", "v1", "v2", "final"}
)  # fmt: skip
# Common English entity words, in French: names of the model stay in the language of the
# interface. A word missing here is kept as is.
ENTITY_WORDS: dict[str, str] = {
    "customer": "client", "client": "client", "buyer": "acheteur", "product": "produit",
    "item": "ligne", "line": "ligne", "seller": "vendeur", "vendor": "vendeur",
    "supplier": "fournisseur", "order": "commande", "payment": "paiement", "review": "avis",
    "store": "magasin", "shop": "magasin", "employee": "salarie", "category": "categorie",
    "user": "utilisateur", "account": "compte", "invoice": "facture", "shipment": "expedition",
    "city": "ville", "country": "pays", "geolocation": "geolocalisation", "sale": "vente",
    "transaction": "transaction", "contract": "contrat", "agent": "agent", "branch": "agence",
    "warehouse": "entrepot", "delivery": "livraison", "visit": "visite", "event": "evenement",
    "patient": "patient", "student": "etudiant", "course": "cours", "member": "membre",
}  # fmt: skip


def source_words(source: str, others: Iterable[str] = ()) -> list[str]:
    """The meaningful words of a source name: noise words dropped, and a prefix shared by
    most sources of the project (``olist_``, ``crm_``) too."""
    words = [w for w in name_words(source) if w not in _NOISE and not w.isdigit()]
    names = [n for n in others if n != source]
    if words and len(names) >= 2:
        first = words[0]
        sharing = sum(1 for n in names if name_words(n)[:1] == [first])
        if sharing >= len(names) / 2 and len(words) > 1:
            words = words[1:]
    return words


def entity_of_source(source: str, others: Iterable[str] = ()) -> str:
    """``olist_customers_dataset`` → ``client``; ``order_items`` → ``ligne_commande``."""
    words = [singular(w) for w in source_words(source, others) if w not in _STOPWORDS]
    french = [ENTITY_WORDS.get(w, w) for w in words]
    if not french:
        return singular(source)
    if len(french) >= 2 and all(w in ENTITY_WORDS for w in words):
        # « order items » is a line of an order: the head noun comes last in English
        # (« lignes_commande », already French, keeps its order).
        return "_".join([french[-1], *french[:-1]])
    return "_".join(french)


def entity_phrase(entity: str) -> str:
    """``ligne_commande`` → « ligne de commande »."""
    words = entity.split("_")
    return words[0] if len(words) == 1 else f"{words[0]} de {' '.join(words[1:])}"
