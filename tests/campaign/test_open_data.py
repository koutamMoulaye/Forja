"""Scenario 2: a real open dataset, from files to a star model.

The annual road accident databases of the French Ministry of the Interior (BAAC 2024,
data.gouv.fr, Licence Ouverte 2.0): four related files of real-world shape (semicolon
separated, every value quoted, decimal commas, identifiers grouped by spaces, codes
padded with spaces). They are not in the repository: download them (docs/benchmarks.md)
and set FORJA_OPEN_DATA_DIR to their folder; the scenario is skipped otherwise.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from forja_core.config import Settings
from tests.auth import api_client
from tests.campaign import reference as ref

FILES = ("caract-2024.csv", "lieux-2024.csv", "vehicules-2024.csv", "usagers-2024.csv")
OPEN_DATA = os.environ.get("FORJA_OPEN_DATA_DIR")

pytestmark = pytest.mark.skipif(
    not OPEN_DATA or not all((Path(OPEN_DATA) / f).exists() for f in FILES),
    reason="FORJA_OPEN_DATA_DIR does not hold the BAAC 2024 files",
)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with api_client(settings.model_copy(update={"job_runner": "inline"})) as admin:
        yield admin


def _lines(path: Path) -> int:
    with path.open("rb") as handle:
        return sum(1 for line in handle if line.strip()) - 1


def test_road_accidents_2024(client: TestClient, settings: Settings) -> None:
    folder = Path(OPEN_DATA or "")
    timer = ref.Timer("open-data-baac-2024", settings.data_dir)
    project_id = client.post("/projects", json={"name": "Accidents 2024"}).json()["id"]

    with timer.step("ingestion and profiling"):
        for name in FILES:
            with (folder / name).open("rb") as handle:
                response = client.post(
                    f"/projects/{project_id}/sources", files={"file": (name, handle)}
                )
            assert response.status_code == 201, response.text
    sources = {s["name"]: s for s in client.get(f"/projects/{project_id}/sources").json()}
    summary: dict[str, Any] = {}
    types: dict[str, dict[str, str]] = {}
    for name in FILES:
        source = sources[name.removesuffix(".csv").replace("-", "_")]
        profile = client.get(f"/sources/{source['id']}/profile").json()
        types[source["name"]] = {
            c["name"]: c["inferred"]["inferred_type"] for c in profile["columns"]
        }
        assert source["row_count"] == _lines(folder / name), name
        summary[source["name"]] = {"rows": source["row_count"], "quality": source["quality_score"]}
    # Decimal commas, and identifiers grouped by spaces ("155 781 758") read as integers.
    assert types["caract_2024"]["lat"] == "decimal" and types["caract_2024"]["long"] == "decimal"
    assert types["usagers_2024"]["id_vehicule"] == "integer"
    assert types["vehicules_2024"]["id_vehicule"] == "integer"

    with timer.step("plans and Silver"):
        for source in sources.values():
            approved = client.post(f"/sources/{source['id']}/plan/approve")
            assert approved.status_code == 200, approved.text
        built = client.post(f"/projects/{project_id}/runs", json={"type": "build_silver"})
        assert built.json()["status"] == "succeeded", built.text
    relations = client.get(f"/projects/{project_id}/relations").json()
    found = {
        (r["from_source"], r["from_column"], r["to_source"], r["to_column"]) for r in relations
    }
    assert {
        ("lieux_2024", "num_acc", "caract_2024", "num_acc"),
        ("vehicules_2024", "num_acc", "caract_2024", "num_acc"),
        ("usagers_2024", "num_acc", "caract_2024", "num_acc"),
        ("usagers_2024", "id_vehicule", "vehicules_2024", "id_vehicule"),
    } <= found, found

    with timer.step("Gold"):
        for relation in relations:
            client.post(f"/relations/{relation['id']}/confirm")
        proposed = client.post(f"/projects/{project_id}/gold-plan/propose", json={"use_llm": False})
        assert proposed.json()["status"] == "succeeded", proposed.text
        assert client.post(f"/projects/{project_id}/gold-plan/approve").status_code == 200
        gold = client.post(f"/projects/{project_id}/runs", json={"type": "build_gold"}).json()
        assert gold["status"] == "succeeded", gold
    plan = client.get(f"/projects/{project_id}/gold-plan").json()
    timer.write(
        sources=summary,
        relations=sorted("/".join(r) for r in found),
        gold={
            "dimensions": [d["name"] for d in plan["dimensions"]],
            "facts": [f["name"] for f in plan["facts"]],
        },
    )
