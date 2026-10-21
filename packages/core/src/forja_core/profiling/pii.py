"""Heuristic detection of personal data (PII) in text columns.

Pattern-based detectors (email, phone, IBAN) score the share of matching values.
Name detectors combine a column-name hint, the shape of values and a small
dictionary of common first names. Confidence is in [0, 1].
"""

from __future__ import annotations

import re
from collections.abc import Callable

from forja_core.profiling.models import ConfidenceLevel, PiiDetection, PiiType
from forja_core.profiling.types import ValueCounts
from forja_core.utils import strip_accents

MIN_CONFIDENCE = 0.3
_HINT_BONUS = 0.1

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_PHONE_FR_RE = re.compile(r"(?:\+33|0033|0)[1-9]\d{8}")
_PHONE_INTL_RE = re.compile(r"(?:\+|00)[1-9]\d{7,14}")
_PHONE_STRIP_RE = re.compile(r"[\s.\-/()]")
_IBAN_RE = re.compile(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}")
_NAME_WORD = r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\u2019-]*"
_NAME_RE = re.compile(rf"{_NAME_WORD}(?: {_NAME_WORD}){{0,3}}")

COMMON_FIRST_NAMES = frozenset(
    {
        "adam",
        "alain",
        "alexandre",
        "alice",
        "anne",
        "antoine",
        "arthur",
        "camille",
        "catherine",
        "charles",
        "chloe",
        "christine",
        "claire",
        "david",
        "elise",
        "emma",
        "eric",
        "francois",
        "isabelle",
        "jacques",
        "jean",
        "jeanne",
        "julie",
        "julien",
        "laura",
        "lea",
        "louis",
        "louise",
        "lucas",
        "manon",
        "marie",
        "martin",
        "mathieu",
        "michel",
        "nathalie",
        "nicolas",
        "olivier",
        "paul",
        "philippe",
        "pierre",
        "sarah",
        "sophie",
        "thomas",
        "valerie",
        "vincent",
        "anna",
        "james",
        "john",
        "mary",
        "michael",
        "robert",
        "william",
        "elizabeth",
        "jennifer",
        "linda",
        "daniel",
        "emily",
        "jessica",
        "joseph",
        "richard",
        "susan",
        "hugo",
        "jade",
        "gabriel",
        "raphael",
        "leo",
        "ines",
        "sylvie",
        "patrick",
        "sandrine",
        "stephane",
        "marc",
    }
)

_EMAIL_HINTS = ("mail", "courriel")
_PHONE_HINTS = frozenset({"tel", "telephone", "phone", "mobile", "portable", "gsm", "fax"})
_IBAN_HINTS = ("iban", "rib")
_FIRST_NAME_HINTS = ("prenom", "firstname", "givenname", "forename")
_LAST_NAME_HINTS = ("lastname", "surname", "familyname", "nomdefamille", "nomfamille")
_FULL_NAME_COMPACT = frozenset(
    {
        "name",
        "fullname",
        "nomcomplet",
        "nomprenom",
        "prenomnom",
        "customername",
        "clientname",
        "contactname",
        "nomclient",
    }
)
_NON_PERSON_TOKENS = frozenset(
    {
        "produit",
        "product",
        "fichier",
        "file",
        "ville",
        "city",
        "societe",
        "company",
        "entreprise",
        "article",
        "rue",
        "street",
        "pays",
        "country",
        "categorie",
        "category",
        "magasin",
        "store",
        "marque",
        "brand",
        "projet",
        "project",
        "table",
        "colonne",
        "column",
        "domaine",
        "domain",
        "host",
        "service",
        "site",
        "app",
        "user",
        "username",
    }
)


def _column_tokens(name: str) -> tuple[str, set[str]]:
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", strip_accents(name))
    lowered = spaced.lower()
    tokens = {t for t in re.split(r"[^a-z0-9]+", lowered) if t}
    return re.sub(r"[^a-z0-9]", "", lowered), tokens


def _ratio(values: ValueCounts, predicate: Callable[[str], bool]) -> float:
    total = sum(count for _, count in values)
    if total == 0:
        return 0.0
    return sum(count for value, count in values if predicate(value)) / total


def _is_email(value: str) -> bool:
    return _EMAIL_RE.fullmatch(value) is not None


def _is_phone(value: str) -> bool:
    compact = _PHONE_STRIP_RE.sub("", value)
    return bool(_PHONE_FR_RE.fullmatch(compact) or _PHONE_INTL_RE.fullmatch(compact))


