"""End to end on the e-commerce fixture, through the HTTP API and the background worker.

4 sources -> Silver -> relations -> heuristic Gold plan -> approve -> build_gold ->
fct_ventes, dimensions and dim_date -> Gold serving and export; then a second
version of clients where a client moved -> SCD2 history verified.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.parquet as pq
from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests.fixtures import ecommerce as ec
from tests.test_api import wait_for_run

SOURCES = (ec.CLIENTS, ec.PRODUITS, ec.COMMANDES, ec.LIGNES)


def _upload(client: TestClient, project_id: str, path: Path, name: str) -> dict[str, Any]:
    with path.open("rb") as handle:
        response = client.post(f"/projects/{project_id}/sources", files={"file": (name, handle)})
    assert response.status_code == 201, response.text
    [source] = response.json()
    return dict(source)


def _run(client: TestClient, project_id: str, run_type: str) -> dict[str, Any]:
    response = client.post(f"/projects/{project_id}/runs", json={"type": run_type})
    assert response.status_code == 202
    run = wait_for_run(client, response.json()["id"])
    assert run["status"] == "succeeded", client.get(f"/runs/{run['id']}/logs").text
    return run


def test_ecommerce_star_schema_with_scd2(
    client: TestClient, settings: Settings, ecommerce_dir: Path
) -> None:
    project_id = client.post("/projects", json={"name": "Boutique en ligne"}).json()["id"]

    # --- Silver ------------------------------------------------------------------------
    sources = {name: _upload(client, project_id, ecommerce_dir / name, name) for name in SOURCES}
    for source in sources.values():
        approved = client.post(f"/sources/{source['id']}/plan/approve")
        assert approved.status_code == 200
    silver = _run(client, project_id, "build_silver")
    assert silver["metrics"]["relations_detected"] == 3

    # --- Relations ------------------------------------------------------------------------
    relations = client.get(f"/projects/{project_id}/relations").json()
    assert {(r["from_source"], r["from_column"], r["to_source"]) for r in relations} == {
        ("commandes", "id_client", "clients"),
        ("lignes_commande", "code_produit", "produits"),
        ("lignes_commande", "id_commande", "commandes"),
    }
    assert all(r["status"] == "suggested" for r in relations)
    unconfirmed = client.post(f"/projects/{project_id}/gold-plan/propose", json={})
    assert unconfirmed.json()["facts"] == []  # nothing to model before review
    for relation in relations:
        assert client.post(f"/relations/{relation['id']}/confirm").status_code == 200

    # --- Gold plan --------------------------------------------------------------------------
    plan = client.post(f"/projects/{project_id}/gold-plan/propose", json={}).json()
    assert plan["origin"] == "heuristic"
    assert [i for i in plan["issues"] if i["severity"] == "error"] == []
    [fact] = plan["facts"]
    assert fact["name"] == "fct_ventes"
    assert sorted(d["name"] for d in plan["dimensions"]) == ["dim_clients", "dim_produits"]
    assert plan["date_dimension"]["enabled"] is True
    assert client.post(f"/projects/{project_id}/gold-plan/approve").json()["status"] == "approved"

    # --- Gold build -------------------------------------------------------------------------
    gold = _run(client, project_id, "build_gold")
    rows = {m["name"]: m["rows"] for m in gold["metrics"]["models"]}
    assert rows["fct_ventes"] == len(ec.lignes_rows())
    assert rows["dim_clients"] == ec.CLIENT_COUNT + 1
    unknown = {u["key"]: u["rows"] for u in gold["metrics"]["unknown_member_rows"]}
    assert unknown["produit_key"] == 1 and unknown["client_key"] > 0
    assert gold["metrics"]["dbt_tests"]["failed"] == 0
    assert client.get(f"/projects/{project_id}/gold-plan").json()["status"] == "applied"

    # --- Serving and export -----------------------------------------------------------------
    export = _run(client, project_id, "export")
    serving = settings.data_dir / export["metrics"]["serving_path"]
    with duckdb.connect(str(serving), read_only=True) as con:
        tables = {row[0] for row in con.execute("SHOW TABLES").fetchall()}
        [(revenue,)] = con.execute("SELECT sum(montant) FROM fct_ventes").fetchall()
    assert tables == {"dim_clients", "dim_date", "dim_produits", "fct_ventes", "_forja_tables"}
    assert revenue > 0

    gold_tables = {t["name"]: t for t in client.get(f"/projects/{project_id}/tables").json()}
    fact_table = gold_tables["fct_ventes"]
    assert fact_table["layer"] == "gold" and fact_table["publish"] is True
    parquet = client.get(f"/tables/{fact_table['id']}/export", params={"format": "parquet"})
    assert parquet.status_code == 200
    assert pq.read_table(io.BytesIO(parquet.content)).num_rows == len(ec.lignes_rows())
    preview = client.get(f"/tables/{gold_tables['dim_clients']['id']}/preview").json()
    assert "jean.dupont@exemple.fr" not in str(preview)

    # --- v2 of clients: one client moved, one new client --------------------------------------
    v2 = _upload(client, project_id, ecommerce_dir / ec.CLIENTS_V2, ec.CLIENTS)
    assert v2["version"] == 2 and v2["id"] == sources[ec.CLIENTS]["id"]
    incremental = _run(client, project_id, "build_silver")
    clients = next(s for s in incremental["metrics"]["sources"] if s["source_name"] == "clients")
    assert clients["rows_read"] == 2 and clients["full_refresh"] is False
    _run(client, project_id, "build_gold")

    warehouse = settings.data_dir / project_id / "warehouse.duckdb"
    with duckdb.connect(str(warehouse), read_only=True) as con:
        versions = con.execute(
            "SELECT ville, segment, is_current, valid_from = TIMESTAMP '1900-01-01' "
            "FROM dim_clients WHERE id_client = ? ORDER BY valid_from",
            [ec.CHANGED_CLIENT],
        ).fetchall()
        [(dimension_rows,)] = con.execute("SELECT count(*) FROM dim_clients").fetchall()
        fact_cities = con.execute(
            "SELECT DISTINCT d.ville FROM fct_ventes f "
            "JOIN dim_clients d ON d.client_key = f.client_key WHERE d.id_client = ?",
            [ec.CHANGED_CLIENT],
        ).fetchall()
    [old, current] = versions
    assert old[2] is False and old[3] is True  # closed version, valid since the origin
    assert current[:3] == (ec.CHANGED_CLIENT_CITY, "professionnel", True)
    assert old[0] != ec.CHANGED_CLIENT_CITY
    # 20 clients + the new one + the second version of the moved client + unknown member.
    assert dimension_rows == ec.CLIENT_COUNT + 3
    # Orders placed before the move keep the city valid at their date.
    assert any(r[1] == ec.CHANGED_CLIENT for r in ec.commandes_rows())
    assert fact_cities == [(old[0],)]
