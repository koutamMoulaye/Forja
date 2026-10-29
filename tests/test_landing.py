"""Streaming landing in Bronze: DuckDB's reader, the Python fallback and the row hash."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from forja_core.config import DuplicateColumnPolicy
from forja_core.ingestion import landing
from forja_core.ingestion.landing import Technical, land_csv, land_json, land_parquet, land_table
from forja_core.ingestion.service import row_hashes
from forja_core.models import TECHNICAL_COLUMNS

POLICY = DuplicateColumnPolicy.RENAME
TECH = Technical(
    batch_id="b" * 32, ingested_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC), source_file="f.csv"
)


def _data(path: Path) -> pa.Table:
    table = pq.read_table(path)
    return table.drop_columns([c for c in TECHNICAL_COLUMNS if c != "_row_hash"])


def test_duckdb_and_python_readers_land_the_same_rows(tmp_path: Path) -> None:
    source = tmp_path / "clients.csv"
    source.write_bytes(
        'id;nom;note\n1;"Zoé, ""la"" grande";\n2;Élise;  \n;;\n3;"multi\nligne";x\n'.encode()
    )
    fast = land_csv(source, POLICY, tmp_path / "fast" / "out.parquet", TECH)
    python = landing._csv_python(
        landing._TextFile(source, "utf-8"), ";", POLICY, tmp_path / "py" / "out.parquet", TECH
    )
    assert fast.row_count == python.row_count == 3
    assert _data(tmp_path / "fast" / "out.parquet").equals(_data(tmp_path / "py" / "out.parquet"))
    rows = pq.read_table(tmp_path / "fast" / "out.parquet").to_pylist()
    assert rows[0]["nom"] == 'Zoé, "la" grande' and rows[0]["note"] is None
    assert rows[1]["note"] is None  # blank values are nulls
    assert rows[2]["nom"] == "multi\nligne"
    assert rows[0]["_ingested_at"] == TECH.ingested_at
    assert {r["_batch_id"] for r in rows} == {TECH.batch_id}


def test_row_hash_is_the_one_computed_in_python_before(tmp_path: Path) -> None:
    values = ["a", None, 'é"\\x', "line\nbreak", "\x01", "emoji \U0001f600", "", "  "]
    table = pa.table(
        {"c1": pa.array(values, pa.string()), "c2": pa.array(["1"] * len(values), pa.string())}
    )
    target = tmp_path / "out.parquet"
    land_table(table, target, TECH)
    assert pq.read_table(target).column("_row_hash").to_pylist() == row_hashes(table)


def test_ragged_rows_go_through_the_python_reader(tmp_path: Path) -> None:
    source = tmp_path / "ragged.csv"
    source.write_bytes(b"a,b\n1,2\n3\n4,5,6\n")
    landed = land_csv(source, POLICY, tmp_path / "out.parquet", TECH)
    assert landed.column_count == 3 and landed.row_count == 3
    assert any("more fields than the header" in w for w in landed.warnings)
    assert any("padded with nulls" in w for w in landed.warnings)
    rows = pq.read_table(tmp_path / "out.parquet").to_pylist()
    assert [r["column_3"] for r in rows] == [None, None, "6"]


def test_single_byte_encoding_found_after_the_first_megabyte(tmp_path: Path) -> None:
    source = tmp_path / "latin.csv"
    lines = ["code;libelle"] + [f"{i};ligne {i}" for i in range(80_000)] + ["99999;été à Noël"]
    source.write_bytes("\n".join(lines).encode("cp1252"))
    assert source.stat().st_size > landing.SAMPLE_BYTES
    landed = land_csv(source, POLICY, tmp_path / "out.parquet", TECH)
    assert landed.encoding == "cp1252"
    last = pq.read_table(tmp_path / "out.parquet").to_pylist()[-1]
    assert last["libelle"] == "été à Noël"
    assert not list(tmp_path.glob("*.utf8"))  # the transcoded copy is gone


def test_json_object_with_a_list_of_records(tmp_path: Path) -> None:
    source = tmp_path / "export.json"
    source.write_text(
        json.dumps(
            {
                "meta": {"count": 2},
                "commandes": [
                    {"id": 1, "client": {"nom": "A", "ville": "Lyon"}, "lignes": [1, 2]},
                    {"id": 2, "client": {"nom": "B"}, "date": "2026-01-02"},
                ],
            }
        ),
        encoding="utf-8",
    )
    landed = land_json(source, POLICY, tmp_path / "out.parquet", TECH)
    assert landed.row_count == 2
    assert "records extracted from top-level key 'commandes'" in landed.warnings
    table = pq.read_table(tmp_path / "out.parquet")
    assert {"id", "client.nom", "client.ville", "lignes", "date"} <= set(table.column_names)
    # Dates stay text: types are inferred by the profile, as for CSV files.
    assert table.schema.field("date").type == pa.string()
    assert table.to_pylist()[0]["lignes"] == "[1,2]"


def test_parquet_columns_are_renamed_not_loaded_in_memory(tmp_path: Path) -> None:
    source = tmp_path / "in.parquet"
    pq.write_table(pa.table({"_row_hash": [1, 2], "Prix": [1.5, 2.5], "prix": [3, 4]}), source)
    landed = land_parquet(source, POLICY, tmp_path / "out.parquet", TECH)
    names = pq.read_table(tmp_path / "out.parquet").column_names
    assert names[:3] == ["_row_hash_src", "Prix", "prix_2"]
    assert len(landed.warnings) == 2


def test_a_failed_landing_leaves_no_partial_file(tmp_path: Path) -> None:
    def broken() -> object:
        yield pa.record_batch({"a": pa.array(["x"])})
        raise RuntimeError("the source went away")

    reader = pa.RecordBatchReader.from_batches(pa.schema([("a", pa.string())]), broken())
    with pytest.raises(Exception, match="went away"):
        landing.land_batches(reader, tmp_path / "out.parquet", TECH)
    assert list(tmp_path.iterdir()) == []
