"""Index of the words of the semantic layer, matched against a request locally.

Entries are labels, synonyms and names of metrics, dimensions, attributes and time
dimensions, plus the distinct values of filterable attributes (``Lyon``,
``professionnel``). Values stay in this process: they are used to recognize filters
and are never part of what is sent to a language model.

A value is recognized only when the request holds all of it, word for word (case,
accents and plurals aside): « musées » never reads as the value « Musée de l'affiche ».
A span that names a metric, a dimension or an attribute is that element, never a value,
and an exact match outranks a close one on the same words.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from forja_core.semantic.labels import HIERARCHY_SYNONYMS
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

    @property
    def is_value(self) -> bool:
        return self.ref.startswith("value:")


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
            for hierarchy in dim.hierarchies:
                # « par géographie »: the coarsest level of the hierarchy.
                if hierarchy.levels and dim.attribute(hierarchy.levels[0]) is not None:
                    add(
                        f"attribute:{dim.name}.{hierarchy.levels[0]}",
                        [hierarchy.label, *HIERARCHY_SYNONYMS.get(hierarchy.name, [])],
                    )
            for attribute in dim.attributes:
                if attribute.hidden:
                    continue
                add(
                    f"attribute:{dim.name}.{attribute.name}",
                    [attribute.label, attribute.name.replace("_", " "), *attribute.synonyms],
                )
        for ref, items in (values or {}).items():
            for value in items:
                # Every word of the value, stopwords included: « Musée de l'affiche »
                # needs « affiche » too.
                phrase = tuple(words(value))
                if any(w not in STOPWORDS and not w.isdigit() for w in phrase):
                    entries.append(Entry(f"value:{ref}={value}", phrase, value))
        return cls(entries)

    def match(self, question_words: list[str], *, skip: set[int] | None = None) -> list[Match]:
        """Longest non-overlapping matches; equal spans group their refs (ambiguity).

        On a span, an exact match outranks a close one, and an element of the model
        (metric, dimension, attribute, date) outranks a value."""
        skip = skip or set()
        content = [
            (i, w) for i, w in enumerate(question_words) if w not in STOPWORDS and i not in skip
        ]
        # span -> ref -> (text, exact)
        candidates: dict[tuple[int, int], dict[str, tuple[str, bool]]] = {}

        def found(span: tuple[int, int], entry: Entry, exact: bool) -> None:
            refs = candidates.setdefault(span, {})
            text, was_exact = refs.get(entry.ref, (entry.text, False))
            refs[entry.ref] = (text if was_exact else entry.text, was_exact or exact)

        for entry in self.entries:
            size = len(entry.phrase)
            if entry.is_value:
                # The whole value, contiguous, stopwords included.
                for k in range(len(question_words) - size + 1):
                    run = question_words[k : k + size]
                    if any(k + j in skip for j in range(size)):
                        continue
                    if all(_same(w, p) for w, p in zip(run, entry.phrase, strict=True)):
                        found((k, k + size - 1), entry, tuple(run) == entry.phrase)
                continue
            for k in range(len(content) - size + 1):
                window = content[k : k + size]
                if all(_same(w, p) for (_, w), p in zip(window, entry.phrase, strict=True)):
                    span = (window[0][0], window[-1][0])
                    # Contiguous in the question, stopwords aside (« chiffre d'affaires »).
                    if span[1] - span[0] > 2 * size:
                        continue
                    found(span, entry, tuple(w for _, w in window) == entry.phrase)
        taken: set[int] = set()
        matches: list[Match] = []

        def weight(span: tuple[int, int]) -> tuple[int, int, int, int]:
            # Longest first (meaningful words, then all words: « Musée de l'affiche »
            # outranks « musée »); on equal length, the element of the model first.
            size = len([i for i in range(span[0], span[1] + 1) if i < len(question_words)
                        and question_words[i] not in STOPWORDS])  # fmt: skip
            model = any(not r.startswith("value:") for r in candidates[span])
            return (-size, -(span[1] - span[0]), 0 if model else 1, span[0])

        for start, end in sorted(candidates, key=weight):
            positions = set(range(start, end + 1))
            if positions & taken:
                continue
            refs = candidates[(start, end)]
            if any(exact for _, exact in refs.values()):
                refs = {r: v for r, v in refs.items() if v[1]}
            if any(not r.startswith("value:") for r in refs):
                refs = {r: v for r, v in refs.items() if not r.startswith("value:")}
            taken |= positions
            texts = [text for text, _ in refs.values()]
            matches.append(Match(start, end, tuple(sorted(refs)), texts[0]))
        return sorted(matches, key=lambda m: m.start)


def question_words(question: str) -> list[str]:
    return words(question)
