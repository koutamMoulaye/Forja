from __future__ import annotations

import shutil
from pathlib import Path

import pyarrow.parquet as pq
import pytest

from forja_core.catalog import Catalog
from forja_core.config import DuplicateColumnPolicy, Settings
from forja_core.errors import (
    CorruptedFileError,
    DuplicateColumnsError,
    EmptyFileError,
    EncodingDetectionError,
    ProjectNotFoundError,
    UnsupportedFormatError,
)
from forja_core.ingestion import IngestionService
from forja_core.ingestion.service import row_hashes
from forja_core.models import TECHNICAL_COLUMNS, Project, Source, SourceFormat
from forja_core.storage import Workspace
from tests.fixtures import generate as fx


def _ingest(
    service: IngestionService, project: Project, fixtures_dir: Path, name: str
) -> list[Source]:
    return service.ingest_file(project.id, fixtures_dir / name, name)


def test_fr_csv_lands_in_bronze(
    ingestion: IngestionService, project: Project, fixtures_dir: Path, workspace: Workspace
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.FR_CSV)

    assert source.name == "clients_fr_sale"
    assert source.format is SourceFormat.CSV
    assert source.delimiter == ";"
    assert source.encoding == "cp1252"
    assert source.row_count == fx.FR_ROW_COUNT + len(fx.FR_DUPLICATED_INDEXES)
    assert source.column_count == len(fx.FR_HEADER)
    assert [c.name for c in source.columns if not c.technical] == fx.FR_HEADER
    assert [c.name for c in source.columns if c.technical] == list(TECHNICAL_COLUMNS)

    path = workspace.resolve(source.bronze_path)
    assert path.is_relative_to(workspace.root / project.id / "bronze" / source.name)
    assert path.suffix == ".parquet"

    table = pq.read_table(path)
    assert table.num_rows == source.row_count
    first = table.slice(0, 1).to_pylist()[0]
    assert first["prénom"] == "Jean"
    assert "Lefèvre" in table.column("nom").to_pylist()
    assert first["_source_file"] == fx.FR_CSV
    assert first["_ingested_at"] is not None
    assert len(first["_row_hash"]) == 64


def test_fr_csv_keeps_quoted_delimiters_and_nulls(
    ingestion: IngestionService, project: Project, fixtures_dir: Path, workspace: Workspace
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.FR_CSV)
    table = pq.read_table(workspace.resolve(source.bronze_path))
    comments = table.column("commentaire").to_pylist()
    emails = table.column("email").to_pylist()

    assert "Appel; rappel demain" in comments
    assert None in comments
    assert emails.count(None) == len(fx.FR_MISSING_EMAIL_INDEXES)


def test_row_hash_identifies_exact_duplicates(
    ingestion: IngestionService, project: Project, fixtures_dir: Path, workspace: Workspace
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.FR_CSV)
    hashes = pq.read_table(workspace.resolve(source.bronze_path)).column("_row_hash").to_pylist()
    assert len(hashes) - len(set(hashes)) == len(fx.FR_DUPLICATED_INDEXES)


def test_row_hash_is_deterministic(fixtures_dir: Path) -> None:
    table = pq.read_table(fixtures_dir / fx.PARQUET)
    assert row_hashes(table) == row_hashes(table)
    assert len(set(row_hashes(table))) == table.num_rows


def test_source_is_registered_in_catalog(
    ingestion: IngestionService, catalog: Catalog, project: Project, fixtures_dir: Path
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.FR_CSV)

    stored = catalog.get_source(source.id)
    assert stored.columns == source.columns
    assert stored.quality_score is not None
    assert [s.id for s in catalog.list_sources(project.id)] == [source.id]


def test_excel_ingests_every_non_empty_sheet(
    ingestion: IngestionService, project: Project, fixtures_dir: Path
) -> None:
    sources = _ingest(ingestion, project, fixtures_dir, fx.EXCEL)

    assert [s.name for s in sources] == ["ventes__commandes", "ventes__magasins"]
    assert [s.sheet_name for s in sources] == ["Commandes", "Magasins"]
    assert all("empty sheet(s) skipped: Vide" in s.warnings for s in sources)
    orders = {c.name: c.type for c in sources[0].columns}
    assert orders["order_id"] == "BIGINT"
    assert orders["unit_price"] == "DOUBLE"
    assert orders["ordered_at"].startswith("TIMESTAMP")
    assert {c.name: c.type for c in sources[1].columns}["opened_on"].startswith("TIMESTAMP")


