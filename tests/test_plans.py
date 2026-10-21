from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import PlanStateError, PlanValidationError
from forja_core.ingestion import IngestionService
from forja_core.models import Project, Source
from forja_core.silver.plan import (
    ColumnPatch,
    Normalization,
    PiiTreatment,
    PlanPatch,
    PlanStatus,
    RuleKind,
    SilverType,
    TransformationPlan,
)
from forja_core.silver.planner import build_plan, plan_signature, to_snake_case
from forja_core.silver.service import PlanService
from tests.fixtures import generate as fx


@pytest.fixture
def fr_source(ingestion: IngestionService, project: Project, fixtures_dir: Path) -> Source:
    [source] = ingestion.ingest_file(project.id, fixtures_dir / fx.FR_CSV, "clients.csv")
    return source


def _plan(catalog: Catalog, source: Source) -> TransformationPlan:
    return catalog.get_plan(source.id)


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("prénom", "prenom"),
        ("Téléphone Portable", "telephone_portable"),
        ("customerId", "customer_id"),
        ("user.email", "user_email"),
        ("2024 sales", "c_2024_sales"),
        ("_row_hash_src", "row_hash_src"),
        ("***", "column"),
    ],
)
def test_snake_case(name: str, expected: str) -> None:
    assert to_snake_case(name) == expected


def test_plan_generated_from_profile(catalog: Catalog, fr_source: Source) -> None:
    plan = _plan(catalog, fr_source)
    assert plan.status is PlanStatus.DRAFT
    assert plan.version == 1
    assert plan.model_name == "stg_clients"
    columns = {c.source_column: c for c in plan.columns}

    assert [c.target_column for c in plan.columns] == [
        "id", "nom", "prenom", "email", "telephone", "code_postal",
        "date_inscription", "montant_total", "iban", "actif", "commentaire",
    ]  # fmt: skip
    assert columns["id"].target_type is SilverType.BIGINT
    assert columns["code_postal"].target_type is SilverType.VARCHAR

    dates = columns["date_inscription"]
    assert dates.target_type is SilverType.DATE
    assert dates.cast.date_format == "%d/%m/%Y"
    assert dates.explanation.startswith(
        "Conversion en date au format JJ/MM/AAAA, aucune valeur invalide détectée."
    )

    amounts = columns["montant_total"]
    assert amounts.target_type is SilverType.DECIMAL
    assert amounts.explanation.startswith("Montant : conversion en décimal exact DECIMAL(18,2)")
    assert amounts.cast.decimal_separator == ","
    assert amounts.stats.invalid_count == 1
    assert "1 valeur invalide détectée" in amounts.explanation
    assert "n/a" in amounts.cast.null_values

    actif = columns["actif"]
    assert actif.target_type is SilverType.BOOLEAN
    assert (actif.cast.true_values, actif.cast.false_values) == (["oui"], ["non"])
    assert "oui → vrai, non → faux" in actif.explanation

    assert columns["email"].normalization is Normalization.LOWERCASE
    assert columns["iban"].normalization is Normalization.COMPACT_UPPERCASE
    assert columns["commentaire"].cast.null_values == []


def test_money_needs_an_amount_name_and_two_decimals(
    ingestion: IngestionService, catalog: Catalog, project: Project, tmp_path: Path
) -> None:
    path = tmp_path / "mesures.csv"
    path.write_text(
        "id;prix_ht;poids_kg;taux\n1;12,50;1,125;0,5\n2;7,99;2,5;0,25\n3;100;0,75;1\n",
        encoding="utf-8",
    )
    [source] = ingestion.ingest_file(project.id, path, path.name)
    types = {c.source_column: c.target_type for c in catalog.get_plan(source.id).columns}
    assert types["prix_ht"] is SilverType.DECIMAL
    assert types["poids_kg"] is SilverType.DOUBLE  # three decimals, not an amount
    assert types["taux"] is SilverType.DOUBLE  # not named like an amount
    profile = catalog.get_profile(source.id)
    assert {c.name: c.inferred.max_decimals for c in profile.columns}["poids_kg"] == 3


def test_plan_key_dedup_and_rules(catalog: Catalog, fr_source: Source) -> None:
    plan = _plan(catalog, fr_source)
    columns = {c.source_column: c for c in plan.columns}

    assert plan.primary_key is not None
    assert plan.primary_key.columns == ["id"]
    assert "Clé primaire retenue : id" in plan.primary_key.explanation
    assert plan.deduplication.enabled
    assert plan.deduplication.duplicate_rows == 2
    assert "2 doublons détectés" in plan.deduplication.explanation

    assert [r.kind for r in columns["id"].rules] == [RuleKind.NOT_NULL, RuleKind.CASTABLE]
    assert [r.kind for r in columns["email"].rules] == [RuleKind.EMAIL_FORMAT]
    assert [r.kind for r in columns["téléphone"].rules] == [RuleKind.PHONE_FORMAT]
    assert [r.kind for r in columns["iban"].rules] == [RuleKind.IBAN_FORMAT]
    assert columns["nom"].rules == []
    for column in plan.columns:
        assert column.explanation
        assert all(rule.explanation for rule in column.rules)


