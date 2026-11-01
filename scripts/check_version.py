"""Check that every place naming Forja's version agrees, before a release.

    uv run python scripts/check_version.py            # all equal to the API's version
    uv run python scripts/check_version.py v0.1.0     # ... and to this tag
    uv run python scripts/check_version.py --notes v0.1.0   # its CHANGELOG section

Exits 1 and lists the disagreements. Used by .github/workflows/release.yml.
"""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def found() -> dict[str, str | None]:
    def toml(path: str) -> str:
        return str(tomllib.loads((ROOT / path).read_text(encoding="utf-8"))["project"]["version"])

    def search(path: str, pattern: str) -> str | None:
        match = re.search(pattern, (ROOT / path).read_text(encoding="utf-8"), re.MULTILINE)
        return match.group(1) if match else None

    return {
        "pyproject.toml": toml("pyproject.toml"),
        "apps/api/pyproject.toml": toml("apps/api/pyproject.toml"),
        "packages/core/pyproject.toml": toml("packages/core/pyproject.toml"),
        "packages/llm/pyproject.toml": toml("packages/llm/pyproject.toml"),
        "forja_core.__version__": search(
            "packages/core/src/forja_core/__init__.py", r'^__version__ = "([^"]+)"'
        ),
        "apps/web/package.json": json.loads(
            (ROOT / "apps/web/package.json").read_text(encoding="utf-8")
        )["version"],
        "docker/api.Dockerfile": search("docker/api.Dockerfile", r"^ARG FORJA_VERSION=(\S+)"),
        "docker/web.Dockerfile": search("docker/web.Dockerfile", r"^ARG FORJA_VERSION=(\S+)"),
        "docker-compose.yml": search("docker-compose.yml", r"FORJA_VERSION:-([^}]+)\}"),
        "docker/compose.build.yml": search("docker/compose.build.yml", r"FORJA_VERSION:-([^}]+)\}"),
        "CHANGELOG.md (latest release)": search("CHANGELOG.md", r"^## \[(\d+\.\d+\.\d+[^\]]*)\]"),
    }


def notes(version: str) -> str:
    """The CHANGELOG.md section of a version, without its title."""
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    match = re.search(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|^\[[^\]]+\]: |\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--notes":
        section = notes(sys.argv[2].removeprefix("v"))
        if not section:
            print(f"no section for {sys.argv[2]} in CHANGELOG.md", file=sys.stderr)
            return 1
        print(section)
        return 0
    versions = found()
    expected = versions["forja_core.__version__"]
    if len(sys.argv) > 1:
        expected = sys.argv[1].removeprefix("v")
    wrong = {where: v for where, v in versions.items() if v != expected}
    for where, version in versions.items():
        print(f"{'ok ' if where not in wrong else 'BAD'} {where}: {version}")
    if wrong:
        print(f"\nExpected {expected} everywhere.", file=sys.stderr)
        return 1
    print(f"\nVersion {expected} everywhere.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
