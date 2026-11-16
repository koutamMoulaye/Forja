"""The questions of manual case 2, on the synthetic marketplace (``tests.fixtures.
marketplace``, nine files of the shape of a public e-commerce export).

Every case passes with the deterministic parser alone. Totals are checked against the
files in tests/test_manual_case_2.py: the payments are read at their own grain (no
fan-out over order lines), customers are counted on their stable identifier, and the
average review score per category counts each review once per category of its order.
"""

from __future__ import annotations

from datetime import date

from tests.agent_eval.cases import Case, ExpectedMart

TODAY = "2025-01-15"
Y2017 = (date(2017, 1, 1), date(2017, 12, 31))

CASES: tuple[Case, ...] = (
    Case(
        "o01",
        "simple",
        "Chiffre d'affaires par mois en 2017",
        ExpectedMart(("price",), time_grain="mois", period=Y2017),
    ),
    Case(
        "o02",
        "simple",
        "Chiffre d'affaires par État du client en 2017",
        ExpectedMart(("price",), ("client.customer_state",), period=Y2017),
    ),
    Case(
        "o03",
        "simple",
        "Top 10 des catégories de produits par chiffre d'affaires",
        ExpectedMart(("price",), ("produit.product_category_name",), limit=10),
    ),
    Case(
        "o04",
        "simple",
        "Montant total payé par mode de paiement",
        ExpectedMart(("payment_value",), ("commande.payment_type",)),
    ),
    Case(
        "o05",
        "simple",
        "Nombre de clients par État",
        ExpectedMart(("nb_clients",), ("client.customer_state",)),
    ),
    Case(
        "o06",
        "simple",
        "Note moyenne des avis par catégorie",
        ExpectedMart(("review_score_moyen",), ("produit.product_category_name",)),
    ),
)
