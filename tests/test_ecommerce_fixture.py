from __future__ import annotations

from pathlib import Path

from forja_core.catalog import Catalog
from forja_core.ingestion import IngestionService
from forja_core.models import Project
from forja_core.silver.plan import SilverType
from tests.fixtures import ecommerce as ec


def test_fixture_is_deterministic(tmp_path: Path) -> None:
    ec.generate(tmp_path)
    for name in ec.FILES:
        assert (tmp_path / name).read_bytes() == (ec.DIRECTORY / name).read_bytes(), name


def test_silver_plans_of_the_four_sources(
    ingestion: IngestionService, catalog: Catalog, project: Project, ecommerce_dir: Path
) -> None:
    for name in (ec.CLIENTS, ec.PRODUITS, ec.COMMANDES, ec.LIGNES):
        ingestion.ingest_file(project.id, ecommerce_dir / name, name)
    plans = {s.name: catalog.get_plan(s.id) for s in catalog.list_sources(project.id)}
    assert sorted(plans) == ["clients", "commandes", "lignes_commande", "produits"]

    keys = {
        name: plan.primary_key.columns if plan.primary_key else None for name, plan in plans.items()
    }
    assert keys == {
        "clients": ["id_client"],
        "commandes": ["id_commande"],
        "lignes_commande": ["id_commande", "num_ligne"],
        "produits": ["code_produit"],
    }
    types = {
        (name, c.target_column): c.target_type for name, plan in plans.items() for c in plan.columns
    }
    assert types[("produits", "prix_unitaire")] is SilverType.DECIMAL
    assert types[("lignes_commande", "prix_unitaire")] is SilverType.DECIMAL
    assert types[("commandes", "frais_port")] is SilverType.DECIMAL
    assert types[("lignes_commande", "quantite")] is SilverType.BIGINT
    assert types[("commandes", "date_commande")] is SilverType.DATE
