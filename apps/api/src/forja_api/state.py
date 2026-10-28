"""Application services shared by request handlers."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from forja_core.agent.service import MartService
from forja_core.auth.service import AuthService
from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.gold.build import GoldBuilder
from forja_core.gold.service import GoldPlanService
from forja_core.ingestion import IngestionService
from forja_core.ingestion.service import IngestedVersion
from forja_core.jobs.executor import JobExecutor
from forja_core.jobs.models import Job, JobType
from forja_core.jobs.runner import InlineJobRunner, JobRunner, ThreadJobRunner
from forja_core.locks import WarehouseLocks
from forja_core.notifications.bus import EventBus
from forja_core.notifications.service import NotificationService
from forja_core.profiling.profiler import Profiler
from forja_core.relations.detector import RelationDetector
from forja_core.relations.service import RelationService
from forja_core.semantic.service import SemanticService
from forja_core.serving import Publisher
from forja_core.silver.build import SilverBuilder
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.dbt.runner import DbtRunner
from forja_core.silver.plan import PlanStatus
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from forja_llm import LLMProvider, LLMSettings, get_provider
from forja_llm.agent import LLMMartInterpreter
from forja_llm.gold import LLMGoldProposer
from forja_llm.store import LLMConfigStore, effective_settings


@dataclass
class AppState:
    settings: Settings
    catalog: Catalog
    workspace: Workspace
    ingestion: IngestionService
    plans: PlanService
    locks: WarehouseLocks
    generator: DbtProjectGenerator
    publisher: Publisher
    relations: RelationService
    executor: JobExecutor
    runner: JobRunner
    llm: LLMProvider | None
    gold: GoldPlanService
    auth: AuthService
    semantic: SemanticService
    marts: MartService
    llm_store: LLMConfigStore
    llm_base: LLMSettings
    llm_settings: LLMSettings
    events: EventBus
    notifications: NotificationService

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
        dbt = DbtRunner(
            settings.dbt_executable,
            timeout_seconds=settings.dbt_timeout_seconds,
            model_delay_seconds=settings.test_model_delay_seconds,
        )
        builder = SilverBuilder(catalog, workspace, plans, generator, dbt, locks)
        publisher = Publisher(catalog, workspace, settings, generator, locks)
        detector = RelationDetector(catalog, settings, generator, locks)
        llm_store = LLMConfigStore(settings.secrets_dir)
        llm_base = LLMSettings()
        llm_settings = effective_settings(llm_base, llm_store.load())
        llm = get_provider(llm_settings, journal=catalog.add_llm_call, cache=catalog)
        gold = GoldPlanService(catalog, LLMGoldProposer(llm, catalog) if llm is not None else None)
        executor = JobExecutor(
            catalog,
            workspace,
            profiler,
            plans,
            builder,
            publisher,
            detector,
            GoldBuilder(catalog, gold, generator, dbt, locks),
        )
        runner: JobRunner = (
            ThreadJobRunner(executor)
            if settings.job_runner == "thread"
            else InlineJobRunner(executor)
        )
        auth = AuthService(catalog, settings)
        semantic = SemanticService(catalog, generator, locks)
        marts = MartService(
            catalog,
            semantic,
            generator,
            dbt,
            locks,
            publisher,
            settings,
            LLMMartInterpreter(llm) if llm is not None else None,
        )
        marts.create_job = lambda project_id, request, by: executor.create(
            project_id, request, created_by=by
        )
        marts.start_job = runner.submit
        marts.audit = auth.audit
        executor.register(JobType.MART_REQUEST, marts.process)
        executor.register(JobType.PUBLISH_MART, marts.publish)

        def refresh_semantic_layer(job: Job, log_line: Callable[[str], None]) -> None:
            # The semantic layer follows the applied Gold model.
            if job.type is JobType.BUILD_GOLD or (
                job.type is JobType.BUILD_ALL and job.metrics is not None and job.metrics.models
            ):
                layer = semantic.regenerate(job.project_id, by=job.created_by)
                log_line(f"semantic layer v{layer.version} ready")

        executor.after_success.append(refresh_semantic_layer)

        events = EventBus()
        notifications = NotificationService(catalog, events)
        executor.on_change.append(notifications.job_changed)
        executor.on_finish.append(notifications.job_finished)
        marts.notifications = notifications

        def plan_to_review(ingested: IngestedVersion) -> None:
            plan = catalog.latest_plan(ingested.source.id)
            if plan is not None and plan.status is PlanStatus.DRAFT:
                notifications.plan_to_review(
                    ingested.source.project_id, ingested.source.id, ingested.source.name
                )

        ingestion.subscribe(plan_to_review)
        return cls(
            settings=settings,
            catalog=catalog,
            workspace=workspace,
            ingestion=ingestion,
            plans=plans,
            locks=locks,
            generator=generator,
            publisher=publisher,
            relations=RelationService(catalog, detector),
            executor=executor,
            runner=runner,
            llm=llm,
            gold=gold,
            auth=auth,
            semantic=semantic,
            marts=marts,
            llm_store=llm_store,
            llm_base=llm_base,
            llm_settings=llm_settings,
            events=events,
            notifications=notifications,
        )

    def configure_llm(self) -> None:
        """Apply the provider saved from the interface to the services that use it."""
        self.llm_settings = effective_settings(self.llm_base, self.llm_store.load())
        self.llm = get_provider(
            self.llm_settings, journal=self.catalog.add_llm_call, cache=self.catalog
        )
        self.gold.proposer = (
            LLMGoldProposer(self.llm, self.catalog) if self.llm is not None else None
        )
        self.marts.interpreter = LLMMartInterpreter(self.llm) if self.llm is not None else None

    def start(self) -> None:
        self.auth.bootstrap()
        self.runner.start()

    def close(self) -> None:
        self.events.close()
        self.runner.stop(timeout=30)
        self.catalog.close()


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.forja
    return state


StateDep = Annotated[AppState, Depends(get_state)]