def test_parquet_preserves_types(
    ingestion: IngestionService, project: Project, fixtures_dir: Path
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.PARQUET)
    types = {c.name: c.type for c in source.columns}
    assert types["product_id"] == "BIGINT"
    assert types["price"] == "DOUBLE"
    assert source.row_count == 10


@pytest.mark.parametrize("name", [fx.JSON_ARRAY, fx.JSON_LINES])
def test_json_array_and_lines_are_flattened(
    ingestion: IngestionService, project: Project, fixtures_dir: Path, name: str
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, name)
    names = [c.name for c in source.columns if not c.technical]
    assert names == ["event_id", "type", "occurred_at", "user.id", "user.email", "tags"]
    assert source.row_count == 8


def test_utf8_comma_csv(ingestion: IngestionService, project: Project, fixtures_dir: Path) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.UTF8_COMMA_CSV)
    assert source.delimiter == ","
    assert source.encoding == "utf-8"
    assert source.row_count == 3


def test_duplicated_columns_are_renamed(
    ingestion: IngestionService, project: Project, fixtures_dir: Path
) -> None:
    [source] = _ingest(ingestion, project, fixtures_dir, fx.DUPLICATED_COLUMNS)
    names = [c.name for c in source.columns if not c.technical]
    assert names == ["id", "Name", "name_2", "column_4", "value", "id_2"]
    assert any("duplicated column 'name'" in w for w in source.warnings)
    assert any("no header" in w for w in source.warnings)


def test_duplicated_columns_can_be_rejected(
    catalog: Catalog, workspace: Workspace, settings: Settings, project: Project, fixtures_dir: Path
) -> None:
    strict = settings.model_copy(update={"duplicate_columns": DuplicateColumnPolicy.ERROR})
    service = IngestionService(catalog, workspace, strict)
    with pytest.raises(DuplicateColumnsError) as excinfo:
        _ingest(service, project, fixtures_dir, fx.DUPLICATED_COLUMNS)
    assert excinfo.value.details["columns"] == ["id", "name"]


@pytest.mark.parametrize(
    ("name", "error"),
    [
        (fx.EMPTY, EmptyFileError),
        (fx.HEADER_ONLY, EmptyFileError),
        (fx.CORRUPTED_PARQUET, CorruptedFileError),
        (fx.CORRUPTED_EXCEL, CorruptedFileError),
        (fx.BINARY_CSV, EncodingDetectionError),
    ],
)
def test_invalid_files_are_rejected(
    ingestion: IngestionService,
    catalog: Catalog,
    project: Project,
    fixtures_dir: Path,
    name: str,
    error: type[Exception],
) -> None:
    with pytest.raises(error):
        _ingest(ingestion, project, fixtures_dir, name)
    assert catalog.list_sources(project.id) == []


def test_invalid_json_reports_line(
    ingestion: IngestionService, project: Project, tmp_path: Path
) -> None:
    path = tmp_path / "broken.json"
    path.write_text('{"a": 1}\n{"a": 2\n', encoding="utf-8")
    with pytest.raises(CorruptedFileError) as excinfo:
        ingestion.ingest_file(project.id, path, "broken.json")
    assert excinfo.value.details == {"line": 2}


def test_unsupported_extension(
    ingestion: IngestionService, project: Project, tmp_path: Path
) -> None:
    path = tmp_path / "notes.docx"
    path.write_bytes(b"\x00\x01")
    with pytest.raises(UnsupportedFormatError):
        ingestion.ingest_file(project.id, path, "notes.docx")


def test_unknown_project(ingestion: IngestionService, fixtures_dir: Path) -> None:
    with pytest.raises(ProjectNotFoundError):
        ingestion.ingest_file("missing", fixtures_dir / fx.FR_CSV, fx.FR_CSV)


def test_reingesting_a_file_creates_a_new_source(
    ingestion: IngestionService, project: Project, fixtures_dir: Path, tmp_path: Path
) -> None:
    first = _ingest(ingestion, project, fixtures_dir, fx.UTF8_COMMA_CSV)
    copy = tmp_path / fx.UTF8_COMMA_CSV
    shutil.copy(fixtures_dir / fx.UTF8_COMMA_CSV, copy)
    second = ingestion.ingest_file(project.id, copy, fx.UTF8_COMMA_CSV)
    assert first[0].name == "orders_utf8"
    assert second[0].name == "orders_utf8_2"
    assert first[0].bronze_path != second[0].bronze_path
