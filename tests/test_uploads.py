"""Chunked, resumable uploads of large files, and credentials encrypted at rest."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_api.state import AppState
from forja_core.config import Settings
from forja_core.connectors.vault import SecretVault, VaultError, redact
from tests.auth import api_client

CHUNK = 1024 * 1024


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    local = settings.model_copy(
        update={"job_runner": "inline", "scheduler_enabled": False, "upload_chunk_mb": 1}
    )
    with api_client(local) as test_client:
        yield test_client


def _csv(rows: int) -> bytes:
    lines = ["id;ville;montant"] + [f"{i};Ville {i % 7};{i * 1.5}" for i in range(rows)]
    return ("\n".join(lines) + "\n").encode()


def _put(client: TestClient, upload_id: str, offset: int, data: bytes) -> dict[str, object]:
    response = client.put(
        f"/uploads/{upload_id}/chunks",
        params={"offset": offset},
        content=data,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


def test_upload_resumes_after_a_cut_and_lands_the_file(client: TestClient) -> None:
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    project_id = client.post("/projects", json={"name": "Gros fichiers"}).json()["id"]
    content = _csv(120_000)
    assert len(content) > 2 * CHUNK
    opened = client.post(
        f"/projects/{project_id}/uploads",
        json={"filename": "ventes.csv", "size": len(content), "fingerprint": "ventes.csv-1"},
    )
    assert opened.status_code == 201, opened.text
    upload = opened.json()
    assert upload["chunk_size"] == CHUNK and upload["received"] == 0

    _put(client, upload["id"], 0, content[:CHUNK])
    # The connection drops in the middle of the second chunk: half of it reached the disk.
    staged = state.uploads.staged_path(state.uploads.get(upload["id"]))
    with staged.open("ab") as handle:
        handle.write(content[CHUNK : CHUNK + 1000])

    # The page is reopened: the same file finds its session and where to resume.
    again = client.post(
        f"/projects/{project_id}/uploads",
        json={"filename": "ventes.csv", "size": len(content), "fingerprint": "ventes.csv-1"},
    ).json()
    assert again["id"] == upload["id"] and again["received"] == CHUNK + 1000

    wrong = client.put(
        f"/uploads/{upload['id']}/chunks", params={"offset": 0}, content=content[:10]
    )
    assert wrong.status_code == 409
    assert wrong.json()["error"]["details"]["received"] == CHUNK + 1000
    early = client.post(f"/uploads/{upload['id']}/complete")
    assert early.status_code == 409 and early.json()["error"]["code"] == "upload_incomplete"

    offset = CHUNK + 1000
    while offset < len(content):
        body = _put(client, upload["id"], offset, content[offset : offset + CHUNK])
        offset = int(body["received"])  # type: ignore[call-overload]
    assert body["status"] == "complete"

    run = client.post(f"/uploads/{upload['id']}/complete")
    assert run.status_code == 202, run.text
    job = run.json()
    assert job["type"] == "ingest" and job["status"] == "succeeded", job
    [source_id] = job["result"]["sources"]
    source = client.get(f"/sources/{source_id}").json()
    assert source["name"] == "ventes" and source["row_count"] == 120_000
    assert not staged.exists()
    assert client.get(f"/uploads/{upload['id']}").json()["status"] == "ingested"
    # Completing twice gives the same run.
    assert client.post(f"/uploads/{upload['id']}/complete").json()["id"] == job["id"]


def test_upload_limits(client: TestClient) -> None:
    project_id = client.post("/projects", json={"name": "Limites"}).json()["id"]
    too_big = client.post(
        f"/projects/{project_id}/uploads", json={"filename": "x.csv", "size": 11 * 1024**3}
    )
    assert too_big.status_code == 413
    unsupported = client.post(
        f"/projects/{project_id}/uploads", json={"filename": "x.exe", "size": 10}
    )
    assert unsupported.status_code == 415
    upload = client.post(
        f"/projects/{project_id}/uploads", json={"filename": "x.csv", "size": 10}
    ).json()
    beyond = client.put(f"/uploads/{upload['id']}/chunks", params={"offset": 0}, content=b"x" * 11)
    assert beyond.status_code == 413
    assert client.get(f"/uploads/{upload['id']}").json()["received"] == 0
    cancelled = client.delete(f"/uploads/{upload['id']}")
    assert cancelled.json()["status"] == "cancelled"


def test_expired_uploads_are_purged(client: TestClient) -> None:
    from datetime import timedelta

    from forja_core.models import UploadCreate
    from forja_core.utils import utcnow

    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    project_id = client.post("/projects", json={"name": "Purge"}).json()["id"]
    session = state.uploads.create(
        project_id, UploadCreate(filename="a.csv", size=100), created_by=None
    )
    state.uploads.append(session.id, 0, __import__("io").BytesIO(b"id\n1\n"))
    path = state.uploads.staged_path(session)
    assert path.exists()
    assert state.uploads.purge_expired(utcnow() + timedelta(days=3)) == 1
    assert not path.exists()
    assert state.uploads.get(session.id).status.value == "cancelled"


# --- credentials at rest ------------------------------------------------------------------


def test_vault_encrypts_and_binds_to_the_connection(tmp_path: Path) -> None:
    vault = SecretVault(tmp_path / "secrets")
    token = vault.encrypt({"password": "Tr3s-Secret"}, bound_to="conn-1")
    assert token is not None and "Tr3s-Secret" not in token
    assert vault.decrypt(token, bound_to="conn-1") == {"password": "Tr3s-Secret"}
    with pytest.raises(VaultError):
        vault.decrypt(token, bound_to="conn-2")
    key = tmp_path / "secrets" / SecretVault.FILENAME
    assert key.exists()
    if os.name != "nt":
        assert key.stat().st_mode & 0o777 == 0o600
    key.write_text("00" * 32, encoding="ascii")
    with pytest.raises(VaultError, match="key in FORJA_SECRETS_DIR changed"):
        vault.decrypt(token, bound_to="conn-1")
    assert vault.encrypt({}, bound_to="x") is None


def test_catalog_holds_only_ciphertext(client: TestClient, settings: Settings) -> None:
    project_id = client.post("/projects", json={"name": "Coffre"}).json()["id"]
    created = client.post(
        f"/projects/{project_id}/connections",
        json={
            "name": "Entrepôt",
            "type": "postgres",
            "params": {"host": "db.exemple.fr", "database": "dw", "username": "lecteur"},
            "secrets": {"password": "Mot-De-Passe-Unique-77"},
        },
    )
    assert created.status_code == 201, created.text
    assert "Mot-De-Passe-Unique-77" not in created.text
    state: AppState = client.app.state.forja  # type: ignore[attr-defined]
    stored = state.catalog.connection_secrets(created.json()["id"])
    assert stored is not None and stored.startswith("v1:")
    assert "Mot-De-Passe-Unique-77" not in stored
    # Changing the name keeps the password; an empty value removes it.
    renamed = client.patch(f"/connections/{created.json()['id']}", json={"name": "DW"}).json()
    assert renamed["secrets_set"] == ["password"]
    cleared = client.patch(
        f"/connections/{created.json()['id']}", json={"secrets": {"password": ""}}
    ).json()
    assert cleared["secrets_set"] == []


def test_redact_removes_secret_values() -> None:
    message = "login failed for user lecteur with password Mot-De-Passe-77"
    assert redact(message, {"password": "Mot-De-Passe-77"}) == (
        "login failed for user lecteur with password ***"
    )
