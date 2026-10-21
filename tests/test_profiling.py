from __future__ import annotations

from pathlib import Path

import pytest

from forja_core.catalog import Catalog
from forja_core.ingestion import IngestionService
from forja_core.models import Project
from forja_core.profiling.models import (
    ColumnProfile,
    ConfidenceLevel,
    InferredType,
    PiiType,
    ProfileReport,
)
from forja_core.profiling.quality import WEIGHTS
from tests.fixtures import generate as fx


def _profile(
    ingestion: IngestionService, catalog: Catalog, project: Project, path: Path
) -> list[ProfileReport]:
    sources = ingestion.ingest_file(project.id, path, path.name)
    return [catalog.get_profile(s.id) for s in sources]


@pytest.fixture
def fr_profile(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> ProfileReport:
    [report] = _profile(ingestion, catalog, project, fixtures_dir / fx.FR_CSV)
    return report


def _column(report: ProfileReport, name: str) -> ColumnProfile:
    return next(c for c in report.columns if c.name == name)


def test_fr_csv_inferred_types(fr_profile: ProfileReport) -> None:
    types = {c.name: c.inferred.inferred_type for c in fr_profile.columns}
    assert types == {
        "id": InferredType.INTEGER,
        "nom": InferredType.STRING,
        "prénom": InferredType.STRING,
        "email": InferredType.STRING,
        "téléphone": InferredType.STRING,
        "code_postal": InferredType.STRING,
        "date_inscription": InferredType.DATE,
        "montant_total": InferredType.DECIMAL,
        "iban": InferredType.STRING,
        "actif": InferredType.BOOLEAN,
        "commentaire": InferredType.STRING,
    }


def test_fr_dates_and_decimals(fr_profile: ProfileReport) -> None:
    dates = _column(fr_profile, "date_inscription")
    assert dates.inferred.format == "%d/%m/%Y"
    assert isinstance(dates.min, str) and dates.min.startswith("20")

    amounts = _column(fr_profile, "montant_total")
    assert amounts.inferred.decimal_separator == ","
    assert amounts.inferred.match_ratio == pytest.approx(31 / 32, abs=1e-3)
    assert isinstance(amounts.min, float) and isinstance(amounts.max, float)
    assert 0 < amounts.min < amounts.max <= 25_000
    assert amounts.mean is not None and amounts.min <= amounts.mean <= amounts.max


def test_fr_null_and_cardinality(fr_profile: ProfileReport) -> None:
    email = _column(fr_profile, "email")
    assert email.null_count == len(fx.FR_MISSING_EMAIL_INDEXES)
    assert email.null_pct == pytest.approx(100 * 2 / 32, abs=0.01)

    identifier = _column(fr_profile, "id")
    assert identifier.distinct_count == fx.FR_ROW_COUNT
    assert not identifier.is_unique
    assert identifier.min == 1 and identifier.max == fx.FR_ROW_COUNT

    actif = _column(fr_profile, "actif")
    assert actif.distinct_count == 2
    assert sum(v.count for v in actif.top_values) == fr_profile.row_count


def test_fr_duplicates_and_keys(fr_profile: ProfileReport) -> None:
    assert fr_profile.duplicates.duplicate_rows == 2
    assert fr_profile.duplicates.duplicate_groups == 2
    assert fr_profile.candidate_keys == []


def test_fr_pii_detection(fr_profile: ProfileReport) -> None:
    found = {d.column: d for d in fr_profile.pii}
    expected = {
        "email": PiiType.EMAIL,
        "téléphone": PiiType.PHONE,
        "iban": PiiType.IBAN,
        "prénom": PiiType.FIRST_NAME,
        "nom": PiiType.LAST_NAME,
    }
    assert {name: d.pii_type for name, d in found.items()} == expected
    for name in ("email", "téléphone", "iban", "prénom", "nom"):
        assert found[name].level is ConfidenceLevel.HIGH, name
    assert _column(fr_profile, "commentaire").pii is None
    assert _column(fr_profile, "code_postal").pii is None


def test_quality_score_breakdown(fr_profile: ProfileReport) -> None:
    quality = fr_profile.quality
    assert 0 <= quality.score <= 100
    assert [c.name for c in quality.components] == list(WEIGHTS)
    assert sum(c.weight for c in quality.components) == 100
    assert quality.score == pytest.approx(sum(c.points for c in quality.components), abs=0.1)
    identifiability = next(c for c in quality.components if c.name == "identifiability")
    assert identifiability.score == 0
    assert any("duplicate" in issue for issue in quality.issues)
    assert any("personal data" in issue for issue in quality.issues)


def test_excel_composite_key(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    orders, stores = _profile(ingestion, catalog, project, fixtures_dir / fx.EXCEL)

    # ordered_at is a function of order_id, so it forms an equivalent key with line_no.
    composite = [k.columns for k in orders.candidate_keys if k.kind == "composite"]
    assert ["order_id", "line_no"] in composite
    assert all("line_no" in key for key in composite)
    assert not any(k.kind == "simple" for k in orders.candidate_keys)
    assert _column(orders, "ordered_at").inferred.inferred_type is InferredType.DATETIME

    assert ["store_id"] in [k.columns for k in stores.candidate_keys]


def test_parquet_simple_key_and_quality(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    [report] = _profile(ingestion, catalog, project, fixtures_dir / fx.PARQUET)

    simple = [k.columns for k in report.candidate_keys if k.kind == "simple"]
    assert ["product_id"] in simple
    assert report.duplicates.duplicate_rows == 0
    assert report.quality.score == 100
    price = _column(report, "price")
    assert price.inferred.from_text is False
    assert price.min == 3.5 and price.max == 35.0


def test_json_profile(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    [report] = _profile(ingestion, catalog, project, fixtures_dir / fx.JSON_ARRAY)
    occurred = _column(report, "occurred_at")
    assert occurred.inferred.inferred_type is InferredType.DATETIME
    assert occurred.inferred.format == "%Y-%m-%dT%H:%M:%S"
    assert _column(report, "user.email").pii is not None
    assert ["event_id"] in [k.columns for k in report.candidate_keys]
