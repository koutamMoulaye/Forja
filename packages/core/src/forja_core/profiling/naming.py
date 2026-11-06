"""What a column name says about its role: identifier, period, measure.

Column names come glued as often as separated: ``IDMuseofile``, ``dateappellation``,
``anneefermeture`` read as ``id museofile``, ``date appellation``, ``annee
fermeture``. A few French and English prefixes are split off a word they start, when
what remains is long enough to be a word of its own.
"""

from __future__ import annotations

import re

from forja_core.utils import strip_accents

# Prefixes split off a glued name, longest first.
_GLUED_PREFIXES = (
    "libelle", "annee", "date", "code", "mois", "jour", "year", "num", "nom", "lib", "nb", "id",
)  # fmt: skip
_MIN_REST = 4
# Words that start like a prefix but are words of their own.
_NOT_GLUED = frozenset(
    {"identifiant", "identite", "identity", "identifier", "idee", "numero", "number",
     "numerique", "nombre", "nomenclature", "nominal", "nomination", "codification",
     "datation", "journee", "journal", "journalier", "moisson", "libre", "library",
     "liberte", "yearly", "annees", "annuel", "dates", "codes", "jours"}
)  # fmt: skip

IDENTIFIER_TOKENS = frozenset(
    {"id", "ident", "identifiant", "code", "cd", "ref", "reference", "num", "numero", "no",
     "key", "cle", "uid", "uuid", "siren", "siret", "matricule"}
)  # fmt: skip
YEAR_TOKENS = frozenset({"annee", "year", "an", "exercice", "millesime", "yr"})
MONTH_TOKENS = frozenset({"mois", "month", "periode", "period"})
QUARTER_TOKENS = frozenset({"trimestre", "quarter", "trim"})
PERIOD_TOKENS = (
    YEAR_TOKENS | MONTH_TOKENS | QUARTER_TOKENS
    | {"date", "jour", "day", "semaine", "week", "saison", "season"}
)  # fmt: skip


def split_glued(token: str) -> list[str]:
    """``dateappellation`` → ``date``, ``appellation``; ``ville`` stays as is."""
    if token in _NOT_GLUED or token.isdigit():
        return [token]
    for prefix in _GLUED_PREFIXES:
        rest = token[len(prefix) :]
        if token.startswith(prefix) and len(rest) >= _MIN_REST and rest.isalpha():
            return [prefix, *split_glued(rest)]
    return [token]


def name_words(name: str) -> list[str]:
    """The words of a column name, in order, glued prefixes split."""
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", strip_accents(name)).lower()
    words: list[str] = []
    for token in re.split(r"[^a-z0-9]+", spaced):
        if token:
            words += split_glued(token)
    return words


def name_tokens(name: str) -> set[str]:
    return set(name_words(name))


def is_identifier_name(name: str) -> bool:
    return bool(name_tokens(name) & IDENTIFIER_TOKENS)


def is_period_name(name: str) -> bool:
    return bool(name_tokens(name) & PERIOD_TOKENS)


def period_level(name: str) -> str | None:
    """``year``, ``quarter`` or ``month`` when the name says it; None otherwise."""
    tokens = name_tokens(name)
    if tokens & QUARTER_TOKENS:
        return "quarter"
    if tokens & MONTH_TOKENS:
        return "month"
    if tokens & YEAR_TOKENS:
        return "year"
    return None
