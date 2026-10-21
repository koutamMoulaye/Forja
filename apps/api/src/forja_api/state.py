"""Application services shared by request handlers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.ingestion import IngestionService
from forja_core.jobs.executor import JobExecutor
from forja_core.jobs.runner import InlineJobRunner, JobRunner, ThreadJobRunner
from forja_core.locks import WarehouseLocks
from forja_core.profiling.profiler import Profiler
from forja_core.silver.build import SilverBuilder
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.dbt.runner import DbtRunner
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace


@dataclass
class AppState:
    settings: Settings
    catalog: Catalog
    workspace: Workspace
    ingestion: IngestionService
    plans: PlanService
    locks: WarehouseLocks
    generator: DbtProjectGenerator
    executor: JobExecutor
    runner: JobRunner

    @classmethod
    def build(cls, settings: Settings) -> AppState:
        catalog = Catalog(settings.catalog_path)
        workspace = Workspace(settings.data_dir)
        profiler = Profiler(settings)
        ingestion = IngestionService(catalog, workspace, settings, profiler)
        plans = PlanService(catalog, settings)
        ingestion.subscribe(plans.on_version_ingested)

        locks = WarehouseLocks()
        generator = DbtProjectGenerator(workspace, threads=settings.dbt_threads)
        builder = SilverBuilder(
            catalog,
            workspace,
            plans,
            generator,
            DbtRunner(settings.dbt_executable, timeout_seconds=settings.dbt_timeout_seconds),
            locks,
        )
        executor = JobExecutor(catalog, workspace, profiler, plans, builder)
        runner: JobRunner = (
            ThreadJobRunner(executor)
            if settings.job_runner == "thread"
            else InlineJobRunner(executor)
        )
        return cls(
            settings=settings,
            catalog=catalog,
            workspace=workspace,
            ingestion=ingestion,
            plans=plans,
            locks=locks,
            generator=generator,
            executor=executor,
            runner=runner,
        )

    def start(self) -> None:
        self.runner.start()

    def close(self) -> None:
        self.runner.stop(timeout=30)
        self.catalog.close()


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.forja
    return state


StateDep = Annotated[AppState, Depends(get_state)]
