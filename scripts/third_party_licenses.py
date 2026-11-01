"""Write THIRD_PARTY_LICENSES.md: the licenses of what the images ship.

    uv run python scripts/third_party_licenses.py [--python <interpreter>]

Python: the distributions installed for ``--python`` (by default a fresh environment of
the production dependencies, ``uv sync --no-dev`` into a temporary folder), read from
their metadata. Web: ``pnpm licenses list --prod`` in apps/web. Fonts are listed by hand:
they are files of the repository, under the SIL Open Font License.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "THIRD_PARTY_LICENSES.md"

# Distributions whose metadata gives no usable license string, checked by hand.
KNOWN = {
    "text-unidecode": "Artistic-1.0 OR GPL-1.0-or-later (Artistic-1.0 chosen)",
    "pymssql": "LGPL-2.1-or-later",
}
# Packages built per platform (sharp, libvips, the Next.js compiler): one line each.
NATIVE_PREFIXES = ("@img/sharp-libvips-", "@img/sharp-", "@next/swc-")
# Licenses that need a word in NOTICE (weak copyleft, attribution, choice of license).
NOTED = ("LGPL", "MPL", "EPL", "CC-BY", "Artistic", "GPL")

METADATA = """
import json
from importlib.metadata import distributions

rows = []
for dist in distributions():
    meta = dist.metadata
    license = meta.get("License-Expression") or ""
    if not license:
        classifiers = [c.split(" :: ")[-1] for c in meta.get_all("Classifier") or []
                       if c.startswith("License ::")]
        license = " / ".join(classifiers) or (meta.get("License") or "").splitlines()[0:1]
        license = license if isinstance(license, str) else " ".join(license)
    urls = meta.get_all("Project-URL") or []
    home = meta.get("Home-page") or next((u.split(", ", 1)[-1] for u in urls), "")
    rows.append({"name": meta["Name"], "version": dist.version, "license": license, "url": home})
print(json.dumps(rows))
"""

FONTS = [
    ("Instrument Sans", "OFL-1.1", "apps/web/src/fonts/OFL-InstrumentSans.txt"),
    ("Commit Mono", "OFL-1.1", "apps/web/src/fonts/OFL-CommitMono.txt"),
]


def python_packages(python: str | None) -> list[dict[str, str]]:
    with tempfile.TemporaryDirectory() as venv:
        if python is None:
            env = {**os.environ, "UV_PROJECT_ENVIRONMENT": venv}
            subprocess.run(
                ["uv", "sync", "--frozen", "--no-dev", "--no-install-workspace", "-q"],
                cwd=ROOT,
                env=env,
                check=True,
            )
            scripts = "Scripts" if sys.platform == "win32" else "bin"
            python = str(
                Path(venv) / scripts / ("python.exe" if sys.platform == "win32" else "python")
            )
        out = subprocess.run([python, "-c", METADATA], capture_output=True, text=True, check=True)
    rows: list[dict[str, str]] = json.loads(out.stdout)
    skip = {"pip", "setuptools", "wheel", "uv"}
    packages = []
    for row in rows:
        name = row["name"]
        if name.lower() in skip or name.lower().startswith("forja"):
            continue
        license = KNOWN.get(name.lower()) or row["license"].strip() or "see the project"
        packages.append({**row, "license": license})
    return sorted(packages, key=lambda r: r["name"].lower())


def web_packages() -> list[dict[str, str]]:
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise SystemExit("pnpm is needed for the web dependencies")
    out = subprocess.run(
        [pnpm, "licenses", "list", "--prod", "--json"],
        cwd=ROOT / "apps" / "web",
        capture_output=True,
        check=True,
    )
    data: dict[str, list[dict[str, object]]] = json.loads(out.stdout.decode("utf-8"))
    packages = []
    for license, items in data.items():
        for item in items:
            versions = item.get("versions") or [""]
            name = str(item["name"])
            # Native builds of the listing machine: the image carries its own platform's.
            for prefix in NATIVE_PREFIXES:
                if name.startswith(prefix):
                    name = f"{prefix}<platform>"
            packages.append(
                {
                    "name": name,
                    "version": str(versions[0]),  # type: ignore[index]
                    "license": license,
                    "url": str(item.get("homepage") or ""),
                }
            )
    unique = {(r["name"], r["version"]): r for r in packages}
    return sorted(unique.values(), key=lambda r: r["name"].lower())


def table(rows: list[dict[str, str]]) -> list[str]:
    lines = ["| Package | Version | License |", "|---|---|---|"]
    for row in rows:
        name = f"[{row['name']}]({row['url']})" if row["url"].startswith("http") else row["name"]
        lines.append(f"| {name} | {row['version']} | {row['license']} |")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--python", help="interpreter of the environment to list")
    args = parser.parse_args()
    python = python_packages(args.python)
    web = web_packages()
    noted = [r for r in [*python, *web] if any(k in r["license"] for k in NOTED)]
    lines = [
        "# Third-party licenses",
        "",
        "What the Forja images ship besides Forja itself (Apache-2.0), generated by",
        "`scripts/third_party_licenses.py` (the release workflow regenerates it on Linux and",
        "attaches it to each release). The base images (Debian `python:3.12-slim` and",
        "`node:24-slim`) carry their own packages and notices. See also [NOTICE](NOTICE).",
        "",
        "## Licenses that ask for something",
        "",
        "Weak copyleft (LGPL, MPL, EPL) libraries are shipped unmodified, as separate",
        "files or modules, with their source available upstream; attribution licenses",
        "(CC-BY) are credited here; for dual licenses the permissive option is chosen.",
        "",
        *table(noted),
        "",
        "## Fonts",
        "",
        "| Font | License | File |",
        "|---|---|---|",
        *[f"| {name} | {lic} | [{path}]({path}) |" for name, lic, path in FONTS],
        "",
        f"## Python packages of the API image ({len(python)})",
        "",
        *table(python),
        "",
        f"## JavaScript packages of the web image ({len(web)})",
        "",
        *table(web),
        "",
    ]
    OUTPUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"{OUTPUT.name}: {len(python)} Python and {len(web)} JavaScript packages")


if __name__ == "__main__":
    main()
