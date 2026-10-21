from __future__ import annotations

import codecs

import pytest

from forja_core.errors import EncodingDetectionError, UnsupportedFormatError
from forja_core.ingestion.detection import decode_text, detect_delimiter, detect_format
from forja_core.models import SourceFormat


@pytest.mark.parametrize(
    ("filename", "head", "expected"),
    [
        ("data.csv", b"a;b", SourceFormat.CSV),
        ("data.TSV", b"a\tb", SourceFormat.CSV),
        ("book.xlsx", b"PK\x03\x04", SourceFormat.EXCEL),
        ("table.parquet", b"PAR1", SourceFormat.PARQUET),
        ("events.jsonl", b"{", SourceFormat.JSON),
        ("no_extension", b"PAR1", SourceFormat.PARQUET),
        ("no_extension", b"  [{", SourceFormat.JSON),
    ],
)
def test_detect_format(filename: str, head: bytes, expected: SourceFormat) -> None:
    assert detect_format(filename, head) is expected


@pytest.mark.parametrize("filename", ["legacy.xls", "image.png"])
def test_detect_format_rejects_unsupported(filename: str) -> None:
    with pytest.raises(UnsupportedFormatError):
        detect_format(filename, b"\x89PNG")


def test_decode_utf8() -> None:
    assert decode_text("prénom;ville\n".encode()) == ("prénom;ville\n", "utf-8")


def test_decode_utf8_bom() -> None:
    text, encoding = decode_text(codecs.BOM_UTF8 + "é".encode())
    assert (text, encoding) == ("é", "utf-8-sig")


def test_decode_utf16_bom() -> None:
    text, encoding = decode_text("a;b\n1;2\n".encode("utf-16"))
    assert text == "a;b\n1;2\n"
    assert encoding == "utf-16"


def test_decode_windows_1252() -> None:
    original = "nom;prénom;ville\nLefèvre;Chloé;Orléans\nGuérin;Raphaël;Besançon\n" * 5
    text, encoding = decode_text(original.encode("cp1252"))
    assert text == original
    assert encoding == "cp1252"


def test_decode_binary_raises() -> None:
    with pytest.raises(EncodingDetectionError):
        decode_text(bytes(range(256)))


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("a,b,c\n1,2,3\n4,5,6\n", ","),
        ("a;b;c\n1,5;2,5;3\n4,1;5,2;6\n", ";"),
        ("a\tb\n1\t2\n", "\t"),
        ("a|b|c\n1|2|3\n", "|"),
        ('name;comment\nA;"x; y"\nB;z\n', ";"),
    ],
)
def test_detect_delimiter(text: str, expected: str) -> None:
    assert detect_delimiter(text) == expected
