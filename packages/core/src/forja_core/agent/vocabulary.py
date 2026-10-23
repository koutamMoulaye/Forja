"""Index of the words of the semantic layer, matched against a request locally.

Entries are labels, synonyms and names of metrics, dimensions, attributes and time
dimensions, plus the distinct values of filterable attributes (``Lyon``,
``professionnel``). Values stay in this process: they are used to recognize filters
and are never part of what is sent to a language model.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from forja_core.semantic.models import SemanticLayer
from forja_core.semantic.text import STOPWORDS, key, words

# Date attributes are reached through time grains (par mois, par trimestre); only these
# are offered as axes by name.
_DATE_ATTRIBUTES = {
    "nom_jour": ["jour de la semaine"],
    "est_week_end": ["week-end", "week end"],
}
_FUZZY_MIN_LENGTH = 5
_FUZZY_RATIO = 0.86


@dataclass(frozen=True)
class Entry:
    ref: str = field(
        metadata={"doc": "metric:x | dimension:d | attribute:d.a | time:t | value:d.a=v"}
    )
    phrase: tuple[str, ...]
    text: str


@dataclass(frozen=True)
class Match:
    start: int
    end: int = field(metadata={"doc": "Index of the last word, inclusive"})
    refs: tuple[str, ...]
    text: str

    def kinds(self) -> set[str]:
        return {r.partition(":")[0] for r in self.refs}

    def of_kind(self, kind: str) -> list[str]:
        return [r for r in self.refs if r.startswith(f"{kind}:")]


def _same(word: str, candidate: str) -> bool:
    if word == candidate:
        return True
    if min(len(word), len(candidate)) < _FUZZY_MIN_LENGTH:
        return False
    return SequenceMatcher(None, word, candidate).ratio() >= _FUZZY_RATIO


class Vocabulary:
    def __init__(self, entries: Iterable[Entry]) -> None:
        self.entries = [e for e in entries if e.phrase]

    @classmethod
    def build(cls, layer: SemanticLayer, values: dict[str, list[str]] | None = None) -> Vocabulary:
        """``values``: distinct values by attribute ref (dimension.attribute)."""
        entries: list[Entry] = []

        def add(ref: str, texts: Iterable[str]) -> None:
            for text in dict.fromkeys(t for t in texts if t):
                entries.append(Entry(ref, key(text), text))

        for metric in layer.metrics:
            if not metric.hidden:
                add(
                    f"metric:{metric.name}",
                    [metric.label, metric.name.replace("_", " "), *metric.synonyms],
                )
        for dim in layer.dimensions:
            if dim.hidden:
                continue
            if dim.kind == "time":
                add(
                    f"time:{dim.name}",
                    [dim.label, *[s for s in dim.synonyms if s not in ("date", "période")]],
                )
                for name, texts in _DATE_ATTRIBUTES.items():
                    if dim.attribute(name) is not None:
                        add(f"attribute:{dim.name}.{name}", texts)
                continue
            add(f"dimension:{dim.name}", [dim.label, dim.name.replace("_", " "), *dim.synonyms])
            for attribute in dim.attributes:
                if attribute.hidden:
                    continue
                add(
                    f"attribute:{dim.name}.{attribute.name}",
                    [attribute.label, attribute.name.replace("_", " "), *attribute.synonyms],
                )
        for ref, items in (values or {}).items():
            for value in items:
                phrase = key(value)
                if phrase and not all(w.isdigit() for w in phrase):
                    entries.append(Entry(f"value:{ref}={value}", phrase, value))
        return cls(entries)

    def match(self, question_words: list[str], *, skip: set[int] | None = None) -> list[Match]:
        """Longest non-overlapping matches; equal spans group their refs (ambiguity)."""
        skip = skip or set()
        content = [
            (i, w) for i, w in enumerate(question_words) if w not in STOPWORDS and i not in skip
        ]
        candidates: dict[tuple[int, int], dict[str, str]] = {}
        for entry in self.entries:
            size = len(entry.phrase)
            for k in range(len(content) - size + 1):
                window = content[k : k + size]
                if all(_same(w, p) for (_, w), p in zip(window, entry.phrase, strict=True)):
                    span = (window[0][0], window[-1][0])
                    # Contiguous in the question, stopwords aside (« chiffre d'affaires »).
                    if span[1] - span[0] > 2 * size:
                        continue
                    candidates.setdefault(span, {}).setdefault(entry.ref, entry.text)
        taken: set[int] = set()
        matches: list[Match] = []
        ordered = sorted(candidates.items(), key=lambda c: (-(c[0][1] - c[0][0]), c[0][0]))
        for (start, end), refs in ordered:
            positions = set(range(start, end + 1))
            if positions & taken:
                continue
            taken |= positions
            texts = list(refs.values())
            matches.append(Match(start, end, tuple(sorted(refs)), texts[0]))
        return sorted(matches, key=lambda m: m.start)


def question_words(question: str) -> list[str]:
    return words(question)
