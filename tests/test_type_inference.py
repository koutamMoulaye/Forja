from __future__ import annotations

import pytest

from forja_core.profiling.models import ConfidenceLevel, InferredType, PiiType
from forja_core.profiling.pii import detect_pii, is_valid_iban
from forja_core.profiling.types import (
    detect_decimal_separator,
    infer_text_type,
    parse_number,
)
from tests.fixtures.generate import fr_iban


def _counts(*values: str) -> list[tuple[str, int]]:
    return [(v, 1) for v in values]


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        (("1", "2", "-3", "40"), InferredType.INTEGER),
        (("12,5", "1 234,56", "0,99", "980"), InferredType.DECIMAL),
        (("155 781 758", "155 781 759", "1 024"), InferredType.INTEGER),
        (("12.5", "1,234.56", "0.99"), InferredType.DECIMAL),
        (("oui", "non", "OUI"), InferredType.BOOLEAN),
        (("15/01/2023", "31/12/2022", "01/02/2024"), InferredType.DATE),
        (("2024-01-15", "2023-12-31"), InferredType.DATE),
        (("2024-01-15 10:00:00", "2023-12-31 23:59:59"), InferredType.DATETIME),
        (("2024-01-15T10:00:00+02:00", "2024-01-16T08:00:00Z"), InferredType.DATETIME),
        (("01000", "75001", "06000"), InferredType.STRING),
        (("+33612345678", "+33712345678"), InferredType.STRING),
        (("Paris", "Lyon"), InferredType.STRING),
    ],
)
def test_infer_text_type(values: tuple[str, ...], expected: InferredType) -> None:
    assert infer_text_type(_counts(*values)).inferred_type is expected


def test_inference_is_weighted_by_counts() -> None:
    values = [("12,5", 96), ("N/A", 4)]
    result = infer_text_type(values)
    assert result.inferred_type is InferredType.DECIMAL
    assert result.match_ratio == pytest.approx(0.96)


def test_near_type_is_reported() -> None:
    values = [("15/01/2023", 7), ("unknown", 3)]
    result = infer_text_type(values)
    assert result.inferred_type is InferredType.STRING
    assert result.near_type is InferredType.DATE
    assert result.near_type_ratio == pytest.approx(0.7)


def test_ambiguous_dates_prefer_day_first() -> None:
    result = infer_text_type(_counts("01/02/2024", "03/04/2024"))
    assert result.format == "%d/%m/%Y"
    assert infer_text_type(_counts("12/31/2024", "01/15/2024")).format == "%m/%d/%Y"


def test_empty_values() -> None:
    assert infer_text_type([]).inferred_type is InferredType.EMPTY


@pytest.mark.parametrize(
    ("values", "separator"),
    [
        (("12,5", "3,75"), ","),
        (("1.234,56",), ","),
        (("12.5", "3.75"), "."),
        (("1,234.56",), "."),
    ],
)
def test_decimal_separator(values: tuple[str, ...], separator: str) -> None:
    assert detect_decimal_separator(_counts(*values)) == separator


def test_parse_number() -> None:
    assert parse_number("1 234,56", ",") == pytest.approx(1234.56)
    assert parse_number("1.234,5", ",") == pytest.approx(1234.5)
    assert parse_number("1,234.5", ".") == pytest.approx(1234.5)
    assert parse_number("abc", ",") is None


def test_iban_checksum() -> None:
    iban = fr_iban(30006, 10000, 12345678900, 10)
    assert is_valid_iban(iban)
    broken = iban[:-1] + ("0" if iban[-1] != "0" else "1")
    assert not is_valid_iban(broken)


def test_pii_email_without_hint() -> None:
    detection = detect_pii("contact", _counts("a@b.fr", "x.y@example.com", "z@w.org"))
    assert detection is not None
    assert detection.pii_type is PiiType.EMAIL
    assert detection.level is ConfidenceLevel.HIGH
    assert detection.name_hint is False


def test_pii_first_names_by_dictionary() -> None:
    detection = detect_pii("col_7", _counts("Marie", "Jean", "Sophie", "Paul", "Zelda"))
    assert detection is not None
    assert detection.pii_type is PiiType.FIRST_NAME
    assert detection.level is ConfidenceLevel.MEDIUM


def test_pii_ignores_non_person_names() -> None:
    assert detect_pii("nom_produit", _counts("Marteau", "Tournevis", "Scie")) is None
    assert detect_pii("ville", _counts("Paris", "Lyon")) is None


def test_pii_phone_formats() -> None:
    detection = detect_pii(
        "tel", _counts("06 12 34 56 78", "+33 6 12 34 56 78", "01.23.45.67.89", "+4915112345678")
    )
    assert detection is not None
    assert detection.pii_type is PiiType.PHONE
    assert detection.match_ratio == 1.0
