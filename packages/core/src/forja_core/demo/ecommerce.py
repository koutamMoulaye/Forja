"""Deterministic French e-commerce dataset: clients, produits, commandes, lignes_commande.

Built to exercise relations and star modeling:

- codes with distinct shapes (CLI-0001, PRD-001, CMD-00001) so that value inclusion
  alone identifies foreign keys;
- orphan foreign keys: two orders of an unknown client, one line of an unknown product;
- amounts written with a decimal comma (12,90), dates as DD/MM/YYYY;
- shipping costs at order level (frais_port), a trap for measures at line grain;
- clients_v2.csv: one client moved and changed segment, one new client.

Run ``uv run python -m tests.fixtures.ecommerce`` to rebuild the files.
"""

from __future__ import annotations

import csv
import io
import random
from datetime import date, timedelta
from pathlib import Path

DIRECTORY = Path(__file__).parent / "ecommerce"

CLIENTS = "clients.csv"
CLIENTS_V2 = "clients_v2.csv"
PRODUITS = "produits.csv"
COMMANDES = "commandes.csv"
LIGNES = "lignes_commande.csv"
FILES = (CLIENTS, CLIENTS_V2, PRODUITS, COMMANDES, LIGNES)

CLIENT_COUNT = 20
PRODUCT_COUNT = 12
ORDER_COUNT = 40
ORPHAN_CLIENT = "CLI-9999"
ORPHAN_CLIENT_ORDERS = ("CMD-00007", "CMD-00031")
ORPHAN_PRODUCT = "PRD-999"
ORPHAN_PRODUCT_LINE = ("CMD-00012", 2)
CHANGED_CLIENT = "CLI-0003"
CHANGED_CLIENT_CITY = "Bordeaux"
NEW_CLIENT = "CLI-0021"

_FIRST_NAMES = (
    "Jean", "Marie", "Pierre", "Sophie", "Nicolas", "Camille", "Julien", "Léa", "Thomas",
    "Chloé", "Antoine", "Manon", "Louis", "Emma", "Hugo", "Inès", "Arthur", "Jade",
    "Gabriel", "Louise", "Paul",
)  # fmt: skip
_LAST_NAMES = (
    "Dupont", "Martin", "Bernard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent",
    "Lefèvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier",
    "Morel", "Girard", "André", "Mercier",
)  # fmt: skip
_CITIES = ("Paris", "Lyon", "Marseille", "Lille", "Nantes", "Toulouse")
_PRODUCTS = (
    ("Cafetière italienne", "cuisine", "24,90"),
    ("Moulin à poivre", "cuisine", "18,50"),
    ("Planche à découper", "cuisine", "12,90"),
    ("Lampe de bureau", "maison", "39,00"),
    ("Coussin en lin", "maison", "22,00"),
    ("Bougie parfumée", "maison", "9,90"),
    ("Arrosoir 5 L", "jardin", "15,40"),
    ("Sécateur", "jardin", "27,80"),
    ("Gants de jardin", "jardin", "8,50"),
    ("Théière en fonte", "cuisine", "45,00"),
    ("Plaid tricoté", "maison", "59,90"),
    ("Jardinière", "jardin", "31,20"),
)
_STATUSES = ("livrée", "livrée", "livrée", "expédiée", "annulée")


def _client_id(n: int) -> str:
    return f"CLI-{n:04d}"


def _product_id(n: int) -> str:
    return f"PRD-{n:03d}"


def _order_id(n: int) -> str:
    return f"CMD-{n:05d}"


def _ascii(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


CLIENT_HEADER = ["id_client", "nom", "prénom", "email", "ville", "segment", "date_inscription"]


def clients_rows(version: int = 1) -> list[list[str]]:
    rng = random.Random(11)
    rows: list[list[str]] = []
    count = CLIENT_COUNT + (1 if version == 2 else 0)
    for n in range(1, count + 1):
        first, last = _FIRST_NAMES[n - 1], _LAST_NAMES[n - 1]
        signup = date(2021, 1, 1) + timedelta(days=rng.randint(0, 700))
        row = [
            _client_id(n),
            last,
            first,
            f"{_ascii(first).lower()}.{_ascii(last).lower()}@exemple.fr",
            rng.choice(_CITIES),
            "professionnel" if n % 4 == 0 else "particulier",
            signup.strftime("%d/%m/%Y"),
        ]
        if version == 2 and row[0] == CHANGED_CLIENT:
            row[4] = CHANGED_CLIENT_CITY
            row[5] = "professionnel"
        rows.append(row)
    return rows


PRODUCT_HEADER = ["code_produit", "libelle", "categorie", "prix_unitaire", "actif"]


def produits_rows() -> list[list[str]]:
    return [
        [_product_id(n), label, category, price, "non" if n == 6 else "oui"]
        for n, (label, category, price) in enumerate(_PRODUCTS, start=1)
    ]


ORDER_HEADER = ["id_commande", "id_client", "date_commande", "statut", "frais_port"]


def commandes_rows() -> list[list[str]]:
    rng = random.Random(23)
    rows: list[list[str]] = []
    for n in range(1, ORDER_COUNT + 1):
        order = _order_id(n)
        client = (
            ORPHAN_CLIENT
            if order in ORPHAN_CLIENT_ORDERS
            else _client_id(rng.randint(1, CLIENT_COUNT))
        )
        ordered = date(2024, 1, 2) + timedelta(days=rng.randint(0, 330))
        shipping = "0,00" if n % 5 == 0 else rng.choice(("4,90", "6,50", "9,90"))
        rows.append([order, client, ordered.strftime("%d/%m/%Y"), rng.choice(_STATUSES), shipping])
    return rows


LINE_HEADER = ["id_commande", "num_ligne", "code_produit", "quantite", "prix_unitaire"]


def lignes_rows() -> list[list[str]]:
    rng = random.Random(37)
    rows: list[list[str]] = []
    for n in range(1, ORDER_COUNT + 1):
        order = _order_id(n)
        for line in range(1, rng.randint(1, 3) + 1):
            product = rng.randint(1, PRODUCT_COUNT)
            code, price = _product_id(product), _PRODUCTS[product - 1][2]
            if (order, line) == ORPHAN_PRODUCT_LINE:
                code = ORPHAN_PRODUCT
            rows.append([order, str(line), code, str(rng.randint(1, 4)), price])
    if not any((r[0], int(r[1])) == ORPHAN_PRODUCT_LINE for r in rows):
        raise AssertionError("the orphan product line must exist")
    return rows


def _write(path: Path, header: list[str], rows: list[list[str]], encoding: str) -> None:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    path.write_bytes(buffer.getvalue().encode(encoding))


def generate(directory: Path = DIRECTORY) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    _write(directory / CLIENTS, CLIENT_HEADER, clients_rows(1), "cp1252")
    _write(directory / CLIENTS_V2, CLIENT_HEADER, clients_rows(2), "cp1252")
    _write(directory / PRODUITS, PRODUCT_HEADER, produits_rows(), "utf-8")
    _write(directory / COMMANDES, ORDER_HEADER, commandes_rows(), "utf-8")
    _write(directory / LIGNES, LINE_HEADER, lignes_rows(), "utf-8")


def all_values() -> set[str]:
    """Every cell of every file, for leak tests."""
    tables = (clients_rows(1), clients_rows(2), produits_rows(), commandes_rows(), lignes_rows())
    return {cell for rows in tables for row in rows for cell in row}


if __name__ == "__main__":
    generate()