def test_quasi_unique_identifier_becomes_the_key(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    # One id is missing and another is shared by two different rows.
    [source] = ingestion.ingest_file(project.id, fixtures_dir / fx.CLIENTS_V1, "clients.csv")
    assert not any(k.columns == ["id"] for k in catalog.get_profile(source.id).candidate_keys)
    plan = catalog.get_plan(source.id)
    assert plan.primary_key is not None
    assert plan.primary_key.columns == ["id"]
    assert plan.primary_key.quasi_unique
    assert "quasi unique au profiling" in plan.primary_key.explanation


def test_plan_pii_treatment(catalog: Catalog, fr_source: Source) -> None:
    columns = {c.source_column: c for c in _plan(catalog, fr_source).columns}
    for name in ("nom", "prénom", "email", "téléphone", "iban"):
        assert columns[name].pii_treatment is PiiTreatment.HASH, name
        assert "pseudonymisée (HMAC-SHA256)" in columns[name].explanation
    assert columns["id"].pii_treatment is PiiTreatment.NONE


def test_plan_generation_is_deterministic(
    catalog: Catalog, fr_source: Source, settings: Settings
) -> None:
    profile = catalog.get_profile(fr_source.id)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    first = build_plan(fr_source, profile, settings, plan_id="p", version=1, now=now)
    second = build_plan(fr_source, profile, settings, plan_id="p", version=1, now=now)
    assert first == second
    assert plan_signature(first) == plan_signature(_plan(catalog, fr_source))


def test_auto_approve(catalog: Catalog, fr_source: Source, settings: Settings) -> None:
    auto = settings.model_copy(update={"auto_approve_silver": True})
    profile = catalog.get_profile(fr_source.id)
    plan = build_plan(fr_source, profile, auto, plan_id="p", version=1, now=datetime.now(UTC))
    assert plan.status is PlanStatus.APPROVED


def test_patch_creates_a_new_draft_version(
    catalog: Catalog, plan_service: PlanService, fr_source: Source
) -> None:
    patched = plan_service.patch(
        fr_source.id,
        PlanPatch(
            columns={
                "montant_total": ColumnPatch(target_type=SilverType.VARCHAR),
                "commentaire": ColumnPatch(included=False),
                "téléphone": ColumnPatch(rules={RuleKind.PHONE_FORMAT: False}),
                "email": ColumnPatch(pii_treatment=PiiTreatment.MASK, target_column="courriel"),
            }
        ),
    )
    assert patched.version == 2
    assert patched.status is PlanStatus.DRAFT
    columns = {c.source_column: c for c in patched.columns}
    assert columns["montant_total"].rules == []
    assert columns["montant_total"].explanation.startswith("Texte conservé.")
    assert not columns["commentaire"].included
    assert columns["commentaire"].explanation == "Colonne exclue de la couche Silver."
    phone_rule = columns["téléphone"].rules[0]
    assert not phone_rule.enabled
    assert phone_rule.explanation.endswith("(règle désactivée).")
    assert columns["email"].target_column == "courriel"
    assert "partiellement masquée" in columns["email"].explanation

    assert [p.version for p in catalog.list_plans(fr_source.id)] == [1, 2]
    assert catalog.get_plan(fr_source.id, version=1).columns[7].target_type is SilverType.DECIMAL


def test_patch_type_to_date_adds_cast_rule(plan_service: PlanService, fr_source: Source) -> None:
    patched = plan_service.patch(
        fr_source.id,
        PlanPatch(columns={"code_postal": ColumnPatch(target_type=SilverType.BIGINT)}),
    )
    column = next(c for c in patched.columns if c.source_column == "code_postal")
    assert [r.kind for r in column.rules] == [RuleKind.CASTABLE]
    assert "non évaluées" in column.explanation


def test_patch_primary_key(plan_service: PlanService, fr_source: Source) -> None:
    patched = plan_service.patch(fr_source.id, PlanPatch(primary_key=["code_postal", "nom"]))
    assert patched.primary_key is not None
    assert patched.primary_key.columns == ["code_postal", "nom"]
    rules = {c.source_column: [r.kind for r in c.rules] for c in patched.columns}
    assert RuleKind.NOT_NULL in rules["code_postal"]
    assert RuleKind.NOT_NULL not in rules["id"]

    removed = plan_service.patch(fr_source.id, PlanPatch(primary_key=[]))
    assert removed.primary_key is None
    assert "_row_hash" in removed.summary


@pytest.mark.parametrize(
    "patch",
    [
        PlanPatch(columns={"inconnue": ColumnPatch(included=False)}),
        PlanPatch(columns={"nom": ColumnPatch(target_column="Nom Client")}),
        PlanPatch(columns={"nom": ColumnPatch(target_column="prenom")}),
        PlanPatch(columns={"id": ColumnPatch(included=False)}),
        PlanPatch(columns={"nom": ColumnPatch(rules={RuleKind.CASTABLE: False})}),
        PlanPatch(primary_key=["commentaire", "absente"]),
    ],
)
def test_invalid_patches(plan_service: PlanService, fr_source: Source, patch: PlanPatch) -> None:
    with pytest.raises(PlanValidationError):
        plan_service.patch(fr_source.id, patch)


def test_approve_lifecycle(plan_service: PlanService, catalog: Catalog, fr_source: Source) -> None:
    assert catalog.effective_plan(fr_source.id) is None
    approved = plan_service.approve(fr_source.id)
    assert approved.status is PlanStatus.APPROVED
    assert catalog.effective_plan(fr_source.id) == approved
    with pytest.raises(PlanStateError):
        plan_service.approve(fr_source.id)

    plan_service.patch(fr_source.id, PlanPatch(deduplicate=False))
    # The approved version stays in use until the new draft is approved.
    effective = catalog.effective_plan(fr_source.id)
    assert effective is not None and effective.version == 1
    applied = plan_service.mark_applied(effective)
    assert catalog.get_plan(fr_source.id, version=1).status is PlanStatus.APPLIED
    assert applied.status is PlanStatus.APPLIED


def test_new_version_without_drift_keeps_plan(
    ingestion: IngestionService,
    catalog: Catalog,
    project: Project,
    fixtures_dir: Path,
    fr_source: Source,
) -> None:
    ingestion.ingest_file(project.id, fixtures_dir / fx.FR_CSV, "clients.csv")
    assert [p.version for p in catalog.list_plans(fr_source.id)] == [1]


def test_new_version_with_drift_refreshes_plan(
    ingestion: IngestionService,
    plan_service: PlanService,
    catalog: Catalog,
    project: Project,
    tmp_path: Path,
) -> None:
    v1 = tmp_path / "stock.csv"
    v1.write_text("sku;qty;label\nA;1;x\nB;2;y\n", encoding="utf-8")
    [source] = ingestion.ingest_file(project.id, v1, "stock.csv")
    plan_service.patch(source.id, PlanPatch(columns={"label": ColumnPatch(target_column="lib")}))

    v1.write_text("sku;qty;label;price\nC;3;z;1,5\n", encoding="utf-8")
    ingestion.ingest_file(project.id, v1, "stock.csv")

    plan = catalog.get_plan(source.id)
    assert plan.version == 3
    assert plan.based_on_source_version == 2
    columns = {c.source_column: c for c in plan.columns}
    assert columns["label"].target_column == "lib"
    assert columns["price"].target_type is SilverType.DECIMAL
    assert any("Nouvelle colonne « price »" in w for w in plan.warnings)


def test_plan_api(client: TestClient, fixtures_dir: Path) -> None:
    project_id = client.post("/projects", json={"name": "Plans"}).json()["id"]
    with (fixtures_dir / fx.FR_CSV).open("rb") as handle:
        [source] = client.post(
            f"/projects/{project_id}/sources", files={"file": ("clients.csv", handle)}
        ).json()

    plan = client.get(f"/sources/{source['id']}/plan").json()
    assert plan["status"] == "draft"

    response = client.patch(
        f"/sources/{source['id']}/plan",
        json={"columns": {"commentaire": {"included": False}}},
    )
    assert response.status_code == 200
    assert response.json()["version"] == 2

    bad = client.patch(f"/sources/{source['id']}/plan", json={"columns": {"x": {"included": 1}}})
    assert bad.status_code == 422
    unknown_field = client.patch(f"/sources/{source['id']}/plan", json={"colonnes": {}})
    assert unknown_field.status_code == 422

    approved = client.post(f"/sources/{source['id']}/plan/approve")
    assert approved.json()["status"] == "approved"
    again = client.post(f"/sources/{source['id']}/plan/approve")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "invalid_plan_state"
    assert len(client.get(f"/sources/{source['id']}/plans").json()) == 2
    assert client.get("/sources/missing/plan").status_code == 404
