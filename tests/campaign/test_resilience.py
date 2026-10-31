"""Scenario 7: resilience. The API process is killed (no shutdown: a crash, a machine
cut) during a build, an upload and a scheduled load, then started again.

- A build left half done fails, marked interrupted; the next one succeeds.
- An upload resumes where its chunks stopped.
- A scheduled load interrupted fails; the occurrence missed while the API was down runs
  once after the restart (not once per missed minute) and reads the new rows once.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from collections.abc import Callable, Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import pytest

from tests.campaign import reference as ref
from tests.fake_api import STALL, FakeApiState, make_orders, serve

PASSWORD = "Campagne-resilience-2026"
CHANGED = "Campagne-resilience-2026-bis"


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class ForjaProcess:
    """`forja-api` in its own process, on a workspace that outlives it."""

    def __init__(self, root: Path, **env: str) -> None:
        self.port = _free_port()
        self.env = {
            **os.environ,
            "FORJA_DATA_DIR": str(root / "data"),
            "FORJA_SECRETS_DIR": str(root / "secrets"),
            "FORJA_API_HOST": "127.0.0.1",
            "FORJA_API_PORT": str(self.port),
            "FORJA_AUTH_MODE": "multi",
            "FORJA_AUTH_BOOTSTRAP_PASSWORD": PASSWORD,
            "FORJA_LLM_PROVIDER": "",
            "FORJA_LOG_LEVEL": "WARNING",
            "FORJA_LOG_FORMAT": "console",
            "PYTHONIOENCODING": "utf-8",
            **env,
        }
        self.log = root / "api.log"
        self.process: subprocess.Popen[bytes] | None = None
        self.token = ""

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        with self.log.open("ab") as log:
            self.process = subprocess.Popen(
                [sys.executable, "-c", "from forja_api.main import run; run()"],
                env=self.env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            assert self.process.poll() is None, self.log.read_text(errors="replace")[-2000:]
            try:
                if httpx.get(f"{self.base}/health", timeout=2).status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(0.3)
        else:
            raise AssertionError("the API did not start")
        for password in (CHANGED, PASSWORD):
            login = httpx.post(
                f"{self.base}/auth/login",
                json={"email": "admin@forja.local", "password": password},
                timeout=30,
            )
            if login.status_code == 200:
                break
        body = login.json()
        self.token = body["access_token"]
        if body.get("must_change_password"):
            changed = httpx.post(
                f"{self.base}/auth/password",
                headers={"Authorization": f"Bearer {self.token}"},
                json={"current_password": PASSWORD, "new_password": CHANGED},
                timeout=30,
            )
            assert changed.status_code == 200, changed.text
            self.token = changed.json()["access_token"]

    def kill(self) -> None:
        """No shutdown: the process is gone at once, as in a crash."""
        assert self.process is not None
        self.process.kill()
        self.process.wait(timeout=30)

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.token}", **kwargs.pop("headers", {})}
        return httpx.request(method, f"{self.base}{path}", headers=headers, timeout=60, **kwargs)

    def wait(self, path: str, done: Callable[[Any], bool], seconds: float = 180) -> Any:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            body = self.request("GET", path).json()
            if done(body):
                return body
            time.sleep(0.5)
        raise AssertionError(f"{path} never reached the expected state: {body}")


@pytest.fixture
def forja(tmp_path: Path) -> Iterator[Callable[..., ForjaProcess]]:
    started: list[ForjaProcess] = []

    def make(**env: str) -> ForjaProcess:
        process = ForjaProcess(tmp_path, **env)
        started.append(process)
        return process

    yield make
    for process in started:
        if process.process is not None and process.process.poll() is None:
            process.kill()


def _runs(api: ForjaProcess, project_id: str) -> list[dict[str, Any]]:
    body = api.request("GET", f"/projects/{project_id}/runs?limit=100").json()
    runs: list[dict[str, Any]] = body["items"] if isinstance(body, dict) else body
    return runs


def _csv(rows: int) -> bytes:
    lines = ["id;ville;montant"] + [f"{i};Ville {i % 7};{i * 1.5}" for i in range(rows)]
    return ("\n".join(lines) + "\n").encode()


def test_a_build_interrupted_by_a_crash_fails_and_the_next_one_succeeds(
    forja: Callable[..., ForjaProcess], tmp_path: Path
) -> None:
    timer = ref.Timer("resilience-build")
    api = forja(FORJA_SCHEDULER_ENABLED="false")
    api.start()
    project_id = api.request("POST", "/projects", json={"name": "Reprise"}).json()["id"]
    products = ref.products_csv(tmp_path / "produits.csv")
    [source] = api.request(
        "POST", f"/projects/{project_id}/sources", files={"file": products.open("rb")}
    ).json()
    assert api.request("POST", f"/sources/{source['id']}/plan/approve").status_code == 200
    job = api.request("POST", f"/projects/{project_id}/runs", json={"type": "build_silver"}).json()
    # Killed while dbt runs.
    deadline = time.monotonic() + 120
    while "dbt build" not in api.request("GET", f"/runs/{job['id']}/logs").text:
        assert time.monotonic() < deadline, "dbt never started"
        time.sleep(0.3)
    with timer.step("restart"):
        api.kill()
        api.start()
    interrupted = api.request("GET", f"/runs/{job['id']}").json()
    assert interrupted["status"] == "failed"
    assert "interrupted" in interrupted["error"]
    with timer.step("build again"):
        again = api.request(
            "POST", f"/projects/{project_id}/runs", json={"type": "build_silver"}
        ).json()
        finished = api.wait(
            f"/runs/{again['id']}", lambda b: b["status"] != "running" and b["status"] != "queued"
        )
    assert finished["status"] == "succeeded", api.request("GET", f"/runs/{again['id']}/logs").text
    timer.write()


def test_an_upload_cut_by_a_crash_resumes_where_it_stopped(
    forja: Callable[..., ForjaProcess],
) -> None:
    api = forja(FORJA_SCHEDULER_ENABLED="false", FORJA_UPLOAD_CHUNK_MB="1")
    api.start()
    project_id = api.request("POST", "/projects", json={"name": "Envoi"}).json()["id"]
    content = _csv(200_000)
    chunk = 1024 * 1024
    assert len(content) > 3 * chunk
    opening = {"filename": "ventes.csv", "size": len(content), "fingerprint": "ventes-1"}
    upload = api.request("POST", f"/projects/{project_id}/uploads", json=opening).json()
    for offset in (0, chunk):
        sent = api.request(
            "PUT",
            f"/uploads/{upload['id']}/chunks",
            params={"offset": offset},
            content=content[offset : offset + chunk],
            headers={"Content-Type": "application/octet-stream"},
        )
        assert sent.status_code == 200, sent.text

    api.kill()
    api.start()
    again = api.request("POST", f"/projects/{project_id}/uploads", json=opening).json()
    assert again["id"] == upload["id"] and again["received"] == 2 * chunk
    offset = again["received"]
    while offset < len(content):
        body = api.request(
            "PUT",
            f"/uploads/{upload['id']}/chunks",
            params={"offset": offset},
            content=content[offset : offset + chunk],
            headers={"Content-Type": "application/octet-stream"},
        ).json()
        offset = body["received"]
    job = api.request("POST", f"/uploads/{upload['id']}/complete").json()
    job = api.wait(f"/runs/{job['id']}", lambda b: b["status"] in ("succeeded", "failed"))
    assert job["status"] == "succeeded", job
    [source_id] = job["result"]["sources"]
    assert api.request("GET", f"/sources/{source_id}").json()["row_count"] == 200_000


def test_a_scheduled_load_cut_by_a_crash_is_caught_up_once(
    forja: Callable[..., ForjaProcess],
) -> None:
    timer = ref.Timer("resilience-schedule")
    with serve(FakeApiState(orders=make_orders(8))) as (base, fake):
        api = forja(
            FORJA_SCHEDULER_TICK_SECONDS="1",
            FORJA_CONNECTOR_ALLOWED_HOSTS='["127.0.0.1"]',
        )
        api.start()
        project_id = api.request("POST", "/projects", json={"name": "Planifié"}).json()["id"]
        connection = api.request(
            "POST",
            f"/projects/{project_id}/connections",
            json={
                "name": "Boutique",
                "type": "rest_api",
                "params": {
                    "base_url": base,
                    "pagination": {"kind": "page_number", "page_size": 3},
                    "timeout_seconds": 120,
                    "endpoints": [
                        {
                            "name": "orders",
                            "path": "/page/orders",
                            "incremental": {"param": "since", "cursor_field": "updated_at"},
                        }
                    ],
                },
            },
        ).json()
        imported = api.request(
            "POST",
            f"/connections/{connection['id']}/import",
            json={"endpoints": [{"endpoint": "orders"}]},
        ).json()
        api.wait(f"/runs/{imported['run']['id']}", lambda b: b["status"] == "succeeded")

        # Every minute; the next load hangs on the API, and the process dies under it.
        fake.stall_seconds = 90
        fake.failures = [STALL]
        saved = api.request(
            "PUT", f"/connections/{connection['id']}/schedule", json={"text": "* * * * *"}
        )
        assert saved.status_code == 200, saved.text
        hanging = api.wait(
            f"/projects/{project_id}/runs?limit=100",
            lambda body: any(
                r["type"] == "load" and r["status"] == "running"
                for r in (body["items"] if isinstance(body, dict) else body)
            ),
            90,
        )
        [stuck] = [
            r
            for r in (hanging["items"] if isinstance(hanging, dict) else hanging)
            if r["type"] == "load" and r["status"] == "running"
        ]
        api.kill()
        fake.failures = []
        fake.orders += make_orders(3, start=50)
        # Down past the next minute: that occurrence is missed.
        down = datetime.now()
        time.sleep(62 - down.second)

        with timer.step("restart and catch-up"):
            api.start()
            assert api.request("GET", f"/runs/{stuck['id']}").json()["status"] == "failed"
            caught = api.wait(
                f"/projects/{project_id}/runs?limit=100",
                lambda body: any(
                    r["type"] == "load"
                    and r["status"] == "succeeded"
                    and r["created_at"] > stuck["created_at"]
                    for r in (body["items"] if isinstance(body, dict) else body)
                ),
                45,
            )
        after = [
            r
            for r in (caught["items"] if isinstance(caught, dict) else caught)
            if r["type"] == "load" and r["created_at"] > stuck["created_at"]
        ]
        # One load for the missed minute, not one per minute missed.
        assert len(after) == 1, after
        loads = {m["object"]: m for m in after[0]["metrics"]["loads"]}
        assert loads["orders"]["rows"] == 3
        api.request("DELETE", f"/connections/{connection['id']}/schedule")
    timer.write()
