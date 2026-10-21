"""Similarity of column names that may designate the same entity.

``client_id``, ``id_client``, ``customer_id`` and ``clients.id`` all name a client:
generic tokens (id, code, ref...) are removed, a bare key column takes the entity
of its table, plurals are reduced and French/English synonyms are grouped.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from forja_core.utils import strip_accents

GENERIC_TOKENS = frozenset(
    {"id", "ids", "code", "cle", "key", "ref", "reference", "num", "numero", "no", "nr", "fk",
     "pk", "identifiant", "ident", "uid", "uuid", "sk"}
)  # fmt: skip

_SYNONYM_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"client", "customer", "cli", "acheteur", "buyer"}),
    frozenset({"produit", "product", "article", "item", "prd", "sku"}),
    frozenset({"commande", "order", "cmd", "achat", "purchase"}),
    frozenset({"fournisseur", "supplier", "vendor", "frs"}),
    frozenset({"magasin", "store", "shop", "boutique", "point", "vente"}),
    frozenset({"categorie", "category", "cat", "famille", "family"}),
    frozenset({"employe", "employee", "salarie", "staff", "vendeur", "seller"}),
    frozenset({"pays", "country"}),
    frozenset({"ville", "city", "commune"}),
    frozenset({"facture", "invoice"}),
    frozenset({"compte", "account"}),
    frozenset({"utilisateur", "user", "usager"}),
)

EXACT = 1.0
SAME_ENTITY = 0.9
SYNONYM = 0.8
FUZZY_WEIGHT = 0.6


def _tokens(name: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", strip_accents(name))
    return [t for t in re.split(r"[^a-z0-9]+", spaced.lower()) if t]


def singular(token: str) -> str:
    if len(token) > 3 and token.endswith(("s", "x")) and not token.endswith("ss"):
        return token[:-1]
    return token


def entity(column: str, table: str) -> frozenset[str]:
    """Entity tokens a column refers to; a bare key column refers to its own table."""
    tokens = {singular(t) for t in _tokens(column) if t not in GENERIC_TOKENS}
    if tokens:
        return frozenset(tokens)
    table_tokens = [t for t in _tokens(table) if t not in {"stg", "dim", "fct"}]
    return frozenset(singular(t) for t in table_tokens)


def _synonyms(left: frozenset[str], right: frozenset[str]) -> bool:
    return any(left & group and right & group for group in _SYNONYM_GROUPS)


def name_similarity(from_column: str, from_table: str, to_column: str, to_table: str) -> float:
    if _tokens(from_column) == _tokens(to_column) and set(_tokens(from_column)) - GENERIC_TOKENS:
        return EXACT
    source = frozenset(singular(t) for t in _tokens(from_column) if t not in GENERIC_TOKENS)
    if not source:
        return 0.0
    target = entity(to_column, to_table)
    if source & target:
        return SAME_ENTITY
    if _synonyms(source, target):
        return SYNONYM
    ratio = SequenceMatcher(None, "".join(sorted(source)), "".join(sorted(target))).ratio()
    return round(FUZZY_WEIGHT * ratio, 3)
