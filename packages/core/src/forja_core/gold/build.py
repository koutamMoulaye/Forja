"""Gold build: compile the effective Gold plan, run dbt, register and measure the models."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import duckdb

from forja_core import duck
from forja_core.catalog import Catalog
from forja_core.errors import BuildError
from forja_core.gold.context import GoldContext, build_gold_context
from forja_core.gold.dbt import gold_nodes, snapshot_name
from forja_core.gold.plan import DATE_DIMENSION, UNKNOWN_KEY, GoldPlan, ScdType
from forja_core.gold.service import GoldPlanService
from forja_core.gold.validation import link_relations, validate_model
from forja_core.jobs.errors import RunFailedError
from forja_core.jobs.models import ModelRunMetrics, RunMetrics, UnknownMemberRows
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.models import ColumnSchema
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.dbt.runner import DbtResult, DbtRunner
from forja_core.silver.tables import TableLayer, WarehouseTable
from forja_core.utils import quote_ident, utcnow

log = get_logger(__name__)


def gold_inputs(catalog: Catalog, project_id: str) -> tuple[GoldPlan, GoldContext] | None:
    """The effective Gold plan and its context, when it is valid against the current Silver."""
    plan = catalog.effective_gold_plan(project_id)
    if plan is None:
        return None
    ctx = build_gold_context(catalog, project_id)
    if any(i.severity == "error" for i in validate_model(link_relations(plan.model(), ctx), ctx)):
        log.warning("gold_plan_out_of_date", project_id=project_id, version=plan.version)
        return None
    return plan, ctx


class GoldBuilder:
    def __init__(
        self,
        catalog: Catalog,
        gold: GoldPlanService,
        generator: DbtProjectGenerator,
        dbt: DbtRunner,
        locks: WarehouseLocks,
    ) -> None:
        self.catalog = catalog
        self.gold = gold
        self.generator = generator
        self.dbt = dbt
        self.locks = locks

    def build(self, project_id: str, *, run_id: str, log_line: Callable[[str], None]) -> RunMetrics:
        project = self.catalog.get_project(project_id)
        plan = self.catalog.effective_gold_plan(project_id)
        if plan is None:
            raise BuildError(
                "no approved Gold plan in this project: propose and approve one first",
                details={"project_id": project_id},
            )
        ctx = build_gold_context(self.catalog, project_id)
        errors = [
            i
            for i in validate_model(link_relations(plan.model(), ctx), ctx)
            if i.severity == "error"
        ]
        if errors:
            raise BuildError(
                f"the Gold plan v{plan.version} no longer matches the Silver tables "
                f"({len(errors)} error(s)): propose or edit a new version",
                details={"issues": [i.model_dump() for i in errors]},
            )

        with self.locks.hold(project_id):
            generated = self.generator.generate(
                project, self.catalog.effective_plans(project_id), gold=(plan, ctx)
            )
            log_line(
                f"dbt project {generated.path}: {len(generated.written)} file(s) written, "
                f"{len(generated.removed)} removed, {len(generated.unchanged)} unchanged"
            )
            result = self.dbt.build(
                generated.path,
                select=gold_nodes(plan),
                variables={"forja_run_id": run_id},
                log=log_line,
            )
            metrics = self._measure(plan, result, run_id)

        if not result.succeeded:
            raise RunFailedError(
                f"dbt build failed (exit code {result.returncode}); see the run logs", metrics
            )
        self.gold.mark_applied(plan)
        return metrics

    def _measure(self, plan: GoldPlan, result: DbtResult, run_id: str) -> RunMetrics:
        metrics = RunMetrics(dbt_tests=result.tests)
        warehouse = self.generator.warehouse_path(plan.project_id)
        snapshots = [snapshot_name(d) for d in plan.dimensions if d.scd is ScdType.SCD2]
        models = [d.name for d in plan.dimensions] + [f.name for f in plan.facts]
        if plan.date_dimension.enabled and any(f.date_keys for f in plan.facts):
            models.append(DATE_DIMENSION)
        with duck.connect(str(warehouse), read_only=True) as con:
            existing = {
                str(r[0])
                for r in con.execute("SELECT table_name FROM information_schema.tables").fetchall()
            }
            for name in [*snapshots, *models]:
                status = result.model_statuses.get(name) or result.snapshot_statuses.get(name)
                rows = self._count(con, name) if name in existing else 0
                metrics.models.append(ModelRunMetrics(name=name, rows=rows, status=status))
            for fact in plan.facts:
                if fact.name not in existing:
                    continue
                # Surrogate keys are text, date keys are integers (YYYYMMDD).
                keys = [(fk.name, fk.dimension, f"'{UNKNOWN_KEY}'") for fk in fact.foreign_keys]
                keys += [(k.name, DATE_DIMENSION, UNKNOWN_KEY) for k in fact.date_keys]
                for key, dimension, unknown in keys:
                    [(count,)] = con.execute(
                        f"SELECT count(*) FROM {quote_ident(fact.name)} "
                        f"WHERE {quote_ident(key)} = {unknown}"
                    ).fetchall()
                    metrics.unknown_member_rows.append(
                        UnknownMemberRows(
                            fact=fact.name, key=key, dimension=dimension, rows=int(count)
                        )
                    )
            for name in models:
                if result.model_statuses.get(name) == "success":
                    self._register(con, plan, name, run_id)
        return metrics

    @staticmethod
    def _count(con: duckdb.DuckDBPyConnection, name: str) -> int:
        [(count,)] = con.execute(f"SELECT count(*) FROM {quote_ident(name)}").fetchall()
        return int(count)

    def _register(
        self, con: duckdb.DuckDBPyConnection, plan: GoldPlan, name: str, run_id: str
    ) -> None:
        columns = [
            ColumnSchema(name=str(r[0]), type=str(r[1]))
            for r in con.execute(f"DESCRIBE {quote_ident(name)}").fetchall()
        ]
        existing = self.catalog.find_table(plan.project_id, name)
        self.catalog.save_table(
            WarehouseTable(
                id=existing.id if existing else uuid.uuid4().hex,
                project_id=plan.project_id,
                layer=TableLayer.GOLD,
                name=name,
                plan_version=plan.version,
                row_count=self._count(con, name),
                columns=columns,
                built_at=utcnow(),
                last_run_id=run_id,
                publish=True,
            )
        )