def is_valid_iban(value: str) -> bool:
    compact = value.replace(" ", "").upper()
    if _IBAN_RE.fullmatch(compact) is None:
        return False
    rearranged = compact[4:] + compact[:4]
    numeric = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(numeric) % 97 == 1


def _is_name_shaped(value: str) -> bool:
    return _NAME_RE.fullmatch(value) is not None and value[:1].isupper() and len(value) <= 60


def _first_word_is_known_first_name(value: str) -> bool:
    words = strip_accents(value).lower().replace("-", " ").split()
    return bool(words) and words[0] in COMMON_FIRST_NAMES


def _detection(
    column: str,
    pii_type: PiiType,
    confidence: float,
    match_ratio: float,
    name_hint: bool,
    method: str,
) -> PiiDetection:
    confidence = round(min(1.0, max(0.0, confidence)), 3)
    return PiiDetection(
        column=column,
        pii_type=pii_type,
        confidence=confidence,
        level=ConfidenceLevel.from_score(confidence),
        match_ratio=round(match_ratio, 4),
        name_hint=name_hint,
        method=method,
    )


def _pattern_detection(
    column: str,
    pii_type: PiiType,
    ratio: float,
    hint: bool,
    method: str,
) -> PiiDetection | None:
    confidence = ratio + (_HINT_BONUS if hint and ratio > 0 else 0.0)
    if confidence < MIN_CONFIDENCE:
        return None
    return _detection(column, pii_type, confidence, ratio, hint, method)


def _name_detections(
    column: str, compact: str, tokens: set[str], values: ValueCounts
) -> list[PiiDetection]:
    if tokens & _NON_PERSON_TOKENS:
        return []
    shape_ratio = _ratio(values, _is_name_shaped)
    dictionary_ratio = _ratio(values, _first_word_is_known_first_name)
    first_hint = any(h in compact for h in _FIRST_NAME_HINTS)
    last_hint = not first_hint and (any(h in compact for h in _LAST_NAME_HINTS) or "nom" in tokens)
    full_hint = not (first_hint or last_hint) and compact in _FULL_NAME_COMPACT
    multi_word_ratio = _ratio(values, lambda v: _is_name_shaped(v) and " " in v.strip())

    detections: list[PiiDetection] = []
    hinted_type = (
        PiiType.FIRST_NAME
        if first_hint
        else PiiType.LAST_NAME
        if last_hint
        else PiiType.FULL_NAME
        if full_hint
        else None
    )
    if hinted_type is not None and shape_ratio >= 0.5:
        confidence = 0.85 if shape_ratio >= 0.8 else 0.6
        if hinted_type is not PiiType.LAST_NAME and dictionary_ratio >= 0.2:
            confidence += _HINT_BONUS
        detections.append(
            _detection(
                column, hinted_type, confidence, shape_ratio, True, "column name + value shape"
            )
        )
    elif hinted_type is None and shape_ratio >= 0.8 and dictionary_ratio >= 0.3:
        pii_type = PiiType.FULL_NAME if multi_word_ratio >= 0.5 else PiiType.FIRST_NAME
        detections.append(
            _detection(
                column,
                pii_type,
                0.4 + 0.4 * dictionary_ratio,
                dictionary_ratio,
                False,
                "first-name dictionary + value shape",
            )
        )
    return detections


def detect_pii(column: str, values: ValueCounts) -> PiiDetection | None:
    """Return the most likely PII detection for a text column, if any."""
    if not values:
        return None
    compact, tokens = _column_tokens(column)
    email_hint = any(h in compact for h in _EMAIL_HINTS)
    phone_hint = bool(tokens & _PHONE_HINTS) or "telephone" in compact or "phone" in compact
    iban_hint = any(h in compact for h in _IBAN_HINTS)

    detections = [
        _pattern_detection(
            column, PiiType.EMAIL, _ratio(values, _is_email), email_hint, "email pattern"
        ),
        _pattern_detection(
            column,
            PiiType.PHONE,
            _ratio(values, _is_phone),
            phone_hint,
            "phone number pattern (FR / E.164)",
        ),
        _pattern_detection(
            column,
            PiiType.IBAN,
            _ratio(values, is_valid_iban),
            iban_hint,
            "IBAN pattern + mod-97 checksum",
        ),
        *_name_detections(column, compact, tokens, values),
    ]
    found = [d for d in detections if d is not None]
    if not found:
        return None
    return max(found, key=lambda d: d.confidence)
