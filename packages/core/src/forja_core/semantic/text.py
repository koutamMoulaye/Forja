"""French text normalization for matching questions with labels and synonyms.

Deliberately simple and deterministic: lowercase, no accents, apostrophes and
punctuation as spaces, and a light lemmatization (plurals, a few verb forms) so that
"villes", "Ville" and "ville" match, as do "vendus" and "vendu".
"""

from __future__ import annotations

import re

from forja_core.utils import strip_accents

_NON_WORD = re.compile(r"[^a-z0-9%€]+")

STOPWORDS = frozenset(
    {
        "le",
        "la",
        "les",
        "l",
        "un",
        "une",
        "des",
        "du",
        "de",
        "d",
        "au",
        "aux",
        "a",
        "et",
        "ou",
        "en",
        "dans",
        "sur",
        "pour",
        "par",
        "avec",
        "sans",
        "ce",
        "cet",
        "cette",
        "ces",
        "mon",
        "ma",
        "mes",
        "son",
        "sa",
        "ses",
        "leur",
        "leurs",
        "nos",
        "notre",
        "votre",
        "vos",
        "qui",
        "que",
        "quoi",
        "dont",
        "est",
        "sont",
        "etre",
        "ete",
        "fait",
        "faire",
        "il",
        "elle",
        "ils",
        "elles",
        "on",
        "nous",
        "vous",
        "je",
        "tu",
        "me",
        "te",
        "se",
        "y",
        "donne",
        "donner",
        "donnez",
        "montre",
        "montrer",
        "montrez",
        "affiche",
        "afficher",
        "affichez",
        "voir",
        "veux",
        "voudrais",
        "aimerais",
        "souhaite",
        "peux",
        "pourrais",
        "calcule",
        "calculer",
        "quel",
        "quelle",
        "quels",
        "quelles",
        "combien",
        "moi",
        "stp",
        "svp",
        "merci",
        "liste",
        "lister",
        "indique",
        "indiquer",
        "obtenir",
        "avoir",
        "ai",
        "as",
        "tout",
        "tous",
        "toute",
        "toutes",
        "chaque",
        "selon",
        "entre",
        "comme",
        "plus",
        "moins",
        "tres",
        "bien",
    }
)

_IRREGULAR = {"aux": "al", "eaux": "eau", "yeux": "oeil"}
_KEEP = frozenset(
    {"pays", "prix", "mois", "fois", "temps", "poids", "cours", "ca", "tva", "francais", "hors"}
)


def normalize(text: str) -> str:
    lowered = strip_accents(text.lower()).replace("\u2019", " ").replace("'", " ")
    return _NON_WORD.sub(" ", lowered).strip()


def lemma(token: str) -> str:
    """Singular masculine form of a French word, approximately."""
    if token in _KEEP or len(token) <= 3 or token.isdigit():
        return token
    for suffix, replacement in _IRREGULAR.items():
        if token.endswith(suffix) and len(token) > len(suffix) + 2:
            return token[: -len(suffix)] + replacement
    if token.endswith(("s", "x")) and not token.endswith("ss"):
        token = token[:-1]
    # Past participles: vendue / vendu, livree / livre.
    if (token.endswith("ee") and len(token) > 4) or (token.endswith("ue") and len(token) > 4):
        token = token[:-1]
    return token


def words(text: str) -> list[str]:
    """Normalized tokens, lemmatized, stopwords kept (positions matter for parsing)."""
    return [t if t in STOPWORDS else lemma(t) for t in normalize(text).split()]


def key(text: str) -> tuple[str, ...]:
    """Matching key of a label or synonym: lemmas without stopwords."""
    return tuple(t for t in words(text) if t not in STOPWORDS) or tuple(words(text))
