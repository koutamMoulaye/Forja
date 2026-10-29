"""Landing in Bronze: a source streamed by DuckDB into one Parquet file per version.

Nothing is loaded whole in memory. DuckDB reads CSV, Parquet and JSON files itself and
writes Parquet with ``COPY``; Excel workbooks, connectors and the CSV files DuckDB's
strict reader refuses arrive as Arrow record batches, written by the same ``COPY``.

Every row gets the technical columns (``_batch_id``, ``_ingested_at``, ``_source_file``)
and ``_row_hash``: the SHA-256 of the row's values as compact JSON, computed by DuckDB.
For text values it is byte for byte the hash earlier versions computed in Python
(``row_hashes``), so new-row counts stay right across versions.
"""

from __future__ import annotations

import codecs
import csv
import io
import shutil
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import cast

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from duckdb.sqltypes import DuckDBPyType

from forja_core import duck
from forja_core.config import DuplicateColumnPolicy
from forja_core.errors import (
    CorruptedFileError,
    EmptyFileError,
    EncodingDetectionError,
    ForjaError,
)
from forja_core.ingestion.detection import _best_single_byte_encoding, detect_delimiter
from forja_core.ingestion.readers import normalize_headers, read_json
from forja_core.logging import get_logger
from forja_core.utils import quote_ident, sql_literal

log = get_logger(__name__)

SAMPLE_BYTES = 1024 * 1024
BATCH_ROWS = 50_000
# Single JSON documents (not lines) up to this size are parsed whole.
JSON_MAX_OBJECT_BYTES = 1024 * 1024 * 1024
# Below this size, a JSON file DuckDB cannot read goes through the Python reader, whose
# errors say where the file is broken.
JSON_FALLBACK_MAX_BYTES = 256 * 1024 * 1024
# A value made of white space only is null. A regular expression: trim() with a set of
# characters is ten times slower on large files.
_BLANK = r"'\s*'"
_BOMS: tuple[tuple[bytes, str], ...] = (
    (codecs.BOM_UTF8, "utf-8-sig"),
    (codecs.BOM_UTF32_LE, "utf-32"),
    (codecs.BOM_UTF32_BE, "utf-32"),
    (codecs.BOM_UTF16_LE, "utf-16"),
    (codecs.BOM_UTF16_BE, "utf-16"),
)


@dataclass(frozen=True)
class Technical:
    """Values of the technical columns, the same for every row of a version."""

    batch_id: str
    ingested_at: datetime
    source_file: str


@dataclass
class Landed:
    row_count: int
    column_count: int
    encoding: str | None = None
    delimiter: str | None = None
    warnings: list[str] = field(default_factory=list)


Lander = Callable[[Path, Technical], Landed]


def row_hash_sql(columns: Sequence[str]) -> str:
    values = ", ".join(quote_ident(c) for c in columns)
    return f"sha256(CAST(json_array({values}) AS VARCHAR))"


