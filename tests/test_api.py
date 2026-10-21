from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from forja_api.main import create_app
from forja_core.config import Settings
from forja_core.models import TECHNICAL_COLUMNS
from tests.fixtures import generate as fx


def _create_project(client: TestClient, name: str = "Ventes") -> str:
    response = client.post("/projects", json={"name": name})
    assert response.status_code == 201, response.text
    project_id: str = response.json()["id"]
    return project_id


def _upload(client: TestClient, project_id: str, path: Path) -> list[dict[str, object]]:
    with path.open("rb") as handle:
        response = client.post(
            f"/projects/{project_id}/sources", files={"file": (path.name, handle)}
        )
    assert response.status_code == 201, response.text
    body: list[dict[str, object]] = response.json()
    return body


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "x-request-id" in response.headers


def test_create_and_list_projects(client: TestClient) -> None:
    response = client.post("/projects", json={"name": "  Finance  ", "description": "Budget"})
    assert response.status_code == 201
    project = response.json()
    assert project["name"] == "Finance"
    assert project["architecture"] == "medallion"

    listed = client.get("/projects").json()
    assert [p["id"] for p in listed] == [project["id"]]


def test_project_name_conflict(client: TestClient) -> None:
    _create_project(client, "Finance")
    response = client.post("/projects", json={"name": "finance"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_project_validation(client: TestClient) -> None:
    assert client.post("/projects", json={"name": ""}).status_code == 422
    assert client.post("/projects", json={"name": "x", "architecture": "mesh"}).status_code == 422


def test_project_directories_are_created(client: TestClient, settings: Settings) -> None:
    project_id = _create_project(client)
    for layer in ("bronze", "silver", "gold"):
        assert (settings.data_dir / project_id / layer).is_dir()


def test_upload_profile_and_preview(client: TestClient, fixtures_dir: Path) -> None:
    project_id = _create_project(client)
    [source] = _upload(client, project_id, fixtures_dir / fx.FR_CSV)
    assert source["delimiter"] == ";"
    assert source["quality_score"] is not None

    listed = client.get(f"/projects/{project_id}/sources").json()
    assert [s["id"] for s in listed] == [source["id"]]

    profile = client.get(f"/sources/{source['id']}/profile").json()
    assert profile["row_count"] == 32
    assert profile["duplicates"]["duplicate_rows"] == 2
    assert {p["pii_type"] for p in profile["pii"]} >= {"email", "phone", "iban"}

    blocked = client.get(f"/sources/{source['id']}/preview")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "forbidden"


def test_bronze_preview_when_allowed(settings: Settings, fixtures_dir: Path) -> None:
    allowed = settings.model_copy(update={"allow_bronze_preview": True})
    with TestClient(create_app(allowed)) as client:
        project_id = _create_project(client)
        [source] = _upload(client, project_id, fixtures_dir / fx.FR_CSV)
        preview = client.get(f"/sources/{source['id']}/preview", params={"limit": 5}).json()
        default = client.get(f"/sources/{source['id']}/preview").json()
    assert default["limit"] == 100
    assert len(default["rows"]) == 32
    assert preview["limit"] == 5
    assert preview["total_rows"] == 32
    assert len(preview["rows"]) == 5
    assert preview["columns"][-len(TECHNICAL_COLUMNS) :] == list(TECHNICAL_COLUMNS)
    assert preview["rows"][0]["prénom"] == "Jean"


def test_upload_modes_and_versions(client: TestClient, fixtures_dir: Path) -> None:
    project_id = _create_project(client)
    path = fixtures_dir / fx.UTF8_COMMA_CSV
    [first] = _upload(client, project_id, path)

    [again] = _upload(client, project_id, path)
    assert again["id"] == first["id"]
    assert again["version"] == 2

    with path.open("rb") as handle:
        response = client.post(
            f"/projects/{project_id}/sources",
            params={"mode": "new_source"},
            files={"file": (path.name, handle)},
        )
    assert response.status_code == 201
    assert response.json()[0]["name"] == "orders_utf8_2"

    with path.open("rb") as handle:
        response = client.post(
            f"/sources/{first['id']}/versions", files={"file": ("autre_nom.csv", handle)}
        )
    assert response.status_code == 201
    assert response.json()["version"] == 3

    versions = client.get(f"/sources/{first['id']}/versions").json()
    assert [v["version"] for v in versions] == [1, 2, 3]
    assert versions[1]["schema_drift"]["has_drift"] is False
    assert client.get(f"/sources/{first['id']}").json()["version"] == 3
    assert (
        client.get(f"/sources/{first['id']}/profile", params={"version": 1}).json()["version"] == 1
    )

    with path.open("rb") as handle:
        response = client.post(
            f"/projects/{project_id}/sources",
            params={"mode": "new_version"},
            files={"file": ("inconnu.csv", handle)},
        )
    assert response.status_code == 404


def test_upload_excel_returns_one_source_per_sheet(client: TestClient, fixtures_dir: Path) -> None:
    project_id = _create_project(client)
    sources = _upload(client, project_id, fixtures_dir / fx.EXCEL)
    assert [s["sheet_name"] for s in sources] == ["Commandes", "Magasins"]


def test_upload_errors(client: TestClient, fixtures_dir: Path) -> None:
    project_id = _create_project(client)
    cases = {
        fx.EMPTY: (422, "empty_file"),
        fx.CORRUPTED_PARQUET: (422, "corrupted_file"),
        fx.BINARY_CSV: (422, "unknown_encoding"),
    }
    for name, (status_code, code) in cases.items():
        with (fixtures_dir / name).open("rb") as handle:
            response = client.post(
                f"/projects/{project_id}/sources", files={"file": (name, handle)}
            )
        assert response.status_code == status_code, name
        assert response.json()["error"]["code"] == code

    response = client.post(
        f"/projects/{project_id}/sources", files={"file": ("doc.pdf", b"%PDF-1.7")}
    )
    assert response.status_code == 415
    assert client.get(f"/projects/{project_id}/sources").json() == []


def test_upload_size_limit(settings: Settings, tmp_path: Path) -> None:
    small = settings.model_copy(update={"max_upload_mb": 1})
    with TestClient(create_app(small)) as client:
        project_id = _create_project(client)
        payload = b"a,b\n" + b"1,2\n" * 300_000
        response = client.post(
            f"/projects/{project_id}/sources", files={"file": ("big.csv", payload)}
        )
    assert response.status_code == 413
    assert not any((small.data_dir / project_id / "_staging").iterdir())


def wait_for_run(client: TestClient, run_id: str, timeout: float = 300) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run: dict[str, Any] = client.get(f"/runs/{run_id}").json()
        if run["status"] in ("succeeded", "failed"):
            return run
        time.sleep(0.2)
    raise AssertionError(f"run {run_id} did not finish within {timeout} s")


def test_runs_endpoints(client: TestClient, fixtures_dir: Path) -> None:
    project_id = _create_project(client)
    _upload(client, project_id, fixtures_dir / fx.UTF8_COMMA_CSV)

    response = client.post(f"/projects/{project_id}/runs", json={"type": "profile"})
    assert response.status_code == 202
    assert response.json()["status"] in ("queued", "running", "succeeded")
    run = wait_for_run(client, response.json()["id"])
    assert run["status"] == "succeeded"
    assert run["metrics"]["profiled_sources"] == 1

    logs = client.get(f"/runs/{run['id']}/logs")
    assert logs.headers["content-type"].startswith("text/plain")
    assert "profile succeeded" in logs.text
    assert [r["id"] for r in client.get(f"/projects/{project_id}/runs").json()] == [run["id"]]

    assert client.post(f"/projects/{project_id}/runs", json={"type": "nope"}).status_code == 422
    assert client.get("/runs/missing").status_code == 404
    assert client.get("/runs/missing/logs").status_code == 404


def test_not_found(client: TestClient) -> None:
    assert client.get("/projects/missing/sources").status_code == 404
    assert client.get("/sources/missing/profile").status_code == 404
    response = client.get("/sources/missing/preview")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "source_not_found"
    upload = client.post("/projects/missing/sources", files={"file": ("a.csv", b"a\n1\n")})
    assert upload.status_code == 404
