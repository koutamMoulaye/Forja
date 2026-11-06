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
    """The process a source records, from its name and its columns' names."""
    source_words = set(_lemmas([source]))
    column_words = set(_lemmas(columns))
    best: tuple[int, Process] | None = None
    for process in PROCESSES:
        hits = len(process.words & source_words) * 2 + len(process.words & column_words)
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
