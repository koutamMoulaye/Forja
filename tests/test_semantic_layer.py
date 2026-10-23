"""Semantic layer generated from the applied Gold plan of the e-commerce shop."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from forja_api.state import AppState
from forja_core.errors import PlanStateError, PlanValidationError
from forja_core.models import Project
from forja_core.semantic.models import Additivity, MetricAggregation, SemanticOverride
from forja_core.semantic.service import visible
from forja_core.semantic.text import key, words
from tests.shop import build_gold_shop, shop_settings


@pytest.fixture(scope="module")
def shop(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[AppState, Project]]:
    state, project = build_gold_shop(
        shop_settings(tmp_path_factory.mktemp("semantic")), ecommerce_dir
    )
    yield state, project
    state.close()


def test_generated_after_build_gold(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    layer = state.catalog.get_semantic_layer(project.id)
    assert layer.version == 1
    assert layer.gold_plan_version == state.catalog.get_gold_plan(project.id).version
    assert layer.default_time_dimension == "date_commande"


def test_metrics_and_additivity(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    layer = state.semantic.current(project.id)
    metrics = {m.name: m for m in layer.metrics}
    revenue = metrics["montant"]
    assert (revenue.label, revenue.unit, revenue.formula) == (
        "Chiffre d'affaires",
        "EUR",
        "sum(montant)",
    )
    assert revenue.additivity is Additivity.ADDITIVE and "CA" in revenue.synonyms
    assert metrics["quantite"].label == "Quantité vendue"
    orders = metrics["nb_commandes"]
    assert orders.aggregation is MetricAggregation.COUNT_DISTINCT
    assert orders.additivity is Additivity.NON_ADDITIVE  # an order spans several products

    # Non-additive values are ratios of additive metrics, never averages of averages.
    price = metrics["prix_moyen"]
    assert (price.kind, price.numerator, price.denominator) == ("ratio", "montant", "quantite")
    assert price.formula == "sum(montant) / sum(quantite)"
    assert price.additivity is Additivity.NON_ADDITIVE
    basket = metrics["panier_moyen"]
    assert (basket.numerator, basket.denominator) == ("montant", "nb_commandes")
    assert "prix_unitaire" not in metrics  # the unit price is not aggregated


def test_dimensions_attributes_and_hierarchies(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    layer = state.semantic.current(project.id)
    client = layer.dimension("client")
    assert client is not None and client.table == "dim_clients" and client.historized
    assert (client.fact_key, client.table_key) == ("client_key", "client_key")
    email = client.attribute("email")
    assert email is not None and email.pii is not None and not email.filterable
    city = client.attribute("ville")
    assert city is not None and city.filterable and city.label == "Ville"

    product = layer.dimension("produit")
    assert product is not None and product.display_attribute == "libelle"
    assert [h.levels for h in product.hierarchies] == [["categorie", "libelle"]]

    order = layer.dimension("commande")
    assert order is not None and order.kind == "degenerate" and order.table == "fct_ventes"

    date_dim = layer.dimension("date_commande")
    assert date_dim is not None and date_dim.kind == "time" and date_dim.label == "Date de commande"
    assert date_dim.hierarchies[0].levels == ["annee", "trimestre", "mois", "date"]


def test_regeneration_is_idempotent_and_keeps_edits(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    first = state.semantic.regenerate(project.id)
    assert state.semantic.regenerate(project.id).version == first.version  # nothing changed

    edited = state.semantic.patch(
        project.id,
        [
            SemanticOverride(target="metric:montant", label="CA TTC", add_synonyms=["recette"]),
            SemanticOverride(target="attribute:client.date_inscription", hidden=True),
        ],
        by="engineer",
    )
    assert edited.version == first.version + 1
    again = state.semantic.regenerate(project.id)
    assert again.version == edited.version  # the edits survive the regeneration
    revenue = again.metric("montant")
    assert revenue is not None and revenue.label == "CA TTC" and "recette" in revenue.synonyms
    assert "CA" in revenue.synonyms  # added, not replacing

    shown = visible(again)
    client = shown.dimension("client")
    assert client is not None and client.attribute("date_inscription") is None
    assert again.dimension("client").attribute("date_inscription").hidden  # type: ignore[union-attr]

    with pytest.raises(PlanValidationError):
        state.semantic.patch(project.id, [SemanticOverride(target="metric:marge")], by="x")
    state.semantic.patch(
        project.id,
        [
            SemanticOverride(target="metric:montant", label="Chiffre d'affaires"),
            SemanticOverride(target="attribute:client.date_inscription", hidden=False),
        ],
        by="engineer",
    )


def test_synonym_proposals(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    proposal = state.semantic.propose_synonym(
        project.id, "attribute:client.ville", "agglomération", by="analyst"
    )
    assert proposal.status == "pending"
    accepted = state.semantic.review_synonym(proposal.id, accept=True, by="engineer")
    assert accepted.status == "accepted" and accepted.reviewed_by == "engineer"
    city = state.semantic.current(project.id).attribute("client.ville")
    assert city is not None and "agglomération" in city[1].synonyms
    with pytest.raises(PlanStateError):
        state.semantic.review_synonym(proposal.id, accept=False, by="engineer")


def test_distinct_values_stay_local(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    layer = state.semantic.current(project.id)
    found = layer.attribute("client.ville")
    assert found is not None
    cities = state.semantic.distinct_values(layer, *found)
    assert "Lyon" in cities and "Inconnu" not in cities
    email = layer.attribute("client.email")
    assert email is not None and state.semantic.distinct_values(layer, *email) == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Villes", ["ville"]),
        ("Quantités vendues", ["quantite", "vendu"]),
        ("commandes livrées", ["commande", "livre"]),
        ("le plus", ["le", "plus"]),
        ("chiffre d\u2019affaires", ["chiffre", "d", "affaire"]),
    ],
)
def test_french_normalization(text: str, expected: list[str]) -> None:
    assert words(text) == expected


def test_matching_keys_drop_stopwords() -> None:
    assert key("Chiffre d'affaires") == ("chiffre", "affaire")
    assert key("la") == ("la",)
