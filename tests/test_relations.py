from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_api.main import create_app
from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.errors import RelationValidationError
from forja_core.models import Project
from forja_core.relations.models import Relation, RelationCreate, RelationStatus
from forja_core.relations.naming import name_similarity
from tests.fixtures import ecommerce as ec
from tests.shop import build_shop


@pytest.mark.parametrize(
    ("from_column", "from_table", "to_column", "to_table", "minimum"),
    [
        ("id_client", "stg_commandes", "id_client", "stg_clients", 1.0),
        ("client_id", "stg_commandes", "id", "stg_clients", 0.9),
        ("id_client", "stg_commandes", "client_id", "stg_clients", 0.9),
        ("customer_id", "stg_orders", "id", "stg_clients", 0.8),
        ("code_article", "stg_lignes", "code_produit", "stg_produits", 0.8),
    ],
)
def test_similar_names(
    from_column: str, from_table: str, to_column: str, to_table: str, minimum: float
) -> None:
    assert name_similarity(from_column, from_table, to_column, to_table) >= minimum


@pytest.mark.parametrize(
    ("from_column", "to_column", "to_table"),
    [("quantite", "id_client", "stg_clients"), ("statut", "code_produit", "stg_produits")],
)
def test_unrelated_names(from_column: str, to_column: str, to_table: str) -> None:
    assert name_similarity(from_column, "stg_x", to_column, to_table) < 0.5


@pytest.fixture(scope="module")
def shop(
    tmp_path_factory: pytest.TempPathFactory, ecommerce_dir: Path
) -> Iterator[tuple[AppState, Project]]:
    root = tmp_path_factory.mktemp("relations")
    settings = Settings(
        data_dir=root / "data", secrets_dir=root / "secrets", log_format="console",
        log_level="WARNING",
    )  # fmt: skip
    state, project = build_shop(settings, ecommerce_dir)
    yield state, project
    state.close()


def _by_key(relations: list[Relation]) -> dict[str, Relation]:
    return {f"{r.from_source}.{r.from_column}->{r.to_source}.{r.to_column}": r for r in relations}


def test_relations_detected_after_build(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    relations = _by_key(state.catalog.list_relations(project.id))
    assert sorted(relations) == [
        "commandes.id_client->clients.id_client",
        "lignes_commande.code_produit->produits.code_produit",
        "lignes_commande.id_commande->commandes.id_commande",
    ]
    orders = relations["commandes.id_client->clients.id_client"]
    assert orders.cardinality == "N-1"
    assert orders.status is RelationStatus.SUGGESTED
    assert 0.9 <= orders.inclusion_ratio < 1  # orders of an unknown client
    assert orders.explanation.startswith(
        f"{round(orders.inclusion_ratio * 100)} % des valeurs de commandes.id_client "
        "existent dans clients.id_client"
    )
    lines = relations["lignes_commande.id_commande->commandes.id_commande"]
    assert lines.inclusion_ratio == 1 and lines.confidence == 1


def test_sampling_is_reported(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    detector = state.relations.detector
    original = detector.settings
    detector.settings = original.model_copy(update={"relation_sample_size": 5})
    try:
        relations = _by_key(detector.detect(project.id))
    finally:
        detector.settings = original
    lines = relations["lignes_commande.id_commande->commandes.id_commande"]
    assert lines.sample_size == 5
    assert lines.from_distinct == ec.ORDER_COUNT
    assert f"échantillon de 5 valeurs distinctes sur {ec.ORDER_COUNT}" in lines.explanation
    detector.detect(project.id)


def test_review_decisions_survive_detection(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    relations = _by_key(state.catalog.list_relations(project.id))
    confirmed = state.relations.confirm(relations["commandes.id_client->clients.id_client"].id)
    rejected = state.relations.reject(
        relations["lignes_commande.code_produit->produits.code_produit"].id
    )
    after = _by_key(state.relations.detector.detect(project.id))
    assert after["commandes.id_client->clients.id_client"].status is RelationStatus.CONFIRMED
    assert after["commandes.id_client->clients.id_client"].id == confirmed.id
    product = after["lignes_commande.code_produit->produits.code_produit"]
    assert product.status is RelationStatus.REJECTED and product.id == rejected.id
    state.relations.confirm(product.id)


def test_manual_relation(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    sources = {s.name: s.id for s in state.catalog.list_sources(project.id)}
    with pytest.raises(RelationValidationError, match="not unique"):
        state.relations.add(
            project.id,
            RelationCreate(
                from_source_id=sources["commandes"],
                from_column="id_commande",
                to_source_id=sources["lignes_commande"],
                to_column="id_commande",
            ),
        )
    with pytest.raises(RelationValidationError, match="does not exist"):
        state.relations.add(
            project.id,
            RelationCreate(
                from_source_id=sources["commandes"],
                from_column="inconnue",
                to_source_id=sources["clients"],
                to_column="id_client",
            ),
        )
    manual = state.relations.add(
        project.id,
        RelationCreate(
            from_source_id=sources["commandes"],
            from_column="id_client",
            to_source_id=sources["clients"],
            to_column="id_client",
        ),
    )
    assert manual.status is RelationStatus.CONFIRMED
    assert manual.explanation.startswith("Ajoutée manuellement.")


def test_relations_api(shop: tuple[AppState, Project]) -> None:
    state, project = shop
    state.close()
    try:
        with TestClient(create_app(state.settings)) as client:
            listed = client.get(f"/projects/{project.id}/relations").json()
            assert len(listed) == 3
            confirmed = client.get(
                f"/projects/{project.id}/relations", params={"status": "confirmed"}
            ).json()
            assert {r["status"] for r in confirmed} == {"confirmed"}
            first = listed[0]["id"]
            assert client.post(f"/relations/{first}/reject").json()["status"] == "rejected"
            assert client.post(f"/relations/{first}/confirm").json()["status"] == "confirmed"
            assert client.get(f"/relations/{first}").json()["id"] == first
            assert len(client.post(f"/projects/{project.id}/relations/detect").json()) == 3
            bad = client.post(
                f"/projects/{project.id}/relations",
                json={
                    "from_source_id": listed[0]["from_source_id"],
                    "from_column": "nope",
                    "to_source_id": listed[0]["to_source_id"],
                    "to_column": listed[0]["to_column"],
                },
            )
            assert bad.status_code == 422
            assert client.get("/relations/missing").status_code == 404
    finally:
        state.catalog = type(state.catalog)(state.settings.catalog_path)
