"""Application services shared by request handlers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.ingestion import IngestionService
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace


@dataclass
class AppState:
    settings: Settings
    catalog: Catalog
    workspace: Workspace
    ingestion: IngestionService
    plans: PlanService

    @classmethod
    def build(cls, settings: Settings) -> AppState:
        catalog = Catalog(settings.catalog_path)
        workspace = Workspace(settings.data_dir)
        ingestion = IngestionService(catalog, workspace, settings)
        plans = PlanService(catalog, settings)
        ingestion.subscribe(plans.on_version_ingested)
        return cls(
            settings=settings,
            catalog=catalog,
            workspace=workspace,
            ingestion=ingestion,
            plans=plans,
        )

    def close(self) -> None:
        self.catalog.close()


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.forja
    return state


StateDep = Annotated[AppState, Depends(get_state)]
