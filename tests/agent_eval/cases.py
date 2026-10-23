"""20 business questions in French with the expected outcome.

- 9 simple requests the deterministic parser must handle without a language model;
- 5 requests phrased so that the parser is not confident: the model is asked;
- 4 ambiguous requests: a Clarification is expected, not a guess;
- 2 requests outside the data: a clean refusal is expected.

``mock`` is what the mocked model answers when it is called (as a well-behaved model
would); questions the parser handles never reach it. Fixture facts: orders from
January to November 2024; « aujourd'hui » is 2025-01-15 for the evaluation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from forja_core.agent.spec import (
    AgentAnswer,
    Clarification,
    ClarificationOption,
    MartFilter,
    MartSpec,
    OrderBy,
    Period,
)

TODAY = "2025-01-15"

Category = Literal["simple", "complexe", "ambigu", "hors_perimetre"]


@dataclass(frozen=True)
class ExpectedMart:
    metrics: tuple[str, ...]
    axes: tuple[str, ...] = ()
    time_grain: str | None = None
    filters: tuple[tuple[str, str, tuple[str, ...]], ...] = ()
    period: tuple[date, date] | None = None
    limit: int | None = None


@dataclass(frozen=True)
class ExpectedClarification:
    options: tuple[str, ...] = field(metadata={"doc": "Refs that must be offered"})


@dataclass(frozen=True)
class ExpectedRefusal:
    pass


Expected = ExpectedMart | ExpectedClarification | ExpectedRefusal


@dataclass(frozen=True)
class Case:
    id: str
    category: Category
    question: str
    expected: Expected
    mock: AgentAnswer | None = None
    subset: bool = field(default=False, metadata={"doc": "In the 5-question subset"})


def _mart(**kwargs: object) -> AgentAnswer:
    return AgentAnswer(kind="mart", mart=MartSpec(**kwargs))  # type: ignore[arg-type]


Y2024 = (date(2024, 1, 1), date(2024, 12, 31))

CASES: tuple[Case, ...] = (
    # --- Simple: the parser alone --------------------------------------------------------
    Case("s01", "simple", "CA par mois", ExpectedMart(("montant",), time_grain="mois")),
    Case(
        "s02",
        "simple",
        "Nombre de commandes par ville en 2024",
        ExpectedMart(("nb_commandes",), ("client.ville",), period=Y2024),
        subset=True,
    ),
    Case(
        "s03",
        "simple",
        "Top 5 des produits par chiffre d'affaires au T1 2024",
        ExpectedMart(
            ("montant",),
            ("produit.libelle",),
            period=(date(2024, 1, 1), date(2024, 3, 31)),
            limit=5,
        ),
    ),
    Case(
        "s04",
        "simple",
        "Panier moyen par segment de client",
        ExpectedMart(("panier_moyen",), ("client.segment",)),
    ),
    Case(
        "s05",
        "simple",
        "Prix moyen par catégorie",
        ExpectedMart(("prix_moyen",), ("produit.categorie",)),
    ),
    Case(
        "s06",
        "simple",
        "Chiffre d'affaires des commandes livrées par mois en 2024",
        ExpectedMart(
            ("montant",),
            time_grain="mois",
            period=Y2024,
            filters=(("commande.statut", "eq", ("livrée",)),),
        ),
    ),
    Case(
        "s07",
        "simple",
        "Nombre de commandes des clients de Lyon et Paris par trimestre",
        ExpectedMart(
            ("nb_commandes",),
            time_grain="trimestre",
            filters=(("client.ville", "in", ("lyon", "paris")),),
        ),
    ),
    Case(
        "s08",
        "simple",
        "Chiffre d'affaires et nombre de commandes par mois et par ville, sur 2024, "
        "clients segment Pro",
        ExpectedMart(
            ("montant", "nb_commandes"),
            ("client.ville",),
            time_grain="mois",
            period=Y2024,
            filters=(("client.segment", "eq", ("professionnel",)),),
        ),
    ),
    Case(
        "s09",
        "simple",
        "Les 3 villes avec le plus de commandes l'année dernière",
        ExpectedMart(("nb_commandes",), ("client.ville",), period=Y2024, limit=3),
    ),
    # --- Complex phrasing: the model is asked -------------------------------------------
    Case(
        "c01",
        "complexe",
        "Quel est le chiffre d'affaires réalisé auprès de la clientèle professionnelle "
        "au deuxième semestre 2024 ?",
        ExpectedMart(
            ("montant",),
            period=(date(2024, 7, 1), date(2024, 12, 31)),
            filters=(("client.segment", "eq", ("professionnel",)),),
        ),
        mock=_mart(
            metrics=["montant"],
            filters=[MartFilter(field="client.segment", value="Professionnel")],
            period=Period(start=date(2024, 7, 1), end=date(2024, 12, 31)),
            name="ca_pro_s2_2024",
        ),
        subset=True,
    ),
    Case(
        "c02",
        "complexe",
        "Je voudrais voir, mois par mois, combien d'articles on a écoulés dans la "
        "catégorie cuisine",
        ExpectedMart(
            ("quantite",),
            time_grain="mois",
            filters=(("produit.categorie", "eq", ("cuisine",)),),
        ),
        mock=_mart(
            metrics=["quantite"],
            time_grain="mois",
            filters=[MartFilter(field="produit.categorie", value="cuisine")],
            name="articles_cuisine_par_mois",
        ),
    ),
    Case(
        "c03",
        "complexe",
        "Quelle catégorie de produits rapporte le plus d'argent ?",
        ExpectedMart(("montant",), ("produit.categorie",), limit=1),
        mock=_mart(
            metrics=["montant"],
            axes=["produit.categorie"],
            order_by=[OrderBy(field="montant", direction="desc")],
            limit=1,
            name="meilleure_categorie",
        ),
        subset=True,
    ),
    Case(
        "c04",
        "complexe",
        "Peux-tu ventiler le nombre de commandes selon le jour de la semaine ?",
        ExpectedMart(("nb_commandes",), ("date_commande.nom_jour",)),
        mock=_mart(
            metrics=["nb_commandes"],
            axes=["date_commande.nom_jour"],
            name="commandes_par_jour_semaine",
        ),
    ),
    Case(
        "c05",
        "complexe",
        "Quelle est la part du week-end dans le chiffre d'affaires ?",
        ExpectedMart(("montant",), ("date_commande.est_week_end",)),
        mock=_mart(metrics=["montant"], axes=["date_commande.est_week_end"], name="ca_week_end"),
    ),
    # --- Ambiguous: a question back --------------------------------------------------------
    Case(
        "a01",
        "ambigu",
        "Évolution des ventes en 2024",
        ExpectedClarification(("metric:montant", "metric:quantite")),
    ),
    Case(
        "a02",
        "ambigu",
        "Les ventes par produit",
        ExpectedClarification(("metric:montant", "metric:quantite")),
    ),
    Case(
        "a03",
        "ambigu",
        "Quel est le prix par catégorie ?",
        ExpectedClarification(("metric:prix_moyen", "attribute:produit.prix_unitaire")),
    ),
    Case(
        "a04",
        "ambigu",
        "Quels sont les 5 produits les plus vendus ?",
        ExpectedClarification(("metric:montant", "metric:quantite")),
        mock=AgentAnswer(
            kind="clarification",
            clarification=Clarification(
                question="Les plus vendus en chiffre d'affaires ou en quantité ?",
                term="plus vendus",
                options=[
                    ClarificationOption(label="Chiffre d'affaires", ref="metric:montant"),
                    ClarificationOption(label="Quantité vendue", ref="metric:quantite"),
                ],
            ),
        ),
        subset=True,
    ),
    # --- Outside the data: a refusal --------------------------------------------------------
    Case(
        "r01",
        "hors_perimetre",
        "Quelle est la météo prévue à Lyon demain ?",
        ExpectedRefusal(),
        mock=AgentAnswer(
            kind="refusal",
            refusal_reason="La météo ne fait pas partie des données de ce projet.",
        ),
        subset=True,
    ),
    Case(
        "r02",
        "hors_perimetre",
        "Quel est le salaire moyen des employés ?",
        ExpectedRefusal(),
        mock=AgentAnswer(
            kind="refusal", refusal_reason="Les salaires ne font pas partie des données."
        ),
    ),
)


def subset() -> tuple[Case, ...]:
    """5 representative questions for a slow local model: one per kind of path."""
    return tuple(c for c in CASES if c.subset)
