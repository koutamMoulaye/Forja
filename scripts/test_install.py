"""Installation from scratch, as a new user would do it, then a full clean-up.

    uv run python scripts/test_install.py

1. a clean copy of the committed repository (git archive) in a temporary folder;
2. the images built with docker compose (tagged ``install-test``), the administrator
   and the demo project created with ``forja init --demo``, everything started;
3. through the web container only: sign in with a demo account, ask the agent a question
   the simulated language model answers (docker/compose.install-test.yml), wait for its
   preview;
4. clean-up whatever happened: containers, volumes, test images, dangling Forja images,
   temporary folder. Docker's build cache is shared with other projects: it is left
   alone (``docker builder prune`` reclaims it).

Docker must run, with at least 6 GB free. Prints the image sizes.
"""

from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "forja-install-test"
TAG = "install-test"
PORT = 3999
MIN_FREE_GB = 6
QUESTION = "Chiffre d'affaires par ville des clients pro"


def step(text: str) -> None:
    print(f"\n==> {text}", flush=True)


def compose(folder: Path, *args: str, capture: bool = False) -> str:
    command = [
        "docker", "compose", "-p", PROJECT,
        "-f", "docker-compose.yml", "-f", "docker/compose.install-test.yml", *args,
    ]  # fmt: skip
    result = subprocess.run(
        command,
        cwd=folder,
        env={**_env(), "FORJA_VERSION": TAG, "FORJA_WEB_PORT": str(PORT)},
        check=True,
        text=True,
        encoding="utf-8",
        capture_output=capture,
    )
    return result.stdout if capture else ""


def _env() -> dict[str, str]:
    return dict(os.environ)


def clean_copy(target: Path) -> None:
    archive = subprocess.run(
        ["git", "archive", "--format=tar", "HEAD"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(target, filter="data")


def wait_ready(url: str, timeout: float = 240) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{url}/api/health", timeout=3).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(2)
    raise SystemExit(f"{url} does not answer")


def ask_through_the_web(url: str, email: str, password: str) -> str:
    # The proxy wants mutations from its own origin, with the CSRF cookie echoed.
    with httpx.Client(base_url=url, timeout=30, headers={"Origin": url}) as web:
        web.get("/auth/login")  # the CSRF cookie
        csrf = {"X-CSRF-Token": web.cookies.get("forja_csrf") or ""}
        login = web.post(
            "/api/auth/login", json={"email": email, "password": password}, headers=csrf
        )
        assert login.status_code == 200, login.text
        [project] = web.get("/api/forja/projects").json()
        assert project["name"].startswith("Démo"), project
        asked = web.post(
            f"/api/forja/projects/{project['id']}/mart-requests",
            json={"question": QUESTION},
            headers=csrf,
        )
        assert asked.status_code == 202, asked.text
        mart_id = asked.json()["mart_request"]["id"]
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            request = web.get(f"/api/forja/mart-requests/{mart_id}").json()
            latest = request["iterations"][-1]
            if latest["status"] != "processing":
                assert latest["status"] == "previewed", latest
                assert latest["path"] == "llm", latest  # the simulated model answered
                return str(latest["summary"])
            time.sleep(1)
    raise SystemExit("the agent did not answer")


def image_sizes() -> dict[str, str]:
    out = subprocess.run(
        ["docker", "image", "ls", "--filter", f"reference=forja-*:{TAG}",
         "--format", "{{.Repository}} {{.Size}}"],
        check=True, text=True, capture_output=True,
    ).stdout  # fmt: skip
    return dict(line.split(" ", 1) for line in out.splitlines() if line.strip())


def report(folder: Path, current: str, error: BaseException) -> None:
    """What failed, and the end of the containers' logs, as a CI annotation too."""
    detail = str(error)
    if isinstance(error, subprocess.CalledProcessError):
        detail = f"{error.cmd}: exit {error.returncode}\n{error.stdout or ''}{error.stderr or ''}"
    logs = subprocess.run(
        ["docker", "compose", "-p", PROJECT, "-f", "docker-compose.yml",
         "-f", "docker/compose.install-test.yml", "logs", "--no-color", "--tail", "60"],
        cwd=folder, env={**_env(), "FORJA_VERSION": TAG}, text=True, capture_output=True,
        check=False,
    )  # fmt: skip
    text = f"{current} failed: {detail}\n--- logs ---\n{logs.stdout}{logs.stderr}"
    print(text, file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS"):
        body = text[-6000:].replace("%", "%25").replace("\r", "").replace("\n", "%0A")
        print(f"::error title=install test, {current}::{body}")


def main() -> int:
    free = shutil.disk_usage(ROOT).free / 1024**3
    print(f"free space: {free:.1f} GB")
    if free < MIN_FREE_GB:
        print(f"at least {MIN_FREE_GB} GB are needed", file=sys.stderr)
        return 1
    folder = Path(tempfile.mkdtemp(prefix="forja-install-"))
    started = time.time()
    current = "start"
    try:
        current = "clean copy"
        step(f"clean copy in {folder}")
        clean_copy(folder)
        current = "build"
        step("build")
        compose(folder, "build")
        print(image_sizes())
        current = "forja init --demo"
        step("first start: administrator and demo project")
        out = compose(folder, "run", "--rm", "--no-deps", "api", "forja", "init", "--demo",
                      capture=True)  # fmt: skip
        print(re.sub(r"(mot de passe\s+)\S+", r"\1********", out))
        accounts = dict(re.findall(r"^\s+(\S+@\S+)\s+(\S+)\s*$", out, re.MULTILINE))
        analyst = next(email for email in accounts if email.startswith("analyste"))
        current = "docker compose up"
        step("start")
        compose(folder, "up", "-d")
        url = f"http://localhost:{PORT}"
        wait_ready(url)
        current = "sign in and ask the agent"
        step("sign in and ask the agent, through the web container")
        print(ask_through_the_web(url, analyst, accounts[analyst]))
        print(f"\ninstall test passed in {time.time() - started:.0f} s")
        return 0
    except BaseException as error:
        report(folder, current, error)
        raise
    finally:
        step("clean-up")
        subprocess.run(
            ["docker", "compose", "-p", PROJECT, "-f", "docker-compose.yml",
             "-f", "docker/compose.install-test.yml", "down", "-v", "--rmi", "all",
             "--remove-orphans"],
            cwd=folder, env={**_env(), "FORJA_VERSION": TAG}, check=False,
        )  # fmt: skip
        # Former Forja images left without a tag by the rebuild.
        subprocess.run(
            ["docker", "image", "prune", "-f", "--filter",
             "label=org.opencontainers.image.source=https://github.com/koutamMoulaye/Forja",
             "--filter", "dangling=true"],
            check=False,
        )  # fmt: skip
        shutil.rmtree(folder, ignore_errors=True)
        print(f"free space: {shutil.disk_usage(ROOT).free / 1024**3:.1f} GB")


if __name__ == "__main__":
    sys.exit(main())
