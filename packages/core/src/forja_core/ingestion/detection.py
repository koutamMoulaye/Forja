"""Detection of file format, text encoding and CSV delimiter."""

from __future__ import annotations

import codecs
import csv
import io
from collections import Counter
from pathlib import Path

from charset_normalizer import from_bytes

from forja_core.errors import EncodingDetectionError, UnsupportedFormatError
from forja_core.models import SourceFormat

CSV_DELIMITERS: tuple[str, ...] = (",", ";", "\t", "|")

_EXTENSIONS: dict[str, SourceFormat] = {
    ".csv": SourceFormat.CSV,
    ".tsv": SourceFormat.CSV,
    ".txt": SourceFormat.CSV,
    ".xlsx": SourceFormat.EXCEL,
    ".xlsm": SourceFormat.EXCEL,
    ".parquet": SourceFormat.PARQUET,
    ".pq": SourceFormat.PARQUET,
    ".json": SourceFormat.JSON,
    ".jsonl": SourceFormat.JSON,
    ".ndjson": SourceFormat.JSON,
}

_BOMS: tuple[tuple[bytes, str], ...] = (
    (codecs.BOM_UTF8, "utf-8-sig"),
    (codecs.BOM_UTF32_LE, "utf-32"),
    (codecs.BOM_UTF32_BE, "utf-32"),
    (codecs.BOM_UTF16_LE, "utf-16"),
    (codecs.BOM_UTF16_BE, "utf-16"),
)

_PREFERRED_ENCODINGS: tuple[str, ...] = ("cp1252", "iso8859_15", "latin_1")
_CHAOS_TOLERANCE = 0.01
_DETECTION_SAMPLE_BYTES = 1024 * 1024
_DELIMITER_SAMPLE_LINES = 50


def detect_format(filename: str, head: bytes) -> SourceFormat:
    """Detect the format from the extension, falling back on magic bytes."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".xls":
        raise UnsupportedFormatError(
            "legacy .xls workbooks are not supported, save the file as .xlsx",
            details={"filename": filename},
        )
    if suffix in _EXTENSIONS:
        return _EXTENSIONS[suffix]
    if head.startswith(b"PAR1"):
        return SourceFormat.PARQUET
    if head.startswith(b"PK\x03\x04"):
        return SourceFormat.EXCEL
    if head.lstrip()[:1] in (b"[", b"{"):
        return SourceFormat.JSON
    raise UnsupportedFormatError(
        f"unsupported file type '{suffix or filename}'",
        details={"filename": filename, "supported": sorted(_EXTENSIONS)},
    )


def decode_text(raw: bytes) -> tuple[str, str]:
    """Decode bytes into text and return ``(text, encoding)``.

    Order: byte order mark, strict UTF-8, then statistical detection.
    """
    for bom, encoding in _BOMS:
        if raw.startswith(bom):
            try:
                return raw.decode(encoding), encoding
            except UnicodeDecodeError as exc:
                raise EncodingDetectionError(
                    f"file declares {encoding} but cannot be decoded with it"
                ) from exc

    if b"\x00" in raw[:_DETECTION_SAMPLE_BYTES]:
        raise EncodingDetectionError(
            "file contains binary data or uses an unknown encoding",
        )

    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass

    encoding = _best_single_byte_encoding(raw[:_DETECTION_SAMPLE_BYTES])
    try:
        return raw.decode(encoding), encoding
    except (UnicodeDecodeError, LookupError) as exc:
        raise EncodingDetectionError(
            f"detected encoding '{encoding}' cannot decode the whole file"
        ) from exc


def _best_single_byte_encoding(sample: bytes) -> str:
    """Lowest-chaos candidate; ties go to the Western European code pages.

    Several code pages decode accented Latin text without any visible noise
    (cp1250 turns "è" into "č"), so among equally plausible candidates the ones
    used by spreadsheet exports in Western Europe win.
    """
    matches = list(from_bytes(sample))
    if not matches:
        raise EncodingDetectionError("unable to detect the file encoding")
    lowest = min(match.chaos for match in matches)
    plausible = [m.encoding for m in matches if m.chaos <= lowest + _CHAOS_TOLERANCE]
    for preferred in _PREFERRED_ENCODINGS:
        if preferred in plausible:
            return preferred
    return plausible[0]


def detect_delimiter(text: str) -> str:
    """Pick the delimiter producing the most consistent multi-column layout.

    Ranking key: header width equals the dominant width, share of rows with the
    dominant width, then number of columns.
    """
    sample = "\n".join(text.splitlines()[:_DELIMITER_SAMPLE_LINES])
    best_delimiter = ","
    best_key: tuple[bool, float, int] | None = None
    for delimiter in CSV_DELIMITERS:
        try:
            rows = [row for row in csv.reader(io.StringIO(sample), delimiter=delimiter) if row]
        except csv.Error:
            continue
        if not rows:
            continue
        widths = [len(row) for row in rows]
        dominant_width, occurrences = Counter(widths).most_common(1)[0]
        if dominant_width < 2:
            continue
        key = (widths[0] == dominant_width, occurrences / len(widths), dominant_width)
        if best_key is None or key > best_key:
            best_key = key
            best_delimiter = delimiter
    return best_delimiter
