"""Rule-by-rule review of Silver plans, before/after samples and quarantine."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from forja_api.state import AppState
from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import PlanStateError, PlanValidationError
from forja_core.ingestion import IngestionService
from forja_core.jobs.models import JobStatus, JobType, RunRequest
from forja_core.models import Project, ProjectCreate, Source
from forja_core.privacy import ProjectSecrets
from forja_core.silver.plan import ColumnPatch, PlanPatch, PlanStatus, SilverType
from forja_core.silver.review import ReviewRuleKind, plan_review, review_rules
from forja_core.silver.samples import plan_samples
from forja_core.silver.service import PlanService
from forja_core.storage import Workspace
from tests.auth import api_client
from tests.fixtures import generate as fx


@pytest.fixture
def clients(ingestion: IngestionService, project: Project, fixtures_dir: Path) -> Source:
    [source] = ingestion.ingest_file(project.id, fixtures_dir / fx.CLIENTS_V1, "clients.csv")
    return source


def test_rules_of_a_plan(catalog: Catalog, clients: Source) -> None:
    plan = catalog.get_plan(clients.id)
    rules = {rule.id: rule for rule in review_rules(plan)}
    cast = rules["cast:date_inscription"]
    assert cast.kind is ReviewRuleKind.CAST
    assert cast.title == "Convertir en date (JJ/MM/AAAA)"
    assert cast.affected == 1
    assert "quarantaine" in cast.explanation
    assert rules["cast:montant_total"].title == "Convertir en montant décimal"

    collapse = rules["normalize:collapse_whitespace"]
    assert {"nom", "prénom"} <= set(collapse.columns)
    email = rules["pii:email"]
    assert email.title == "Pseudonymiser l'email" and not email.rejectable
    assert rules["format:email:email_format"].kind is ReviewRuleKind.FORMAT
    assert rules["primary_key"].columns == ["id"]
    assert rules["deduplicate"].affected == len(fx.FR_DUPLICATED_INDEXES)
    assert all(rule.decision is None for rule in rules.values())


def test_decisions_and_approval(
    plan_service: PlanService, catalog: Catalog, clients: Source
) -> None:
    plan_service.review(
        clients.id, {"cast:date_inscription": "rejected", "deduplicate": "validated"}
    )
    plan = catalog.get_plan(clients.id)
    assert plan.version == 1  # decisions do not create versions
    review = plan_review(plan)
    assert review.rejected == 1 and review.validated == 1
    assert review.pending == len(review.rules) - 2

    plan_service.review(clients.id, {"deduplicate": None})
    assert "deduplicate" not in catalog.get_plan(clients.id).reviews
    with pytest.raises(PlanValidationError):
        plan_service.review(clients.id, {"pii:email": "rejected"})
    with pytest.raises(PlanValidationError):
        plan_service.review(clients.id, {"cast:inconnue": "validated"})

    plan_service.review(clients.id, {"primary_key": "validated"})
    approved = plan_service.approve(clients.id)
    # The rejected conversion is undone in a new version, which is the one approved.
    assert approved.version == 2 and approved.status is PlanStatus.APPROVED
    column = approved.column("date_inscription")
    assert column is not None and column.target_type is SilverType.VARCHAR
    assert approved.reviews == {"primary_key": "validated"}
    assert catalog.get_plan(clients.id, version=1).status is PlanStatus.DRAFT
    with pytest.raises(PlanStateError):
        plan_service.review(clients.id, {"primary_key": None})


def test_an_edited_rule_goes_back_to_review(
    plan_service: PlanService, catalog: Catalog, clients: Source
) -> None:
    plan_service.review(
        clients.id, {"cast:date_inscription": "validated", "primary_key": "validated"}
    )
    edited = plan_service.patch(
        clients.id, PlanPatch(columns={"date_inscription": ColumnPatch(date_format="%d-%m-%Y")})
    )
    assert edited.version == 2
    assert edited.reviews == {"primary_key": "validated"}


def test_samples_apply_the_plan(
    catalog: Catalog, workspace: Workspace, settings: Settings, clients: Source
) -> None:
    plan = catalog.get_plan(clients.id)
    salt = ProjectSecrets(settings.secrets_dir).salt(clients.project_id)
    bronze = workspace.resolve(clients.bronze_path)
    samples = {c.column: c for c in plan_samples(plan, bronze, salt, unmasked=True).columns}

    dates = samples["date_inscription"]
    assert dates.values[0].invalid  # a date that does not exist is shown first
    assert dates.values[0].before == "31/02/2023" and dates.values[0].after is None
    assert all(v.after and len(v.after) == 10 for v in dates.values[1:])
    amounts = samples["montant_total"].values
    assert any(v.before and "," in v.before and v.after and "." in v.after for v in amounts)

    email = samples["email"]
    assert email.personal and email.treatment.value == "hash"
    raw = {v.before for v in email.values}
    assert not any(value and "@example.fr" in value and "***" not in value for value in raw)
    assert all(v.after is None or len(v.after) == 64 for v in email.values)

    strict = {c.column: c for c in plan_samples(plan, bronze, salt, unmasked=False).columns}
    assert all(v.before is None or len(v.before) == 64 for v in strict["email"].values)


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[AppState, Source]]:
    root = tmp_path_factory.mktemp("quarantine")
    settings = Settings(
        data_dir=root / "data",
        secrets_dir=root / "secrets",
        log_format="console",
        log_level="WARNING",
        job_runner="inline",
    )
    state = AppState.build(settings)
    project = state.catalog.create_project(ProjectCreate(name="Quarantaine"))
    fixtures = Path(fx.FIXTURES_DIR)
    [source] = state.ingestion.ingest_file(project.id, fixtures / fx.CLIENTS_V1, "clients.csv")
    state.plans.approve(source.id)
    job = state.executor.create(project.id, RunRequest(type=JobType.BUILD_SILVER))
    state.runner.submit(job.id)
    assert state.catalog.get_job(job.id).status is JobStatus.SUCCEEDED
    yield state, source
    state.close()


def test_quarantine_by_reason(built: tuple[AppState, Source]) -> None:
    state, source = built
    plan = state.catalog.get_plan(source.id)
    quarantine = state.publisher.quarantine(plan, 50)
    assert quarantine.total_rows == fx.CLIENTS_V1_REJECTED
    reasons = {r.reason: r.rows for r in quarantine.reasons}
    assert reasons["email : format d'email invalide"] == 1
    assert reasons["clé primaire en double dans le lot"] == 2
    assert len(quarantine.runs) == 1 and quarantine.runs[0].rows == fx.CLIENTS_V1_REJECTED
    assert "_reject_reason" in quarantine.columns
    assert "jean.dupont@example.fr" not in str(quarantine.rows)
    run_id = quarantine.runs[0].run_id
    assert state.publisher.quarantine(plan, 2, run_id=run_id).total_rows == 5
    assert len(state.publisher.quarantine(plan, 2).rows) == 2
    assert state.publisher.quarantine(plan, 5, run_id="autre").total_rows == 0


def test_review_api(built: tuple[AppState, Source]) -> None:
    state, source = built
    state.close()
    try:
        with api_client(state.settings) as client:
            review = client.get(f"/sources/{source.id}/plan/review").json()
            assert review["status"] == "applied" and review["pending"] == len(review["rules"])
            decisions = {"decisions": {"deduplicate": "validated"}}
            refused = client.post(f"/sources/{source.id}/plan/review", json=decisions)
            assert refused.status_code == 409  # the plan is applied: edit it first

            draft = client.patch(
                f"/sources/{source.id}/plan",
                json={"columns": {"commentaire": {"included": False}}},
            ).json()
            decided = client.post(
                f"/sources/{source.id}/plan/review",
                json={"decisions": {"exclude:commentaire": "rejected", "deduplicate": "validated"}},
            )
            assert decided.status_code == 200, decided.text
            assert decided.json()["plan_version"] == draft["version"]
            assert decided.json()["rejected"] == 1

            samples = client.get(f"/sources/{source.id}/plan/samples").json()
            columns = {c["column"]: c for c in samples["columns"]}
            assert samples["sample_rows"] == fx.CLIENTS_V1_ROWS
            assert "jean.dupont@example.fr" not in str(columns["email"])

            rejects = client.get(f"/sources/{source.id}/rejects", params={"limit": 3}).json()
            assert rejects["total_rows"] == fx.CLIENTS_V1_REJECTED and len(rejects["rows"]) == 3

            approved = client.post(f"/sources/{source.id}/plan/approve").json()
            assert approved["version"] == draft["version"] + 1
            assert next(c for c in approved["columns"] if c["source_column"] == "commentaire")[
                "included"
            ]
            audit = client.get(f"/projects/{source.project_id}/audit").json()["items"]
            assert any(e["action"] == "silver_plan.review" for e in audit)
            assert client.get("/sources/missing/rejects").status_code == 404
    finally:
        state.catalog = type(state.catalog)(state.settings.catalog_path)