def _copy(
    con: duckdb.DuckDBPyConnection,
    relation_sql: str,
    columns: Sequence[str],
    target: Path,
    technical: Technical,
    *,
    where: str = "",
) -> int:
    """Write ``relation_sql`` (already holding the final column names) with the technical
    columns to ``target``; returns the number of rows written."""
    names = ", ".join(quote_ident(c) for c in columns)
    stamp = technical.ingested_at.isoformat()
    select = (
        f"SELECT {names}, {sql_literal(technical.batch_id)} AS _batch_id, "
        f"CAST({sql_literal(stamp)} AS TIMESTAMPTZ) AS _ingested_at, "
        f"{sql_literal(technical.source_file)} AS _source_file, "
        f"{row_hash_sql(columns)} AS _row_hash "
        f"FROM ({relation_sql}) AS landed {where}"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    try:
        con.execute(
            f"COPY ({select}) TO {sql_literal(str(partial))} "
            "(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)"
        )
        [(rows,)] = con.execute(
            f"SELECT count(*) FROM read_parquet({sql_literal(str(partial))})"
        ).fetchall()
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    partial.replace(target)
    return int(rows)


def land_batches(reader: pa.RecordBatchReader, target: Path, technical: Technical) -> int:
    """Write Arrow batches (column names already final) to ``target``."""
    with duck.connect() as con:
        con.register("forja_batches", reader)
        return _copy(con, "SELECT * FROM forja_batches", reader.schema.names, target, technical)


def land_table(table: pa.Table, target: Path, technical: Technical) -> int:
    return land_batches(
        pa.RecordBatchReader.from_batches(table.schema, table.to_batches(BATCH_ROWS)),
        target,
        technical,
    )


# --- CSV -------------------------------------------------------------------------------


@dataclass
class _TextFile:
    path: Path
    encoding: str
    transcoded: bool = False


def _sniff_encoding(sample: bytes) -> str:
    for bom, encoding in _BOMS:
        if sample.startswith(bom):
            return encoding
    if b"\x00" in sample:
        raise EncodingDetectionError("file contains binary data or uses an unknown encoding")
    decoder = codecs.getincrementaldecoder("utf-8")()
    try:
        decoder.decode(sample, final=False)
    except UnicodeDecodeError:
        return _best_single_byte_encoding(sample)
    return "utf-8"


def _transcode(path: Path, encoding: str, scratch: Path) -> Path:
    """Stream ``path`` decoded with ``encoding`` into a UTF-8 file in ``scratch``."""
    target = scratch / f"{path.name}.utf8"
    try:
        with (
            path.open("r", encoding=encoding, errors="strict", newline="") as source,
            target.open("w", encoding="utf-8", newline="") as out,
        ):
            shutil.copyfileobj(source, out, 4 * 1024 * 1024)
    except (UnicodeDecodeError, UnicodeError) as exc:
        target.unlink(missing_ok=True)
        raise EncodingDetectionError(
            f"detected encoding '{encoding}' cannot decode the whole file"
        ) from exc
    return target


def _utf8_text(path: Path, scratch: Path) -> tuple[_TextFile, str]:
    """A UTF-8 view of the file (transcoded if needed) and its decoded sample."""
    with path.open("rb") as handle:
        sample = handle.read(SAMPLE_BYTES)
    if not sample.strip():
        raise EmptyFileError("file is empty")
    encoding = _sniff_encoding(sample)
    if encoding == "utf-8":
        text = codecs.getincrementaldecoder("utf-8")().decode(sample, final=False)
        return _TextFile(path, "utf-8"), text
    if encoding == "utf-8-sig":
        text = codecs.getincrementaldecoder("utf-8-sig")().decode(sample, final=False)
        return _TextFile(path, "utf-8-sig"), text
    try:
        text = codecs.getincrementaldecoder(encoding)().decode(sample, final=False)
    except (UnicodeDecodeError, LookupError) as exc:
        raise EncodingDetectionError(
            f"file declares {encoding} but cannot be decoded with it"
        ) from exc
    transcoded = _transcode(path, encoding, scratch)
    return _TextFile(transcoded, encoding, transcoded=True), text


def _first_rows(text: str, delimiter: str, limit: int) -> tuple[list[list[str]], bool]:
    """Non-blank rows of the sample, and whether blank lines precede the header."""
    rows: list[list[str]] = []
    leading_blank = False
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    try:
        for row in reader:
            if not any(cell.strip() for cell in row):
                if not rows:
                    leading_blank = True
                continue
            rows.append(row)
            if len(rows) >= limit:
                break
    except csv.Error:
        pass
    return rows, leading_blank


def _clean(alias: str, name: str) -> str:
    column = quote_ident(alias)
    return (
        f"CASE WHEN regexp_full_match({column}, {_BLANK}) THEN NULL ELSE {column} END "
        f"AS {quote_ident(name)}"
    )


def _not_blank(names: Sequence[str]) -> str:
    return "WHERE NOT (" + " AND ".join(f"{quote_ident(n)} IS NULL" for n in names) + ")"


def _csv_fast(
    text: _TextFile,
    delimiter: str,
    names: list[str],
    target: Path,
    technical: Technical,
) -> int:
    """DuckDB's own parallel reader: RFC 4180 files whose rows all have the header's width."""
    aliases = [f"c{i}" for i in range(len(names))]
    columns = "{" + ", ".join(f"{sql_literal(a)}: 'VARCHAR'" for a in aliases) + "}"
    source = (
        f"SELECT {', '.join(_clean(a, n) for a, n in zip(aliases, names, strict=True))} "
        f"FROM read_csv({sql_literal(str(text.path))}, auto_detect = false, header = true, "
        f"delim = {sql_literal(delimiter)}, quote = '\"', escape = '\"', "
        f"columns = {columns}, strict_mode = true, max_line_size = 67108864)"
    )
    with duck.connect() as con:
        return _copy(con, source, names, target, technical, where=_not_blank(names))


def _csv_rows(path: Path, encoding: str, delimiter: str) -> Iterator[list[str]]:
    with path.open("r", encoding=encoding, newline="") as handle:
        for row in csv.reader(handle, delimiter=delimiter):
            if any(cell.strip() for cell in row):
                yield row


def _csv_python(
    text: _TextFile,
    delimiter: str,
    policy: DuplicateColumnPolicy,
    target: Path,
    technical: Technical,
) -> Landed:
    """Python's csv module, in two streamed passes: the layout, then the batches.

    It accepts what the strict reader refuses (ragged rows, stray quotes) with the
    rules of the earlier in-memory reader: short rows padded with nulls, extra fields
    in new columns.
    """
    encoding = "utf-8" if text.transcoded else text.encoding
    try:
        rows = _csv_rows(text.path, encoding, delimiter)
        header = next(rows, None)
        if header is None:
            raise EmptyFileError("file is empty")
        width = len(header)
        body = 0
        for row in rows:
            body += 1
            width = max(width, len(row))
    except csv.Error as exc:
        raise CorruptedFileError(f"malformed CSV content: {exc}") from exc
    if not body:
        raise EmptyFileError("file contains a header but no data rows")

    warnings: list[str] = []
    if width > len(header):
        warnings.append(
            f"some rows have more fields than the header ({width} > {len(header)}), "
            "extra columns were added"
        )
    names, header_warnings = normalize_headers(header + [""] * (width - len(header)), policy)
    schema = pa.schema([pa.field(name, pa.string()) for name in names])
    short_rows = 0

    def batches() -> Iterator[pa.RecordBatch]:
        nonlocal short_rows
        stream = _csv_rows(text.path, encoding, delimiter)
        next(stream)
        columns: list[list[str | None]] = [[] for _ in names]
        count = 0
        for row in stream:
            if len(row) < width:
                short_rows += 1
            for index in range(width):
                value = row[index] if index < len(row) else None
                columns[index].append(value if value is not None and value.strip() else None)
            count += 1
            if count == BATCH_ROWS:
                yield pa.RecordBatch.from_arrays(
                    [pa.array(c, type=pa.string()) for c in columns], schema=schema
                )
                columns = [[] for _ in names]
                count = 0
        if count:
            yield pa.RecordBatch.from_arrays(
                [pa.array(c, type=pa.string()) for c in columns], schema=schema
            )

    try:
        rows_written = land_batches(
            pa.RecordBatchReader.from_batches(schema, batches()), target, technical
        )
    except csv.Error as exc:
        raise CorruptedFileError(f"malformed CSV content: {exc}") from exc
    if short_rows:
        warnings.append(f"{short_rows} row(s) have missing trailing fields, padded with nulls")
    return Landed(
        row_count=rows_written,
        column_count=len(names),
        warnings=header_warnings + warnings,
    )


def land_csv(
    path: Path, policy: DuplicateColumnPolicy, target: Path, technical: Technical
) -> Landed:
    scratch = target.parent
    scratch.mkdir(parents=True, exist_ok=True)
    text, sample = _utf8_text(path, scratch)
    try:
        sample = sample.lstrip("﻿")
        if not sample.strip():
            raise EmptyFileError("file is empty")
        delimiter = detect_delimiter(sample)
        rows, leading_blank = _first_rows(sample, delimiter, 2)
        if not rows:
            raise EmptyFileError("file is empty")
        encoding = text.encoding
        names, header_warnings = normalize_headers(rows[0], policy)
        if not leading_blank and len(rows) > 1:
            try:
                count = _csv_fast(text, delimiter, names, target, technical)
            except duckdb.Error as exc:
                log.info("csv_strict_reader_declined", error=str(exc).splitlines()[0][:200])
            else:
                if count == 0:
                    target.unlink(missing_ok=True)
                    raise EmptyFileError("file contains a header but no data rows")
                return Landed(
                    row_count=count,
                    column_count=len(names),
                    encoding=encoding,
                    delimiter=delimiter,
                    warnings=header_warnings,
                )
        try:
            landed = _csv_python(text, delimiter, policy, target, technical)
        except UnicodeDecodeError as exc:
            # Valid UTF-8 at the start, not further on: a single-byte code page.
            with path.open("rb") as handle:
                handle.seek(max(0, exc.start - SAMPLE_BYTES // 2))
                window = handle.read(SAMPLE_BYTES)
            encoding = _best_single_byte_encoding(window)
            if encoding.replace("_", "-") in ("ascii", "utf-8"):
                encoding = "cp1252"
            if text.transcoded:
                text.path.unlink(missing_ok=True)
            text = _TextFile(_transcode(path, encoding, scratch), encoding, transcoded=True)
            landed = _csv_python(text, delimiter, policy, target, technical)
        landed.encoding, landed.delimiter = encoding, delimiter
        return landed
    finally:
        if text.transcoded:
            text.path.unlink(missing_ok=True)


# --- Parquet ---------------------------------------------------------------------------


def land_parquet(
    path: Path, policy: DuplicateColumnPolicy, target: Path, technical: Technical
) -> Landed:
    if path.stat().st_size == 0:
        raise EmptyFileError("file is empty")
    source = f"read_parquet({sql_literal(str(path))})"
    with duck.connect() as con:
        try:
            columns = [
                str(row[0]) for row in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()
            ]
            # DuckDB renames duplicated names itself (prix -> prix_1): the file's own names,
            # read from its footer only, keep the renaming rules of the other formats.
            original = pq.read_schema(path).names
        except (duckdb.Error, pa.ArrowException, OSError) as exc:
            raise CorruptedFileError(f"cannot read Parquet file: {exc}") from exc
        if len(original) != len(columns):
            original = columns
        names, warnings = normalize_headers(original, policy)
        select = ", ".join(
            f"{quote_ident(c)} AS {quote_ident(n)}" for c, n in zip(columns, names, strict=True)
        )
        try:
            rows = _copy(con, f"SELECT {select} FROM {source}", names, target, technical)
        except duckdb.Error as exc:
            raise CorruptedFileError(f"cannot read Parquet file: {exc}") from exc
    if rows == 0:
        target.unlink(missing_ok=True)
        raise EmptyFileError("Parquet file contains no rows")
    return Landed(row_count=rows, column_count=len(names), warnings=warnings)


# --- JSON ------------------------------------------------------------------------------


def _flat_columns(expression: str, name: str, kind: DuckDBPyType) -> list[tuple[str, str]]:
    """``(name, sql)`` of the scalar columns of a JSON value: objects become ``a.b``
    columns, lists and maps their JSON text, mixed values their text."""
    if kind.id == "struct":
        flat: list[tuple[str, str]] = []
        for child, child_type in kind.children:
            flat += _flat_columns(
                f"struct_extract({expression}, {sql_literal(child)})",
                f"{name}.{child}",
                cast(DuckDBPyType, child_type),
            )
        return flat
    if kind.id in ("list", "map", "array"):
        return [(name, f"CAST(to_json({expression}) AS VARCHAR)")]
    if str(kind) == "JSON":
        return [
            (
                name,
                f"CASE WHEN json_type({expression}) = 'VARCHAR' "
                f"THEN json_extract_string({expression}, '$') "
                f"ELSE CAST({expression} AS VARCHAR) END",
            )
        ]
    if str(kind) == '"NULL"':
        return [(name, f"CAST({expression} AS VARCHAR)")]
    return [(name, expression)]


def _land_json_duckdb(
    path: Path, policy: DuplicateColumnPolicy, target: Path, technical: Technical
) -> Landed:
    source = (
        f"read_json({sql_literal(str(path))}, format = 'auto', "
        f"maximum_object_size = {JSON_MAX_OBJECT_BYTES}, "
        "dateformat = '%%forja', timestampformat = '%%forja')"
    )
    warnings: list[str] = []
    with duck.connect() as con:
        relation = con.sql(f"SELECT * FROM {source}")
        names, types = relation.columns, relation.types
        with path.open("rb") as handle:
            starts_with_object = handle.read(4096).lstrip()[:1] == b"{"
        if starts_with_object and con.execute(
            f"SELECT count(*) FROM (SELECT 1 FROM {source} LIMIT 2)"
        ).fetchall() == [(1,)]:
            lists = [(n, t) for n, t in zip(names, types, strict=True) if t.id == "list"]
            if (
                len(lists) == 1
                and lists[0][1].child.id == "struct"
                and sum(1 for t in types if t.id == "list") == 1
            ):
                key = lists[0][0]
                warnings.append(f"records extracted from top-level key '{key}'")
                records = (
                    f"(SELECT unnest({quote_ident(key)}, recursive := false) AS r FROM {source})"
                )
                source = f"(SELECT r.* FROM {records})"
                relation = con.sql(f"SELECT * FROM {source}")
                names, types = relation.columns, relation.types
        flat: list[tuple[str, str]] = []
        for name, kind in zip(names, types, strict=True):
            flat += _flat_columns(quote_ident(name), name, kind)
        final, header_warnings = normalize_headers([n for n, _ in flat], policy)
        select = ", ".join(
            f"{sql} AS {quote_ident(n)}" for (_, sql), n in zip(flat, final, strict=True)
        )
        rows = _copy(con, f"SELECT {select} FROM {source}", final, target, technical)
    if rows == 0:
        target.unlink(missing_ok=True)
        raise EmptyFileError("JSON document contains no records")
    return Landed(row_count=rows, column_count=len(final), warnings=header_warnings + warnings)


def land_json(
    path: Path, policy: DuplicateColumnPolicy, target: Path, technical: Technical
) -> Landed:
    with path.open("rb") as handle:
        if not handle.read(SAMPLE_BYTES).strip():
            raise EmptyFileError("file is empty")
    try:
        return _land_json_duckdb(path, policy, target, technical)
    except duckdb.Error as exc:
        if path.stat().st_size > JSON_FALLBACK_MAX_BYTES:
            raise CorruptedFileError(f"cannot read JSON file: {exc}") from exc
        log.info("json_duckdb_reader_declined", error=str(exc).splitlines()[0][:200])
    raw = read_json(path, policy)
    rows = land_table(raw.table, target, technical)
    return Landed(
        row_count=rows,
        column_count=raw.table.num_columns,
        encoding=raw.encoding,
        warnings=raw.warnings,
    )


def guard(lander: Lander, fmt: str) -> Lander:
    """Report unexpected reader failures as a corrupted file."""

    def landed(target: Path, technical: Technical) -> Landed:
        try:
            return lander(target, technical)
        except ForjaError:
            raise
        except Exception as exc:
            target.unlink(missing_ok=True)
            raise CorruptedFileError(f"cannot read {fmt} file: {exc}") from exc

    return landed
