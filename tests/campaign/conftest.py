from __future__ import annotations

from collections.abc import Iterator

import pytest

from tests import databases as db


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Every scenario of the campaign carries the marker: `-m campaign` runs them all."""
    for item in items:
        if "campaign" in item.nodeid.split("::")[0].replace("\\", "/").split("/"):
            item.add_marker(pytest.mark.campaign)


@pytest.fixture(scope="session")
def postgres() -> Iterator[db.TestDatabase]:
    """The test PostgreSQL of docker/compose.test-db.yml, seeded, removed afterwards."""
    mode = db.mode()
    if mode == "skip":
        pytest.skip("FORJA_TEST_DATABASES=skip")
    if not db.docker_available():
        if mode == "require":
            pytest.fail("Docker is required for the campaign scenarios")
        pytest.skip("Docker does not answer: campaign scenarios skipped")
    db.start("test-db")
    try:
        db.seed(db.POSTGRES)
        yield db.POSTGRES
    finally:
        db.stop("test-db")
