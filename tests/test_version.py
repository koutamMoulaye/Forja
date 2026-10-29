"""One product version for the API, the web and the Docker images."""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from forja_core import __version__

ROOT = Path(__file__).parents[1]


def test_one_version_everywhere() -> None:
    versions = {"forja_core.__version__": __version__}
    for path in ("pyproject.toml", "apps/api/pyproject.toml", "packages/core/pyproject.toml",
                 "packages/llm/pyproject.toml"):  # fmt: skip
        versions[path] = tomllib.loads((ROOT / path).read_text(encoding="utf-8"))["project"][
            "version"
        ]
    package = json.loads((ROOT / "apps/web/package.json").read_text(encoding="utf-8"))
    versions["apps/web/package.json"] = package["version"]
    for path in ("docker/api.Dockerfile", "docker/web.Dockerfile"):
        found = re.search(r"ARG FORJA_VERSION=(\S+)", (ROOT / path).read_text(encoding="utf-8"))
        assert found is not None, path
        versions[path] = found.group(1)
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    versions["docker-compose.yml"] = re.findall(r"FORJA_VERSION:-([\d.]+)", compose)[0]
    assert len(set(versions.values())) == 1, versions
