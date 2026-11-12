"""What a message to the agent is about, decided locally before any parsing.

- a request for data (« fréquentation par région en 2023 »): parsed into a data mart,
  or applied to the current one when it refines it;
- a question about the data (« ce cas parle de quoi ? », « quelles données as-tu ? »):
  answered here, deterministically, from the semantic layer and the sources;
- out of scope (« la météo à Paris »): declined politely, with what Forja can answer.

A mixed message is cut into clauses: the part about the data is answered, the rest is
declined in one sentence. An out-of-scope message never refines a data mart and never
blocks the version already prepared.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from forja_core.agent.vocabulary import Vocabulary
from forja_core.semantic.models import SemanticLayer
from forja_core.semantic.text import STOPWORDS, normalize, words

Intent = Literal["data", "about", "out_of_scope"]

# Phrases asking what the data is (normalized: lowercase, no accents nor apostrophes).
_ABOUT = (
    "parle de quoi", "de quoi parle", "ca parle de quoi", "quelles donnees", "quelle donnee",
    "quelles sont les donnees", "que contient", "qu est ce que tu as", "qu est ce qu il y a",
    "quelles mesures", "quels indicateurs", "quelles dimensions", "que peux tu", "que sais tu",
    "que puis je demander", "qu est ce que je peux", "c est quoi ce", "c est quoi les donnees",
    "presente les donnees", "presente moi", "decris les donnees", "de quoi s agit", "aide moi",
    "a quoi sert", "quelles colonnes", "quelles sources", "quel est ce projet", "ce cas",
    "ce jeu de donnees", "quelles questions",
)  # fmt: skip
_CLAUSE = re.compile(
    r"[?.!;\n]+|\s+(?:et|mais|puis)\s+(?=(?:la|le|les|l|quel|quelle|que|qu|c|ce)\b)"
)
# Verbs of an adjustment (« ajoute la marge », « retire la ville »): the clause works on
# the data mart, even when its object is a word the agent will ask about.
_ADJUST = frozenset(
    {"ajoute", "ajouter", "rajoute", "rajouter", "retire", "retirer", "enleve", "enlever",
     "supprime", "supprimer", "seulement", "uniquement", "remplace", "remplacer"}
)  # fmt: skip
# Everyday subjects no project data holds (unless its own vocabulary names them, which
# is checked first): a clause about them is out of scope even when it names a value.
_OFF_TOPIC = frozenset(
    {"meteo", "pluie", "neige", "temperature", "climat", "heure", "actualite", "news",
     "blague", "poeme", "horoscope", "recette", "traduire", "traduis", "traduction",
     "actuelle", "actuel", "previsions", "prevision"}
)  # fmt: skip
# Words that do not make a request in scope on their own.
_NEUTRAL = frozenset(
    {"bonjour", "salut", "merci", "stp", "svp", "please", "ok", "oui", "non", "hello"}
)


@dataclass
class Clause:
    text: str
    intent: Intent


@dataclass
class Reading:
    """How a message is read: its clauses, by intent."""

    clauses: list[Clause] = field(default_factory=list)

    def of(self, intent: Intent) -> list[Clause]:
        return [c for c in self.clauses if c.intent == intent]

    @property
    def data(self) -> str:
        return " et ".join(c.text for c in self.of("data")).strip()

    @property
    def declined(self) -> list[str]:
        return [_without_link(c.text) for c in self.of("out_of_scope")]


_LINK = re.compile(r"^(?:et|mais|puis|aussi|ensuite)\s+", re.IGNORECASE)


def _without_link(text: str) -> str:
    """« et donne-moi la météo » → « donne-moi la météo »: the clause as quoted back."""
    return _LINK.sub("", text.strip()).strip()


def _about(text: str) -> bool:
    plain = f" {normalize(text)} "
    return any(f" {phrase} " in plain for phrase in _ABOUT)


def _in_scope(
    text: str, vocabulary: Vocabulary, has_period: Callable[[str], bool], *, values: bool
) -> bool:
    """Whether the clause names something of the data: a metric, an axis, a date, a
    period. A value alone (« Paris ») when nothing else is left unexplained (« et à
    Paris ? »); with a language model (``values``) to read the rest, also when the other
    words are not about an everyday subject outside any data (« la météo actuelle à
    Paris » is never a request, with or without a model)."""
    tokens = words(text)
    matches = vocabulary.match(tokens)
    if any(not ref.startswith("value:") for match in matches for ref in match.refs):
        return True
    if has_period(text):
        return True
    covered = {i for match in matches for i in range(match.start, match.end + 1)}
    leftover = [
        t
        for i, t in enumerate(tokens)
        if i not in covered and t not in STOPWORDS and t not in _NEUTRAL and not t.isdigit()
    ]
    if not matches:
        return False
    if values:
        return not (set(leftover) & _OFF_TOPIC)
    return not leftover


def _meaningful(text: str) -> bool:
    return any(t not in STOPWORDS and t not in _NEUTRAL and not t.isdigit() for t in words(text))


def read_message(
    text: str,
    vocabulary: Vocabulary,
    *,
    has_period: Callable[[str], bool],
    known: Callable[[str], bool],
    values_in_scope: bool = False,
) -> Reading:
    """Cut a message into clauses and tell each one's intent.

    ``known``: whether a word is close to the vocabulary (a typo, an unknown synonym):
    such a clause stays a data request, the agent asks what the word means.
    """
    parts = [p.strip(" ,") for p in _CLAUSE.split(text) if p and p.strip(" ,")]
    reading = Reading()
    for part in parts or [text]:
        if not _meaningful(part):
            continue
        if _about(part) and not _names_metric(part, vocabulary):
            reading.clauses.append(Clause(part, "about"))
        elif (
            _in_scope(part, vocabulary, has_period, values=values_in_scope)
            or any(known(w) for w in _content(part))
            or bool(set(words(part)) & _ADJUST)
        ):
            reading.clauses.append(Clause(part, "data"))
        else:
            reading.clauses.append(Clause(part, "out_of_scope"))
    if not reading.clauses:
        reading.clauses.append(Clause(text, "data"))
    return reading


# Words of a follow-up: « et par mois ? », « ajoute les entrées payantes », « la même
# chose en 2022 », « seulement la Bretagne ».
_FOLLOW_UP_START = frozenset({"et", "puis", "mais", "plutot", "maintenant", "ensuite"})
_FOLLOW_UP = frozenset(
    {"aussi", "seulement", "uniquement", "egalement", "ajoute", "ajouter", "rajoute",
     "rajouter", "retire", "retirer", "enleve", "enlever", "supprime", "supprimer", "remplace",
     "remplacer", "plutot", "idem", "pareil", "meme", "cela", "celui", "celle", "ceux",
     "celles", "garde", "garder", "limite", "limiter", "affine", "precise"}
)  # fmt: skip


def is_new_question(text: str, *, metrics: int, framed: bool) -> bool:
    """Whether a message sent in a conversation is a new question rather than an
    adjustment of the current data mart: a complete sentence (a measure, and an axis, a
    period or a time grain) with no follow-up word (« et », « aussi », « seulement »,
    « ajoute », « retire », a pronoun). A new question inherits nothing: no filter, no
    period, no sort, no limit of the previous one.

    ``metrics``: measures the message names itself; ``framed``: whether it names an axis,
    a period or a time grain."""
    tokens = words(text)
    if not tokens or tokens[0] in _FOLLOW_UP_START:
        return False
    if set(tokens) & _FOLLOW_UP:
        return False
    return metrics > 0 and framed


def _content(text: str) -> list[str]:
    return [t for t in words(text) if t not in STOPWORDS and t not in _NEUTRAL and len(t) > 2]


def _names_metric(text: str, vocabulary: Vocabulary) -> bool:
    return any(m.of_kind("metric") for m in vocabulary.match(words(text)))


@dataclass(frozen=True)
class SourceSummary:
    name: str
    filename: str
    rows: int
    columns: int


def describe_data(
    layer: SemanticLayer,
    sources: Iterable[SourceSummary],
    *,
    project: str,
    description: str | None,
    ranges: Callable[[str], tuple[date, date] | None],
    examples: list[str],
) -> str:
    """What the project's data is about, written from the semantic layer and the
    sources only (names, labels, row counts and the years covered)."""
    lines: list[str] = []
    listed = list(sources)
    intro = f"Le projet « {project} »"
    if description:
        intro += f" ({description.rstrip('.')})"
    if listed:
        files = ", ".join(
            f"{s.filename} ({_count(s.rows)} lignes, {s.columns} colonnes)" for s in listed
        )
        noun = "la source" if len(listed) == 1 else "les sources"
        lines.append(f"{intro} repose sur {noun} {files}.")
    else:
        lines.append(f"{intro} n'a pas encore de source.")
    metrics = [m for m in layer.metrics if not m.hidden and not m.technical]
    if metrics:
        shown = ", ".join(
            m.label + (f" (en {m.unit})" if m.unit and m.unit not in ("lignes",) else "")
            for m in metrics[:8]
        )
        lines.append(f"On peut y mesurer : {shown}.")
    axes = [d for d in layer.dimensions if d.kind != "time" and not d.hidden]
    if axes:
        described = []
        for dim in axes[:4]:
            names = [
                _lower_first(a.label) for a in dim.attributes if not a.hidden and a.pii is None
            ]
            text = f"{dim.label} ({', '.join(names[:6])})" if names else dim.label
            for hierarchy in dim.hierarchies:
                levels = [
                    _lower_first(a.label)
                    for level in hierarchy.levels
                    if (a := dim.attribute(level)) is not None
                ]
                if len(levels) > 1:
                    text += f", {hierarchy.label.lower()} {' > '.join(levels)}"
            described.append(text)
        lines.append(f"Par : {' ; '.join(described)}.")
    times = []
    for dim in layer.time_dimensions():
        covered = ranges(dim.name)
        span = f" de {covered[0].year} à {covered[1].year}" if covered else ""
        main = ", date principale" if dim.primary else ""
        times.append(f"{dim.label}{span}{main}")
    if times:
        lines.append(f"Dans le temps : {' ; '.join(times)}.")
    if examples:
        lines.append("Par exemple : " + " · ".join(f"« {e} »" for e in examples[:3]) + ".")
    return " ".join(lines)


NARROW_SPACE = chr(0x202F)


def _count(value: int) -> str:
    return f"{value:,}".replace(",", NARROW_SPACE)


def _lower_first(text: str) -> str:
    """« Code INSEE commune » → « code INSEE commune »: acronyms keep their capitals."""
    return text[:1].lower() + text[1:] if text[1:2] != text[1:2].upper() else text


def declined_sentence(parts: list[str]) -> str:
    quoted = ", ".join(f"« {p} »" for p in parts)
    return f"Je laisse de côté {quoted} : hors du périmètre des données de ce projet."


def out_of_scope_reason(parts: list[str], layer: SemanticLayer) -> str:
    quoted = ", ".join(f"« {p} »" for p in parts) or "Cette demande"
    metrics = [m.label.lower() for m in layer.metrics if not m.hidden and not m.technical][:3]
    can = f" Je peux répondre sur {', '.join(metrics)}." if metrics else ""
    return f"{quoted} sort du périmètre des données de ce projet.{can}"


# Words of the model's own vocabulary that an analyst should never read in a refusal.
_JARGON = (
    "couche semantique", "semantic layer", "schema", "metrique", "dimension fournie",
    "fournie", "contexte fourni", "spec", "json", "selection", "preselection",
)  # fmt: skip


def plain_refusal(reason: str | None, layer: SemanticLayer) -> str:
    """A refusal written by the language model, kept only when it reads plainly; one
    mentioning the inner workings (« la couche sémantique fournie ») is rewritten."""
    if reason and not any(j in normalize(reason) for j in _JARGON):
        return reason
    return out_of_scope_reason([], layer)
