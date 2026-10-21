"""Execution of dbt in a subprocess, isolated from the API process."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from forja_core.errors import BuildError
from forja_core.jobs.models import DbtTestResult, DbtTestSummary

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_TEST_STATUSES = {"pass", "fail", "warn", "error", "skipped"}


@dataclass
class DbtResult:
    returncode: int
    tests: DbtTestSummary
    model_statuses: dict[str, str] = field(default_factory=dict)

    @property
    def succeeded(self) -> bool:
        return self.returncode == 0


def find_dbt_executable(configured: str | None = None) -> str:
    if configured:
        return configured
    scripts = Path(sys.executable).parent
    for name in ("dbt.exe", "dbt"):
        candidate = scripts / name
        if candidate.exists():
            return str(candidate)
    found = shutil.which("dbt")
    if found is None:
        raise BuildError("dbt executable not found; install dbt-duckdb or set FORJA_DBT_EXECUTABLE")
    return found


def parse_run_results(path: Path) -> tuple[DbtTestSummary, dict[str, str]]:
    """Test results and model statuses (by model name) of the last dbt invocation."""
    summary = DbtTestSummary()
    models: dict[str, str] = {}
    if not path.exists():
        return summary, models
    document: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    for result in document.get("results", []):
        unique_id = str(result.get("unique_id", ""))
        status = str(result.get("status", ""))
        parts = unique_id.split(".")
        if parts[0] == "model":
            models[parts[-1]] = status
            continue
        if parts[0] != "test" or status not in _TEST_STATUSES:
            continue
        summary.results.append(
            DbtTestResult(
                unique_id=unique_id,
                name=parts[2] if len(parts) > 2 else unique_id,
                status=status,
                failures=int(result.get("failures") or 0),
                message=result.get("message"),
            )
        )
        match status:
            case "pass":
                summary.passed += 1
            case "fail":
                summary.failed += 1
            case "warn":
                summary.warned += 1
            case "error":
                summary.errored += 1
            case _:
                summary.skipped += 1
    summary.results.sort(key=lambda r: r.name)
    return summary, models


def attach_tested_models(summary: DbtTestSummary, manifest_path: Path) -> None:
    """run_results.json does not name the tested model: resolve it from the manifest."""
    if not manifest_path.exists():
        return
    manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    nodes: dict[str, Any] = manifest.get("nodes", {})
    for result in summary.results:
        node = nodes.get(result.unique_id, {})
        depends = [d for d in node.get("depends_on", {}).get("nodes", []) if d.startswith("model.")]
        if depends:
            result.model = depends[0].split(".")[-1]
        result.name = str(node.get("name", result.name))


class DbtRunner:
    def __init__(self, executable: str | None = None, *, timeout_seconds: float = 1800) -> None:
        self.executable = executable
        self.timeout_seconds = timeout_seconds

    def build(
        self,
        project_dir: Path,
        *,
        select: Sequence[str],
        variables: dict[str, str],
        log: Callable[[str], None],
    ) -> DbtResult:
        command = [
            find_dbt_executable(self.executable),
            "build",
            "--project-dir",
            ".",
            "--profiles-dir",
            ".",
            "--select",
            *select,
            "--vars",
            json.dumps(variables),
            "--no-use-colors",
            "--no-version-check",
        ]
        env = {
            **os.environ,
            "DBT_SEND_ANONYMOUS_USAGE_STATS": "False",
            "DBT_PARTIAL_PARSE": "False",
            "PYTHONIOENCODING": "utf-8",
        }
        log(f"$ dbt build --select {' '.join(select)}")
        process = subprocess.Popen(
            command,
            cwd=project_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            log(_ANSI_RE.sub("", line.rstrip()))
        try:
            returncode = process.wait(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            process.kill()
            raise BuildError(f"dbt build exceeded {self.timeout_seconds:.0f} s") from exc

        tests, models = parse_run_results(project_dir / "target" / "run_results.json")
        attach_tested_models(tests, project_dir / "target" / "manifest.json")
        return DbtResult(returncode=returncode, tests=tests, model_statuses=models)
