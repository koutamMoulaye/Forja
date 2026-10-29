"""Schedules typed in plain French: « tous les jours à 6 h », « le lundi à 8h30 »...

A small deterministic grammar, no language model: the phrase is normalized (accents,
case), then matched against the usual ways of saying a frequency and a time. A cron
expression is accepted as is. Anything else is refused with examples.
"""

from __future__ import annotations

import re

from forja_core.errors import ForjaError
from forja_core.scheduling.cron import Cron, CronError
from forja_core.scheduling.models import ScheduleKind, ScheduleSpec
from forja_core.utils import strip_accents

_DAYS = {
    "lundi": 0,
    "mardi": 1,
    "mercredi": 2,
    "jeudi": 3,
    "vendredi": 4,
    "samedi": 5,
    "dimanche": 6,
}
_DAY_RE = r"(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?"
_EXAMPLES = (
    "tous les jours à 6 h",
    "toutes les heures",
    "du lundi au vendredi à 7h30",
    "chaque lundi à 8 h",
    "le 1er de chaque mois à 5 h",
    "toutes les 15 minutes",
    "0 6 * * *",
)


class SchedulePhraseError(ForjaError):
    code = "schedule_not_understood"


def _normalize(text: str) -> str:
    lowered = strip_accents(text).lower().replace("\u2019", "'")
    lowered = re.sub(r"[,;.!]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _time(text: str) -> tuple[int, int] | None:
    """Hour and minute said in the phrase: 6 h, 6h30, 06:30, 18 heures, midi, minuit."""
    if re.search(r"\bmidi\b", text):
        return 12, 0
    if re.search(r"\bminuit\b", text):
        return 0, 0
    match = re.search(
        r"\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?(?:\s*(?:min|minutes?))?\b"
        r"(?:\s*(du matin|du soir|de l'apres-midi))?",
        text,
    )
    if match is None:
        match = re.search(r"\ba (\d{1,2})(?:\s*(du matin|du soir|de l'apres-midi))\b", text)
        if match is None:
            return None
        hour, minute, period = int(match.group(1)), 0, match.group(2)
    else:
        hour, minute, period = int(match.group(1)), int(match.group(2) or 0), match.group(3)
    if period in ("du soir", "de l'apres-midi") and hour < 12:
        hour += 12
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise SchedulePhraseError(f"{hour} h {minute:02d} n'est pas une heure valide")
    return hour, minute


def _days(text: str) -> list[int]:
    span = re.search(rf"\bdu {_DAY_RE} au {_DAY_RE}\b", text)
    if span:
        first, last = _DAYS[span.group(1)], _DAYS[span.group(2)]
        if first <= last:
            return list(range(first, last + 1))
        return list(range(first, 7)) + list(range(0, last + 1))
    if re.search(r"\b(en semaine|jours? ouvr(e|a)s?|jours? de semaine)\b", text):
        return [0, 1, 2, 3, 4]
    if re.search(r"\b(le |les |chaque )?(week-?end|weekend|fin de semaine)s?\b", text):
        return [5, 6]
    return sorted({_DAYS[m.group(1)] for m in re.finditer(rf"\b{_DAY_RE}\b", text)})


def parse_phrase(text: str) -> ScheduleSpec:
    raw = text.strip()
    if not raw:
        raise SchedulePhraseError("décrivez quand charger, par exemple « tous les jours à 6 h »")
    if re.fullmatch(r"[\d*/,\-a-zA-Z]+(\s+[\d*/,\-a-zA-Z]+){4}", raw) and not re.search(
        r"[a-z]{4,}", raw.lower()
    ):
        try:
            return ScheduleSpec(kind=ScheduleKind.CRON, cron=Cron.parse(raw).expression)
        except CronError as exc:
            raise SchedulePhraseError(exc.message) from exc

    phrase = _normalize(raw)
    if re.search(r"\b(manuel(lement)?|a la demande|jamais|aucune?|desactive)\b", phrase):
        return ScheduleSpec(kind=ScheduleKind.MANUAL)

    every = re.search(r"\b(?:toutes les|chaque|tous les) (\d+) (minutes?|min|heures?|h)\b", phrase)
    if every:
        count, unit = int(every.group(1)), every.group(2)
        if unit.startswith("min"):
            if not 5 <= count <= 59 or 60 % count:
                raise SchedulePhraseError(
                    "toutes les N minutes : N divise 60 et vaut au moins 5 (5, 10, 15, 20, 30)"
                )
            return ScheduleSpec(kind=ScheduleKind.CRON, cron=f"*/{count} * * * *")
        if not 1 <= count <= 23:
            raise SchedulePhraseError("toutes les N heures : N va de 1 à 23")
        if count == 1:
            return ScheduleSpec(kind=ScheduleKind.HOURLY, minute=0)
        return ScheduleSpec(kind=ScheduleKind.CRON, cron=f"0 */{count} * * *")

    if re.search(r"\b(toutes les heures|chaque heure|horaire|par heure|toutes les h)\b", phrase):
        found = re.search(r"\b(?:a la minute|a :|a h)\s*(\d{1,2})\b", phrase) or re.search(
            r"\b(\d{1,2}) (?:minutes? )?apres l'heure\b", phrase
        )
        value = int(found.group(1)) if found else 0
        if not 0 <= value <= 59:
            raise SchedulePhraseError("la minute va de 0 à 59")
        return ScheduleSpec(kind=ScheduleKind.HOURLY, minute=value)

    at = _time(phrase)
    hour, minute = at if at is not None else (6, 0)

    monthly = re.search(
        r"\b(?:le )?(\d{1,2})(?:er|e|eme)? (?:de chaque mois|du mois|de tous les mois)\b"
        r"|\b(?:tous les mois|chaque mois|mensuel(?:lement)?)(?: le (\d{1,2})(?:er|e)?)?\b",
        phrase,
    )
    if monthly:
        day = int(monthly.group(1) or monthly.group(2) or 1)
        if not 1 <= day <= 28:
            raise SchedulePhraseError(
                "le jour du mois va de 1 à 28, pour que chaque mois ait un chargement"
            )
        return ScheduleSpec(kind=ScheduleKind.CRON, cron=f"{minute} {hour} {day} * *")

    days = _days(phrase)
    if days and len(days) < 7:
        return ScheduleSpec(kind=ScheduleKind.WEEKLY, weekdays=days, hour=hour, minute=minute)
    if re.search(r"\b(hebdomadaire|chaque semaine|toutes les semaines|par semaine)\b", phrase):
        return ScheduleSpec(kind=ScheduleKind.WEEKLY, weekdays=[0], hour=hour, minute=minute)
    if (
        days
        or at is not None
        or re.search(r"\b(tous les jours|chaque jour|quotidien(ne)?(ment)?|par jour)\b", phrase)
    ):
        return ScheduleSpec(kind=ScheduleKind.DAILY, hour=hour, minute=minute)
    raise SchedulePhraseError(
        f"« {raw} » n'est pas compris. Exemples : " + ", ".join(f"« {e} »" for e in _EXAMPLES),
        details={"examples": list(_EXAMPLES)},
    )
