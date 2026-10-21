"""Silver build: regenerate the dbt project, run ``dbt build`` and measure the run."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import duckdb

from forja_core.catalog import Catalog
from forja_core.errors import BuildError, ForjaError
from forja_core.jobs.models import RunMetrics, SourceRunMetrics
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.models import ColumnSchema
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.dbt.runner import DbtResult, DbtRunner
from forja_core.silver.dbt.sql import rejects_model
from forja_core.silver.plan import TransformationPlan
from forja_core.silver.planner import column_signature
from forja_core.silver.service import PlanService
from forja_core.silver.tables import SilverTable
from forja_core.storage import Workspace
from forja_core.utils import quote_ident, sql_literal, utcnow

log = get_logger(__name__)

Logger = Callable[[str], None]


class SilverBuildError(BuildError):
    """dbt failed; the metrics of what could be measured are attached."""

    def __init__(self, message: str, metrics: RunMetrics) -> None:
        super().__init__(message)
        self.metrics = metrics


@dataclass
class _Pending:
    plan: TransformationPlan
    full_refresh: bool
    bronze_rows: int
    rows_read: int
    distinct_rows: int


def requires_full_refresh(applied: TransformationPlan, current: TransformationPlan) -> bool:
    """Whether rows already in Silver would be computed differently by ``current``.

    Columns appended by a new source version do not: incremental models add them
    (``on_schema_change='append_new_columns'``) and earlier rows keep NULL.
    """
    if applied.deduplication.enabled != current.deduplication.enabled:
        return True
    old_key = applied.primary_key.columns if applied.primary_key else None
    new_key = current.primary_key.columns if current.primary_key else None
    if old_key != new_key:
        return True
    after = {c.source_column: c for c in current.columns}
    for column in applied.columns:
        new = after.get(column.source_column)
        if new is None or column_signature(new, silver_only=True) != column_signature(
            column, silver_only=True
        ):
            return True
    return False


def _relation_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    [(count,)] = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]
    ).fetchall()
    return int(count) > 0


class SilverBuilder:
    def __init__(
        self,
        catalog: Catalog,
        workspace: Workspace,
        plans: PlanService,
        generator: DbtProjectGenerator,
        dbt: DbtRunner,
        locks: WarehouseLocks,
    ) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.plans = plans
        self.generator = generator
        self.dbt = dbt
        self.locks = locks

    def build(
        self,
        project_id: str,
        *,
        run_id: str,
        source_ids: Sequence[str] | None,
        full_refresh: bool,
        log_line: Logger,
    ) -> RunMetrics:
        project = self.catalog.get_project(project_id)
        all_plans = self.catalog.effective_plans(project_id)
        selected = self._select(project_id, all_plans, source_ids)

        with self.locks.hold(project_id):
            generated = self.generator.generate(project, all_plans)
            log_line(
                f"dbt project {generated.path}: {len(generated.written)} file(s) written, "
                f"{len(generated.removed)} removed, {len(generated.unchanged)} unchanged"
            )
            pending = self._prepare(project_id, selected, full_refresh, log_line)
            models = [name for p in selected for name in (p.model_name, rejects_model(p))]
            result = self.dbt.build(
                generated.path,
                select=models,
                variables={"forja_run_id": run_id},
                log=log_line,
            )
            metrics = self._measure(project_id, pending, run_id, result)

        if not result.succeeded:
            raise SilverBuildError(
                f"dbt build failed (exit code {result.returncode}); see the run logs", metrics
            )
        return metrics

    def _select(
        self,
        project_id: str,
        plans: list[TransformationPlan],
        source_ids: Sequence[str] | None,
    ) -> list[TransformationPlan]:
        if source_ids is None:
            selected = plans
        else:
            by_source = {p.source_id: p for p in plans}
            missing = [s for s in source_ids if s not in by_source]
            if missing:
                raise BuildError(
                    "no approved transformation plan for some sources",
                    details={"source_ids": missing},
                )
            selected = [by_source[s] for s in source_ids]
        if not selected:
            raise BuildError(
                "no approved transformation plan in this project: approve a plan first",
                details={"project_id": project_id},
            )
        return selected

    def _needs_full_refresh(self, plan: TransformationPlan) -> bool:
        table = self.catalog.find_table(plan.project_id, plan.model_name)
        if table is None:
            return False
        if table.plan_version == plan.version:
            return False
        try:
            applied = self.catalog.get_plan(plan.source_id, version=table.plan_version)
        except ForjaError:
            return True
        return requires_full_refresh(applied, plan)

    def _bronze_glob(self, project_id: str, plan: TransformationPlan) -> str:
        directory = self.workspace.bronze_source_dir(project_id, plan.source_name)
        return (directory / "*.parquet").as_posix()

    def _prepare(
        self,
        project_id: str,
        plans: Sequence[TransformationPlan],
        full_refresh: bool,
        log_line: Logger,
    ) -> list[_Pending]:
        """Drop tables to rebuild, then count what the incremental run will read."""
        pending: list[_Pending] = []
        warehouse = self.generator.warehouse_path(project_id)
        with duckdb.connect(str(warehouse)) as con:
            for plan in plans:
                refresh = full_refresh or self._needs_full_refresh(plan)
                silver, rejects = plan.model_name, rejects_model(plan)
                if refresh:
                    log_line(f"{silver}: full refresh (plan v{plan.version})")
                    for name in (silver, rejects):
                        con.execute(f"DROP TABLE IF EXISTS {quote_ident(name)}")
                bronze = (
                    f"read_parquet({sql_literal(self._bronze_glob(project_id, plan))}, "
                    "union_by_name = true)"
                )
                processed = [
                    f"SELECT _row_hash FROM {quote_ident(name)}"
                    for name in (silver, rejects)
                    if _relation_exists(con, name)
                ]
                where = (
                    f"WHERE _row_hash NOT IN ({' UNION ALL '.join(processed)})" if processed else ""
                )
                [(total,)] = con.execute(f"SELECT count(*) FROM {bronze}").fetchall()
                [(read, distinct)] = con.execute(
                    f"SELECT count(*), count(DISTINCT _row_hash) FROM {bronze} {where}"
                ).fetchall()
                pending.append(
                    _Pending(
                        plan=plan,
                        full_refresh=refresh,
                        bronze_rows=int(total),
                        rows_read=int(read),
                        distinct_rows=int(distinct),
                    )
                )
                log_line(f"{silver}: {read} new Bronze row(s) out of {total}")
        return pending

    def _measure(
        self,
        project_id: str,
        pending: Sequence[_Pending],
        run_id: str,
        result: DbtResult,
    ) -> RunMetrics:
        metrics = RunMetrics(dbt_tests=result.tests)
        warehouse = self.generator.warehouse_path(project_id)
        with duckdb.connect(str(warehouse), read_only=True) as con:
            for item in pending:
                plan = item.plan
                silver, rejects = plan.model_name, rejects_model(plan)
                valid = self._count(con, silver, run_id)
                rejected = self._count(con, rejects, run_id)
                metrics.add_source(
                    SourceRunMetrics(
                        source_id=plan.source_id,
                        source_name=plan.source_name,
                        model=silver,
                        plan_version=plan.version,
                        full_refresh=item.full_refresh,
                        rows_read=item.rows_read,
                        rows_already_processed=item.bronze_rows - item.rows_read,
                        duplicates_removed=(
                            item.rows_read - item.distinct_rows if plan.deduplication.enabled else 0
                        ),
                        rows_valid=valid,
                        rows_rejected=rejected,
                        rows_superseded=max(0, item.distinct_rows - valid - rejected),
                        model_status=result.model_statuses.get(silver),
                    )
                )
                if result.model_statuses.get(silver) == "success":
                    self._register(con, plan, run_id)
        return metrics

    @staticmethod
    def _count(con: duckdb.DuckDBPyConnection, table: str, run_id: str) -> int:
        if not _relation_exists(con, table):
            return 0
        [(count,)] = con.execute(
            f"SELECT count(*) FROM {quote_ident(table)} WHERE _run_id = ?", [run_id]
        ).fetchall()
        return int(count)

    def _register(
        self, con: duckdb.DuckDBPyConnection, plan: TransformationPlan, run_id: str
    ) -> None:
        silver, rejects = plan.model_name, rejects_model(plan)
        [(rows,)] = con.execute(f"SELECT count(*) FROM {quote_ident(silver)}").fetchall()
        rejected = 0
        if _relation_exists(con, rejects):
            [(rejected,)] = con.execute(f"SELECT count(*) FROM {quote_ident(rejects)}").fetchall()
        columns = [
            ColumnSchema(name=str(r[0]), type=str(r[1]), technical=str(r[0]).startswith("_"))
            for r in con.execute(f"DESCRIBE {quote_ident(silver)}").fetchall()
        ]
        existing = self.catalog.find_table(plan.project_id, silver)
        self.catalog.save_table(
            SilverTable(
                id=existing.id if existing else uuid.uuid4().hex,
                project_id=plan.project_id,
                source_id=plan.source_id,
                name=silver,
                plan_version=plan.version,
                row_count=int(rows),
                rejected_count=int(rejected),
                columns=columns,
                built_at=utcnow(),
                last_run_id=run_id,
            )
        )
        self.plans.mark_applied(plan)
