"""The reference journey of the test campaign: one file, one PostgreSQL table and one API.

- ``produits.csv``: the product catalogue, uploaded;
- ``ventes.commandes`` in PostgreSQL: the orders, loaded incrementally on ``updated_at``;
- ``/v1/page/clients`` on the fake API: the customers, with their city.

Everything is generated here and removed by the tests that use it.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from fastapi.testclient import TestClient

from tests import databases as db
from tests.test_api import wait_for_run

CITIES = ("Lyon", "Paris", "Nantes", "Lille")
PRODUCTS = 10
CLIENTS = 12


def products_csv(path: Path) -> Path:
    lines = ["id_produit;libelle;categorie;prix"]
    for i in range(1, PRODUCTS + 1):
        lines.append(f"P{i:03d};Produit {i};{'Maison' if i % 2 else 'Jardin'};{4.5 * i:.2f}")
    path.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))
    return path


def clients() -> list[dict[str, Any]]:
    return [
        {
            "id_client": f"C{i:03d}",
            "nom": f"Client {i}",
            "ville": CITIES[i % len(CITIES)],
            "segment": "Pro" if i % 3 == 0 else "Particulier",
            "updated_at": f"2026-01-01T0{i % 9}:00:00Z",
        }
        for i in range(1, CLIENTS + 1)
    ]


def seed_orders(database: db.TestDatabase, ids: range, *, month: int) -> None:
    """Orders of 2026, one product and one customer each, changed when created."""
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        con.execute(sa.text("CREATE SCHEMA IF NOT EXISTS ventes"))
        con.execute(
            sa.text(
                "CREATE TABLE IF NOT EXISTS ventes.commandes ("
                "id_commande INTEGER PRIMARY KEY, id_client VARCHAR(10) NOT NULL, "
                "id_produit VARCHAR(10) NOT NULL, date_commande DATE NOT NULL, "
                "montant NUMERIC(10, 2) NOT NULL, updated_at TIMESTAMP NOT NULL)"
            )
        )
        for i in ids:
            con.execute(
                sa.text("INSERT INTO ventes.commandes VALUES (:i, :c, :p, :d, :m, :u)"),
                {
                    "i": i,
                    "c": f"C{1 + i % CLIENTS:03d}",
                    "p": f"P{1 + i % PRODUCTS:03d}",
                    "d": f"2026-{month:02d}-{1 + i % 27:02d}",
                    "m": f"{10 + (i * 7) % 90}.50",
                    "u": f"2026-{month:02d}-{1 + i % 27:02d} 09:{i % 60:02d}:00",
                },
            )
        con.execute(sa.text(f"GRANT USAGE ON SCHEMA ventes TO {db.READER}"))
        con.execute(sa.text(f"GRANT SELECT ON ALL TABLES IN SCHEMA ventes TO {db.READER}"))
    engine.dispose()


def drop_orders(database: db.TestDatabase) -> None:
    engine = sa.create_engine(database.admin_url())
    with engine.begin() as con:
        con.execute(sa.text("DROP SCHEMA IF EXISTS ventes CASCADE"))
    engine.dispose()


def run(client: TestClient, response: Any) -> dict[str, Any]:
    """The run answered by ``response``, once finished; fails with its logs otherwise."""
    assert response.status_code in (200, 201, 202), response.text
    body = response.json()
    if "run" in body and isinstance(body["run"], dict):
        body = body["run"]
    result = wait_for_run(client, body["id"])
    assert result["status"] == "succeeded", client.get(f"/runs/{body['id']}/logs").text
    return result


class Timer:
    """Duration of each step, written to $FORJA_CAMPAIGN_REPORT/<name>.json when set."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.steps: dict[str, float] = {}

    @contextmanager
    def step(self, label: str) -> Iterator[None]:
        started = time.perf_counter()
        try:
            yield
        finally:
            self.steps[label] = round(time.perf_counter() - started, 2)

    def write(self, **extra: Any) -> None:
        target = os.environ.get("FORJA_CAMPAIGN_REPORT")
        if not target:
            return
        Path(target).mkdir(parents=True, exist_ok=True)
        (Path(target) / f"{self.name}.json").write_text(
            json.dumps({"steps": self.steps, **extra}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
