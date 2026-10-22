from __future__ import annotations

import sys
from pathlib import Path

import pyarrow as pa
import pytest

from forja_core.privacy import ProjectSecrets, TreatedColumn, mask, pseudonymize, treat_batch
from forja_core.profiling.models import PiiType
from forja_core.silver.plan import PiiTreatment


def test_salt_is_created_once_per_project(tmp_path: Path) -> None:
    secrets = ProjectSecrets(tmp_path / "secrets")
    first = secrets.salt("p1")
    assert len(first) == 32
    assert secrets.salt("p1") == first
    assert ProjectSecrets(tmp_path / "secrets").salt("p1") == first
    assert secrets.salt("p2") != first
    if sys.platform != "win32":
        mode = (tmp_path / "secrets" / "p1.salt").stat().st_mode & 0o777
        assert mode == 0o600


def test_salt_rejects_path_traversal(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        ProjectSecrets(tmp_path).salt("../escape")


def test_pseudonymize_is_keyed_and_deterministic() -> None:
    salt_a, salt_b = b"a" * 32, b"b" * 32
    value = "jean.dupont@example.fr"
    assert pseudonymize(value, salt_a) == pseudonymize(value, salt_a)
    assert pseudonymize(value, salt_a) != pseudonymize(value, salt_b)
    assert len(pseudonymize(value, salt_a) or "") == 64
    assert value not in (pseudonymize(value, salt_a) or "")
    assert pseudonymize(None, salt_a) is None


@pytest.mark.parametrize(
    ("value", "pii_type", "expected"),
    [
        ("jean.dupont@example.fr", PiiType.EMAIL, "j***@example.fr"),
        ("06 12 34 56 78", PiiType.PHONE, "** ** ** ** 78"),
        ("+33 6 12 34 56 78", PiiType.PHONE, "+** * ** ** ** 78"),
        ("FR76 3000 6000 0112 3456 7890 189", PiiType.IBAN, "FR76********************189"),
        ("Jean", PiiType.FIRST_NAME, "J***"),
        ("Jean Dupont", PiiType.FULL_NAME, "J*** D***"),
        ("secret", None, "s***"),
    ],
)
def test_mask(value: str, pii_type: PiiType | None, expected: str) -> None:
    assert mask(value, pii_type) == expected


def test_treat_batch() -> None:
    columns = [
        TreatedColumn("id"),
        TreatedColumn("email", PiiTreatment.HASH, PiiType.EMAIL),
        TreatedColumn("tel", PiiTreatment.MASK, PiiType.PHONE),
    ]
    batch = pa.RecordBatch.from_arrays(
        [
            pa.array([1, 2]),
            pa.array(["a@b.fr", None]),
            pa.array(["0612345678", "0712345678"]),
        ],
        names=["id", "email", "tel"],
    )
    treated = treat_batch(batch, columns, b"s" * 32).to_pylist()
    assert treated[0]["id"] == 1
    assert treated[0]["email"] == pseudonymize("a@b.fr", b"s" * 32)
    assert treated[1]["email"] is None
    assert treated[1]["tel"] == "********78"
