from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.ingestion import IngestionService
from forja_core.models import Project, ProjectCreate
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from forja_llm import LLMSettings
from tests.auth import api_client
from tests.fixtures import ecommerce
from tests.fixtures.generate import ALL_FILES, FIXTURES_DIR, generate_all

# Tests never read the developer's .env: a configured LLM provider would otherwise
# replace the heuristics in every API test.
Settings.model_config["env_file"] = None
LLMSettings.model_config["env_file"] = None


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    if not all((FIXTURES_DIR / name).exists() for name in ALL_FILES):
        generate_all(FIXTURES_DIR)
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def ecommerce_dir() -> Path:
    if not all((ecommerce.DIRECTORY / name).exists() for name in ecommerce.FILES):
        ecommerce.generate()
    return ecommerce.DIRECTORY


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        secrets_dir=tmp_path / "secrets",
        log_format="console",
        log_level="WARNING",
        # Scheduled loads are tested with a simulated clock (test_scheduling.py).
        scheduler_enabled=False,
    )


@pytest.fixture
def catalog(settings: Settings) -> Iterator[Catalog]:
    with Catalog(settings.catalog_path) as cat:
        yield cat


@pytest.fixture
def workspace(settings: Settings) -> Workspace:
    return Workspace(settings.data_dir)


@pytest.fixture
def plan_service(catalog: Catalog, settings: Settings) -> PlanService:
    return PlanService(catalog, settings)


@pytest.fixture
def ingestion(
    catalog: Catalog, workspace: Workspace, settings: Settings, plan_service: PlanService
) -> IngestionService:
    service = IngestionService(catalog, workspace, settings)
    service.subscribe(plan_service.on_version_ingested)
    return service


@pytest.fixture
def project(catalog: Catalog) -> Project:
    return catalog.create_project(ProjectCreate(name="Démo"))


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """The API, logged in as the instance administrator."""
    with api_client(settings) as test_client:
        yield test_client
