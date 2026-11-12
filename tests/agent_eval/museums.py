"""The real questions of manual case 1 bis, with their expected outcome, on the synthetic
yearly attendance file (``tests.fixtures.attendance``, the shape of the museums export).

Every case passes with the deterministic parser alone, without a language model: the
clarification on « labellisés » is the expected outcome, not a failure. A case with
``previous`` is asked in a conversation that already holds a data mart (the message is
sent as a refinement): a complete sentence must be read as a new question.
"""

from __future__ import annotations

from datetime import date

from tests.agent_eval.cases import (
    Case,
    ExpectedAnswer,
    ExpectedClarification,
    ExpectedMart,
)

TODAY = "2025-01-15"
Y2023 = (date(2023, 1, 1), date(2023, 12, 31))

CASES: tuple[Case, ...] = (
    Case(
        "m01",
        "simple",
        "Fréquentation totale par région en 2023",
        ExpectedMart(("total",), ("musee.region",), period=Y2023),
    ),
    Case(
        "m02",
        "hors_perimetre",
        "ce cas parle de quoi ? et donne-moi la météo actuelle à Paris",
        # The part about the data is answered, the weather declined: no data mart, no
        # question about « Paris ».
        ExpectedAnswer(declined=True),
    ),
    Case(
        "m03",
        "simple",
        "Évolution de la fréquentation payante et gratuite par année",
        # Both measures asked, the longest expression first: « fréquentation » alone is
        # not added.
        ExpectedMart(("payant", "gratuit"), time_grain="annee"),
    ),
    Case(
        "m04",
        "simple",
        "Top 10 des musées les plus visités en 2023",
        # « musées » is the axis, never the value « Musée de l'affiche ».
        ExpectedMart(("total",), ("musee.nom_du_musee",), period=Y2023, limit=10),
    ),
    Case(
        "m05",
        "ambigu",
        "Nombre de musées labellisés par année",
        # « labellisés » names nothing in the data: what it covers is asked, with the
        # attributes that could hold it.
        ExpectedClarification(("filled:dateappellation.date", "time:dateappellation")),
    ),
    Case(
        "m06",
        "simple",
        "Nombre de musées par région",
        # Asked after the top 10 of 2023: a new question inherits no period, no limit.
        ExpectedMart(("nb_musees",), ("musee.region",)),
        previous="Top 10 des musées les plus visités en 2023",
    ),
    Case(
        "m07",
        "simple",
        "Combien de musées par région",
        ExpectedMart(("nb_musees",), ("musee.region",)),
    ),
    Case(
        "m08",
        "simple",
        "Fréquentation par année",
        ExpectedMart(("total",), time_grain="annee"),
        previous="Fréquentation totale par région en 2023",
    ),
)
