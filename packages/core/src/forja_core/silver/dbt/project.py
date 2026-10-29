"""Generation of the dbt project of a Forja project, in ``data/<project>/dbt/``.

The project is fully derived from the effective (approved or applied) plans and
regenerated idempotently: identical plans produce byte-identical files, unchanged
files are not rewritten, and files no longer produced are removed.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from forja_core.gold.context import GoldContext
from forja_core.gold.dbt import render_gold
from forja_core.gold.plan import GoldPlan
from forja_core.models import Project
from forja_core.silver.dbt.sql import (
    TECHNICAL_TYPES,
    UNIQUE_COMBINATION_TEST,
    UNPROCESSED_ROWS_MACRO,
    checked_model,
    rejects_model,
    render_checked,
    render_rejects,
    render_silver,
)
from forja_core.silver.plan import TransformationPlan
from forja_core.storage import Workspace
from forja_core.utils import slugify

PROFILE_NAME = "forja"
MANAGED_DIRS = ("models", "macros", "snapshots")
WAREHOUSE_FILE = "warehouse.duckdb"

_TECHNICAL_DESCRIPTIONS = {
    "_batch_id": "Version de la source (lot Bronze) dont provient la ligne.",
    "_ingested_at": "Horodatage UTC de l'ingestion du lot.",
    "_source_file": "Fichier d'origine de la ligne.",
    "_row_hash": "Empreinte SHA-256 des valeurs brutes de la ligne.",
    "_run_id": "Exécution Forja ayant traité la ligne.",
}


@dataclass(frozen=True)
class MartModel:
    """A published data mart: a dbt model compiled by the agent from a validated spec."""

    name: str
    sql: str
    description: str
    columns: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class GenerationResult:
    path: Path
    written: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.written or self.removed)


class _IndentedDumper(yaml.SafeDumper):
    """Indents list items under their key, as in hand-written dbt YAML files."""

    def increase_indent(self, flow: bool = False, indentless: bool = False) -> None:
        super().increase_indent(flow, False)


def _yaml(document: dict[str, Any]) -> str:
    return yaml.dump(
        document,
        Dumper=_IndentedDumper,
        sort_keys=False,
        allow_unicode=True,
        width=88,
        default_flow_style=False,
    )


def dbt_project_name(project: Project) -> str:
    return f"forja_{slugify(project.name, default='project')}"


def _dbt_project_yml(project: Project) -> str:
    name = dbt_project_name(project)
    return _yaml(
        {
            "name": name,
            "version": "1.0.0",
            "config-version": 2,
            "profile": PROFILE_NAME,
            "model-paths": ["models"],
            "macro-paths": ["macros"],
            "snapshot-paths": ["snapshots"],
            "target-path": "target",
            "clean-targets": ["target"],
        }
    )


def _profiles_yml(threads: int, duckdb_settings: Mapping[str, str] | None = None) -> str:
    output: dict[str, object] = {
        "type": "duckdb",
        "path": f"../{WAREHOUSE_FILE}",
        "threads": threads,
    }
    if duckdb_settings:
        output["settings"] = dict(duckdb_settings)
    return _yaml({PROFILE_NAME: {"target": "local", "outputs": {"local": output}}})


def _sources_yml(plans: Sequence[TransformationPlan]) -> str:
    tables = [
        {
            "name": plan.source_name,
            "description": (
                f"Lots Bronze de la source « {plan.source_name} », un fichier Parquet par version."
            ),
            "meta": {
                "external_location": (
                    f"read_parquet('../bronze/{plan.source_name}/*.parquet', union_by_name = true)"
                )
            },
        }
        for plan in plans
    ]
    return _yaml(
        {
            "version": 2,
            "sources": [
                {
                    "name": "bronze",
                    "description": "Données brutes chargées par Forja, sans transformation.",
                    "tables": tables,
                }
            ],
        }
    )


def _technical_columns(names: Sequence[str]) -> list[dict[str, Any]]:
    return [
        {"name": n, "description": _TECHNICAL_DESCRIPTIONS[n], "data_type": TECHNICAL_TYPES[n]}
        for n in names
    ]


def _silver_model(plan: TransformationPlan) -> dict[str, Any]:
    keys = plan.key_columns()
    columns: list[dict[str, Any]] = []
    for column in plan.included_columns():
        entry: dict[str, Any] = {
            "name": column.target_column,
            "description": column.description,
            "data_type": column.target_type.value,
        }
        tests: list[Any] = []
        if len(keys) == 1 and column is keys[0]:
            tests = ["unique", "not_null"]
        elif len(keys) > 1 and column in keys:
            tests = ["not_null"]
        if column.accepted_values:
            tests.append(
                {
                    "accepted_values": {
                        "arguments": {"values": column.accepted_values},
                        "config": {"severity": "warn"},
                    }
                }
            )
        if tests:
            entry["data_tests"] = tests
        columns.append(entry)

    model: dict[str, Any] = {
        "name": plan.model_name,
        "description": f"Table Silver de la source « {plan.source_name} ». {plan.summary}",
        "config": {"contract": {"enforced": True}},
    }
    if len(keys) > 1:
        model["data_tests"] = [
            {
                "forja_unique_combination": {
                    "arguments": {"columns": [c.target_column for c in keys]}
                }
            }
        ]
    model["columns"] = columns + _technical_columns(
        ["_batch_id", "_ingested_at", "_source_file", "_row_hash", "_run_id"]
    )
    return model


def _rejects_model(plan: TransformationPlan) -> dict[str, Any]:
    columns: list[dict[str, Any]] = [
        {
            "name": c.target_column,
            "description": f"Valeur brute de « {c.source_column} ».",
        }
        for c in plan.included_columns()
    ]
    columns.append(
        {
            "name": "_reject_reason",
            "description": "Règles de validité non respectées, séparées par « ; ».",
            "data_tests": ["not_null"],
        }
    )
    for name in ("_batch_id", "_ingested_at", "_source_file", "_row_hash", "_run_id"):
        technical: dict[str, Any] = {"name": name, "description": _TECHNICAL_DESCRIPTIONS[name]}
        if name == "_batch_id":
            technical["data_tests"] = ["not_null"]
        columns.append(technical)
    return {
        "name": rejects_model(plan),
        "description": (
            f"Quarantaine de la source « {plan.source_name} » : lignes rejetées par une "
            "règle de validité, conservées avec leurs valeurs brutes. Rien n'est supprimé "
            "silencieusement."
        ),
        "columns": columns,
    }


def _schema_yml(plans: Sequence[TransformationPlan]) -> str:
    models: list[dict[str, Any]] = []
    for plan in plans:
        models.append(
            {
                "name": checked_model(plan),
                "description": (
                    f"Lignes Bronze non encore traitées de « {plan.source_name} », "
                    "nettoyées, typées et contrôlées."
                ),
            }
        )
        models.append(_silver_model(plan))
        models.append(_rejects_model(plan))
    return _yaml({"version": 2, "models": models})


def render_project(
    project: Project,
    plans: Sequence[TransformationPlan],
    *,
    threads: int = 1,
    gold: tuple[GoldPlan, GoldContext] | None = None,
    marts: Sequence[MartModel] = (),
    duckdb_settings: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """All files of the dbt project, keyed by path relative to the project root.

    Silver models come from the effective transformation plans; Gold models and
    snapshots from the effective Gold plan, when there is one; data marts from the
    mart requests being or already published.
    """
    ordered = sorted(plans, key=lambda p: p.source_name)
    files = {
        "dbt_project.yml": _dbt_project_yml(project),
        "profiles.yml": _profiles_yml(threads, duckdb_settings),
        "macros/forja_unprocessed_rows.sql": UNPROCESSED_ROWS_MACRO,
        "macros/forja_unique_combination.sql": UNIQUE_COMBINATION_TEST,
    }
    if ordered:
        files["models/staging/_bronze__sources.yml"] = _sources_yml(ordered)
        files["models/staging/schema.yml"] = _schema_yml(ordered)
    for plan in ordered:
        folder = f"models/staging/{plan.source_name}"
        files[f"{folder}/{checked_model(plan)}.sql"] = render_checked(plan)
        files[f"{folder}/{plan.model_name}.sql"] = render_silver(plan)
        files[f"{folder}/{rejects_model(plan)}.sql"] = render_rejects(plan)
    if gold is not None:
        gold_files, gold_yaml = render_gold(*gold)
        files.update(gold_files)
        files["models/gold/schema.yml"] = _yaml({"version": 2, "models": gold_yaml["models"]})
        if gold_yaml["snapshots"]:
            files["snapshots/snapshots.yml"] = _yaml({"snapshots": gold_yaml["snapshots"]})
    if gold is not None and marts:
        models = []
        for mart in sorted(marts, key=lambda m: m.name):
            files[f"models/marts/{mart.name}.sql"] = mart.sql
            models.append(
                {
                    "name": mart.name,
                    "description": mart.description,
                    "config": {"materialized": "table"},
                    "columns": mart.columns,
                }
            )
        files["models/marts/schema.yml"] = _yaml({"version": 2, "models": models})
    return files


class DbtProjectGenerator:
    def __init__(
        self,
        workspace: Workspace,
        *,
        threads: int = 1,
        duckdb_settings: Mapping[str, str] | None = None,
    ) -> None:
        self.workspace = workspace
        self.threads = threads
        # memory_limit, threads and temp_directory of the dbt subprocess (see forja_core.duck).
        self.duckdb_settings = dict(duckdb_settings or {})
        # Data marts of a project (set by the mart service), kept on every regeneration.
        self.marts: Callable[[str], list[MartModel]] | None = None

    def project_dir(self, project_id: str) -> Path:
        return self.workspace.project_dir(project_id) / "dbt"

    def warehouse_path(self, project_id: str) -> Path:
        return self.workspace.project_dir(project_id) / WAREHOUSE_FILE

    def generate(
        self,
        project: Project,
        plans: Sequence[TransformationPlan],
        gold: tuple[GoldPlan, GoldContext] | None = None,
        *,
        extra_marts: Sequence[MartModel] = (),
    ) -> GenerationResult:
        root = self.project_dir(project.id)
        result = GenerationResult(path=root)
        marts = {m.name: m for m in (self.marts(project.id) if self.marts else [])}
        marts.update({m.name: m for m in extra_marts})
        files = render_project(
            project,
            plans,
            threads=self.threads,
            gold=gold,
            marts=list(marts.values()),
            duckdb_settings=self.duckdb_settings,
        )

        for relative, content in files.items():
            path = root / relative
            data = content.encode("utf-8")
            if path.exists() and path.read_bytes() == data:
                result.unchanged.append(relative)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            result.written.append(relative)

        for managed in MANAGED_DIRS:
            for path in sorted((root / managed).rglob("*")):
                relative = path.relative_to(root).as_posix()
                if path.is_file() and relative not in files:
                    path.unlink()
                    result.removed.append(relative)
            for directory in sorted((root / managed).rglob("*"), reverse=True):
                if directory.is_dir() and not any(directory.iterdir()):
                    directory.rmdir()
        return result
