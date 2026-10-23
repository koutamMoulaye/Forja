"""Deterministic understanding of simple requests, without a language model.

« CA par mois », « nombre de commandes par ville en 2024 », « top 5 des produits par
chiffre d'affaires au T1 2024 », « panier moyen des clients professionnels » are
parsed by keywords. The parser is *confident* only when every meaningful word of
the request is accounted for; otherwise the language model is asked (or, without
one, the unknown word is turned into a question back to the user).
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from forja_core.agent.spec import (
    AgentAnswer,
    Clarification,
    ClarificationOption,
    FilterOperator,
    MartFilter,
    MartSpec,
    OrderBy,
    Period,
)
from forja_core.agent.vocabulary import Match, Vocabulary
from forja_core.semantic.models import SemanticLayer, TimeGrain
from forja_core.semantic.text import STOPWORDS, key, words

AXIS_MARKERS = frozenset(
    {"par", "selon", "chaque", "fonction", "repartition", "reparti", "ventile", "ventilation",
     "decoupe", "detail", "detaille", "groupe"}
)  # fmt: skip
NEGATIONS = frozenset({"hors", "sauf", "excepte", "exclu", "exclure", "pas", "non", "autre"})
ADD_WORDS = frozenset({"ajoute", "ajouter", "rajoute", "rajouter", "inclu", "inclure", "aussi"})
REMOVE_WORDS = frozenset(
    {"retire", "retirer", "enleve", "enlever", "supprime", "supprimer", "sans", "oublie"}
)
RESTRICT_WORDS = frozenset({"seulement", "uniquement", "que", "juste", "limite"})
FILLERS = frozenset(
    {"evolution", "total", "totaux", "global", "globale", "ensemble", "analyse", "tableau",
     "mart", "data", "donnee", "rapport", "vue", "cumul", "cumule", "montant", "valeur",
     "niveau", "periode", "realise", "obtenu", "genere", "fait", "vendu", "vente", "et",
     "puis", "ainsi", "egalement", "classement", "classe", "trie", "tri", "ordre",
     "decroissant", "croissant", "meilleur", "premier", "plus", "moins", "gros", "grand",
     "petit", "pire", "dernier", "principal", "top", "affiche", "detail", "avec", "an",
     "annee", "mois", "trimestre", "semaine", "jour", "comparaison", "compare", "chiffre"}
)  # fmt: skip

GRAIN_WORDS: dict[str, TimeGrain] = {
    "jour": TimeGrain.DAY, "journalier": TimeGrain.DAY, "quotidien": TimeGrain.DAY,
    "semaine": TimeGrain.WEEK, "hebdomadaire": TimeGrain.WEEK,
    "moi": TimeGrain.MONTH, "mois": TimeGrain.MONTH, "mensuel": TimeGrain.MONTH,
    "mensuelle": TimeGrain.MONTH,
    "trimestre": TimeGrain.QUARTER, "trimestriel": TimeGrain.QUARTER,
    "trimestrielle": TimeGrain.QUARTER,
    "annee": TimeGrain.YEAR, "anne": TimeGrain.YEAR, "an": TimeGrain.YEAR,
    "annuel": TimeGrain.YEAR, "annuelle": TimeGrain.YEAR, "exercice": TimeGrain.YEAR,
}  # fmt: skip
_ALWAYS_GRAIN = frozenset({"mensuel", "mensuelle", "trimestriel", "trimestrielle", "annuel",
                           "annuelle", "hebdomadaire", "quotidien", "journalier"})  # fmt: skip

MONTHS = {
    "janvier": 1, "fevrier": 2, "mar": 3, "mars": 3, "avril": 4, "avri": 4, "mai": 5,
    "juin": 6, "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "decembre": 12,
}  # fmt: skip
_ORDINALS = {
    "premier": 1, "1er": 1, "1e": 1, "deuxieme": 2, "second": 2, "seconde": 2, "2e": 2,
    "2eme": 2, "troisieme": 3, "3e": 3, "3eme": 3, "quatrieme": 4, "4e": 4, "4eme": 4,
}  # fmt: skip
_YEAR = re.compile(r"^(19|20)\d{2}$")
_QUARTER = re.compile(r"^t([1-4])$")
_SEMESTER = re.compile(r"^s([12])$")


@dataclass
class ParseOutcome:
    answer: AgentAnswer | None
    confident: bool
    unknown: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class _State:
    words: list[str]
    used: set[int] = field(default_factory=set)

    def use(self, *indexes: int) -> None:
        self.used.update(indexes)

    def free(self, i: int) -> bool:
        return 0 <= i < len(self.words) and i not in self.used


def _last_day(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def _quarter(year: int, quarter: int) -> Period:
    first = 3 * (quarter - 1) + 1
    return Period(
        start=date(year, first, 1), end=_last_day(year, first + 2), label=f"T{quarter} {year}"
    )


def _year_near(state: _State, i: int, default_year: int) -> tuple[int, int | None]:
    for j in (i + 1, i + 2):
        if state.free(j) and _YEAR.match(state.words[j]):
            return int(state.words[j]), j
    return default_year, None


def parse_period(state: _State, today: date, default_year: int) -> Period | None:
    w = state.words
    for i, word in enumerate(w):
        if not state.free(i):
            continue
        # « T1 2024 », « 1er trimestre 2024 », « S2 2024 », « second semestre »
        quarter = _QUARTER.match(word)
        ordinal = _ORDINALS.get(word)
        if quarter or (ordinal and i + 1 < len(w) and w[i + 1] == "trimestre"):
            number = int(quarter.group(1)) if quarter else ordinal or 1
            end = i if quarter else i + 1
            year, at = _year_near(state, end, default_year)
            state.use(i, end, *([at] if at is not None else []))
            return _quarter(year, number)
        semester = _SEMESTER.match(word)
        if semester or (ordinal in (1, 2) and i + 1 < len(w) and w[i + 1] == "semestre"):
            number = int(semester.group(1)) if semester else ordinal or 1
            end = i if semester else i + 1
            year, at = _year_near(state, end, default_year)
            state.use(i, end, *([at] if at is not None else []))
            first = 1 if number == 1 else 7
            return Period(
                start=date(year, first, 1),
                end=_last_day(year, first + 5),
                label=f"S{number} {year}",
            )
        # « de janvier à mars 2024 », « entre février et avril »
        if (
            word in MONTHS
            and i + 2 < len(w)
            and w[i + 1] in ("a", "au", "et")
            and (w[i + 2] in MONTHS)
        ):
            year, at = _year_near(state, i + 2, default_year)
            state.use(i, i + 1, i + 2, *([at] if at is not None else []))
            if i > 0 and w[i - 1] in ("de", "entre", "du"):
                state.use(i - 1)
            first, last = MONTHS[word], MONTHS[w[i + 2]]
            return Period(
                start=date(year, first, 1),
                end=_last_day(year, last),
                label=f"{word} à {w[i + 2]} {year}",
            )
        if (word in MONTHS and word not in ("mar", "mai")) or (
            word == "mai" and i + 1 < len(w) and _YEAR.match(w[i + 1])
        ):
            year, at = _year_near(state, i, default_year)
            state.use(i, *([at] if at is not None else []))
            month = MONTHS[word]
            return Period(
                start=date(year, month, 1), end=_last_day(year, month), label=f"{word} {year}"
            )
    for i, word in enumerate(w):
        if state.free(i) and _YEAR.match(word):
            year = int(word)
            state.use(i)
            return Period(start=date(year, 1, 1), end=date(year, 12, 31), label=str(year))
    text = " ".join(w)
    relative = {
        "cette anne": (today.year, False),
        "anne en cour": (today.year, False),
        "anne derniere": (today.year - 1, True),
        "anne precedente": (today.year - 1, True),
        "anne passe": (today.year - 1, True),
    }
    for phrase, (year, _) in relative.items():
        if phrase in text:
            for i, word in enumerate(w):
                if word in phrase.split():
                    state.use(i)
            return Period(start=date(year, 1, 1), end=date(year, 12, 31), label=str(year))
    if "depuis" in w and "debut" in w and ("anne" in w or "annee" in w):
        for i, word in enumerate(w):
            if word in ("depuis", "debut", "anne", "annee"):
                state.use(i)
        return Period(
            start=date(today.year, 1, 1), end=today, label=f"depuis le 1er janvier {today.year}"
        )
    return None


def parse_limit(state: _State) -> tuple[int | None, Literal["asc", "desc"]]:
    w = state.words
    for i, word in enumerate(w):
        if not state.free(i):
            continue
        if word == "top" and i + 1 < len(w) and w[i + 1].isdigit():
            state.use(i, i + 1)
            return int(w[i + 1]), "desc"
        if word.isdigit() and not _YEAR.match(word) and 0 < int(word) <= 1000:
            nxt = w[i + 1] if i + 1 < len(w) else ""
            prev = w[i - 1] if i > 0 else ""
            if nxt in ("meilleur", "premier", "plus", "principal", "gros", "grand") or prev in (
                "les",
                "top",
            ):
                state.use(i)
                if nxt in ("meilleur", "premier", "principal", "gros", "grand"):
                    state.use(i + 1)
                return int(word), "desc"
            if nxt in ("pire", "dernier", "moins", "petit"):
                state.use(i, i + 1)
                return int(word), "asc"
    return None, "desc"


def _surface(match: Match) -> str:
    return match.text


def _label(layer: SemanticLayer, ref: str) -> str:
    kind, _, name = ref.partition(":")
    if kind == "metric":
        metric = layer.metric(name)
        return metric.label if metric else name
    if kind in ("attribute", "value"):
        attribute_ref, _, value = name.partition("=")
        found = layer.attribute(attribute_ref)
        if found is None:
            return name
        dim, attribute = found
        text = f"{attribute.label} ({dim.label.lower()})"
        return f"{text} = {value}" if value else text
    if kind in ("dimension", "time"):
        named = layer.dimension(name)
        return named.label if named else name
    return name


def clarification(
    layer: SemanticLayer, term: str, refs: list[str], question: str | None = None
) -> Clarification | None:
    options = [ClarificationOption(label=_label(layer, r), ref=r) for r in dict.fromkeys(refs)]
    if len(options) < 2:
        return None
    return Clarification(
        question=question or f"Que voulez-vous dire par « {term} » ?",
        term=term,
        options=options[:4],
    )


def _value_prefix(layer_values: dict[str, list[str]], attribute_ref: str, word: str) -> str | None:
    """« segment pro » → professionnel: a unique value of that attribute starting with it."""
    if len(word) < 3:
        return None
    candidates = [
        v for v in layer_values.get(attribute_ref, []) if key(v)[:1] and key(v)[0].startswith(word)
    ]
    return candidates[0] if len(candidates) == 1 else None


def _default_name(spec: MartSpec, period: Period | None) -> str:
    parts = [spec.metrics[0]]
    if spec.time_grain:
        parts.append(f"par_{spec.time_grain.value}")
    for axis in spec.axes[:2]:
        parts.append(f"par_{axis.split('.')[-1]}")
    if period and period.label:
        parts.append(period.label)
    return "_".join(parts)


def parse(
    question: str,
    layer: SemanticLayer,
    vocabulary: Vocabulary,
    *,
    values: dict[str, list[str]],
    bindings: dict[str, str],
    today: date,
    default_year: int,
) -> ParseOutcome:
    state = _State(words(question))
    period = parse_period(state, today, default_year)
    limit, direction = parse_limit(state)

    # Time grains: « par mois », « mensuel », « évolution trimestrielle ».
    grain: TimeGrain | None = None
    for i, word in enumerate(state.words):
        if not state.free(i) or word not in GRAIN_WORDS:
            continue
        previous = state.words[i - 1] if i > 0 else ""
        if word in _ALWAYS_GRAIN or previous in AXIS_MARKERS or previous in ("et", "chaque"):
            grain = GRAIN_WORDS[word]
            state.use(i)
            if previous in AXIS_MARKERS:
                state.use(i - 1)

    if grain is None and "evolution" in state.words and layer.time_dimensions():
        grain = TimeGrain.MONTH  # « évolution du CA »: month by month

    matches = vocabulary.match(state.words, skip=set(state.used))
    resolved: list[Match] = []
    for match in matches:
        term = " ".join(key(match.text))
        bound = bindings.get(term) or bindings.get(
            " ".join(state.words[match.start : match.end + 1])
        )
        if bound == "ignore":
            state.use(*range(match.start, match.end + 1))
            continue
        resolved.append(Match(match.start, match.end, (bound,), match.text) if bound else match)
    for term, ref in bindings.items():
        # A word the parser did not know, defined by the user's answer.
        phrase = term.split()
        for i in range(len(state.words) - len(phrase) + 1):
            if state.words[i : i + len(phrase)] == phrase and all(
                not (m.start <= j <= m.end) for m in resolved for j in range(i, i + len(phrase))
            ):
                if ref == "ignore":
                    state.use(*range(i, i + len(phrase)))
                else:
                    resolved.append(Match(i, i + len(phrase) - 1, (ref,), term))
    resolved.sort(key=lambda m: m.start)

    metrics: list[str] = []
    axes: list[str] = []
    filters: dict[str, MartFilter] = {}
    order_by: list[OrderBy] = []
    time_dimension: str | None = None
    matched: list[str] = []
    seen: list[Match] = []

    for index, match in enumerate(resolved):
        span = range(match.start, match.end + 1)
        # 1. Metrics, ambiguous ones become a question.
        metric_refs = match.of_kind("metric")
        named_dims = {
            r.partition(":")[2].split(".")[0]
            for r in match.refs
            if r.startswith(("dimension:", "attribute:"))
        }
        following = resolved[index + 1] if index + 1 < len(resolved) else None
        if (
            metric_refs
            and named_dims
            and following is not None
            and following.start - match.end <= 2
            and named_dims & {r.partition(":")[2].split(".")[0] for r in following.of_kind("value")}
        ):
            # « commandes livrées »: the orders as a filter, not the number of orders.
            state.use(*span)
            seen.append(match)
            continue
        if metric_refs:
            # A word naming a metric and an attribute (« prix »: average selling price, or
            # catalogue price?) or several metrics (« ventes ») is a question.
            alternatives = metric_refs + match.of_kind("attribute")
            if len(alternatives) > 1:
                ask = clarification(layer, _surface(match), alternatives)
                if ask is not None:
                    return ParseOutcome(AgentAnswer(kind="clarification", clarification=ask), True)
            name = metric_refs[0].partition(":")[2]
            if name not in metrics:
                metrics.append(name)
            before = state.words[match.start - 1] if match.start > 0 else ""
            if limit is not None and before == "par" and not order_by:
                order_by.append(OrderBy(field=name, direction=direction))
                state.use(match.start - 1)
            state.use(*span)
            matched += metric_refs
            seen.append(match)
            continue
        # 2. Values: filters (« à Lyon », « livrées », « hors Paris »).
        value_refs = match.of_kind("value")
        if value_refs:
            attributes = {r.partition(":")[2].partition("=")[0] for r in value_refs}
            if len(attributes) > 1:
                # Same word in two attributes: the attribute named next to it decides.
                near = {
                    r.partition(":")[2]
                    for m in resolved[max(0, index - 2) : index + 3]
                    for r in m.refs
                    if r.startswith("attribute:")
                }
                attributes = attributes & near or attributes
                if len(attributes) > 1:
                    ask = clarification(layer, _surface(match), value_refs)
                    if ask is not None:
                        return ParseOutcome(
                            AgentAnswer(kind="clarification", clarification=ask), True
                        )
            attribute_ref = sorted(attributes)[0]
            value = next(
                r.partition("=")[2]
                for r in value_refs
                if r.partition(":")[2].startswith(attribute_ref + "=")
            )
            negated = any(
                state.words[j] in NEGATIONS for j in range(max(0, match.start - 2), match.start)
            )
            for j in range(max(0, match.start - 2), match.start):
                if state.words[j] in NEGATIONS:
                    state.use(j)
            existing = filters.get(attribute_ref)
            if existing is None:
                filters[attribute_ref] = MartFilter(
                    field=attribute_ref,
                    operator=FilterOperator.NEQ if negated else FilterOperator.EQ,
                    value=value,
                )
            else:
                previous_values = (
                    existing.value if isinstance(existing.value, list) else [existing.value]
                )
                filters[attribute_ref] = MartFilter(
                    field=attribute_ref,
                    operator=FilterOperator.NOT_IN if negated else FilterOperator.IN,
                    value=[*previous_values, value],
                )
            state.use(*span)
            matched.append(f"attribute:{attribute_ref}")
            seen.append(match)
            continue
        # 3. Time dimension by name (« par date de livraison »).
        time_refs = match.of_kind("time")
        if time_refs:
            time_dimension = time_refs[0].partition(":")[2]
            state.use(*span)
            matched += time_refs
            seen.append(match)
            continue
        # 4. Attributes and dimensions: an axis, or the context of a filter.
        candidates = match.of_kind("attribute") + match.of_kind("dimension")
        if not candidates:
            continue
        nxt = resolved[index + 1] if index + 1 < len(resolved) else None
        marked = match.start > 0 and state.words[match.start - 1] in AXIS_MARKERS
        own = {c.partition(":")[2].split(".")[0] for c in candidates}
        prev = seen[-1] if seen else None
        if (
            not match.of_kind("attribute")
            and prev is not None
            and match.start - prev.end <= 2
            and own
            & {r.partition(":")[2].split(".")[0] for r in prev.refs if r.startswith("attribute:")}
        ):
            # « segment de client », « catégorie de produit »: the dimension qualifies the
            # attribute just named.
            state.use(*range(prev.end + 1, match.end + 1))
            seen.append(match)
            continue
        if not marked and nxt is not None and nxt.start - match.end <= 3:
            next_dims = {
                r.partition(":")[2].partition("=")[0].split(".")[0]
                for r in nxt.refs
                if r.startswith(("value:", "attribute:"))
            }
            if (nxt.of_kind("value") and own & next_dims) or (
                not match.of_kind("attribute") and own & next_dims
            ):
                # « clients de Lyon », « segment professionnel », « clients segment pro »:
                # the words introduce a filter, they are not an axis.
                state.use(*span)
                seen.append(match)
                continue
        attribute_refs = match.of_kind("attribute")
        if attribute_refs:
            # « segment pro »: a prefix of a unique value of the attribute just named.
            after = match.end + 1
            if state.free(after):
                attribute_ref = attribute_refs[0].partition(":")[2]
                prefixed = _value_prefix(values, attribute_ref, state.words[after])
                if prefixed is not None:
                    filters[attribute_ref] = MartFilter(field=attribute_ref, value=prefixed)
                    state.use(*span, after)
                    matched.append(attribute_refs[0])
                    seen.append(match)
                    continue
        if len(candidates) > 1:
            # A dimension and its display attribute have the same name: one axis.
            names = {c.partition(":")[2].split(".")[0] for c in candidates}
            if len(names) > 1:
                ask = clarification(layer, _surface(match), candidates)
                if ask is not None:
                    return ParseOutcome(AgentAnswer(kind="clarification", clarification=ask), True)
        ref = attribute_refs[0] if attribute_refs else candidates[0]
        axis = ref.partition(":")[2]
        # Named with « par » or not (« CA des produits »), it is an axis.
        if axis not in axes:
            axes.append(axis)
        marker = match.start - 1
        if marker >= 0 and state.words[marker] in AXIS_MARKERS:
            state.use(marker)
        state.use(*span)
        matched.append(ref)
        seen.append(match)

    for position, token in enumerate(state.words):
        if state.free(position) and token in AXIS_MARKERS and any(m.start > position for m in seen):
            state.use(position)

    unknown = [
        token
        for position, token in enumerate(state.words)
        if state.free(position)
        and token not in STOPWORDS
        and token not in FILLERS
        and not token.isdigit()
    ]
    if not metrics:
        return ParseOutcome(None, False, unknown, matched, ["aucune métrique reconnue"])
    if limit is not None and not order_by:
        order_by.append(OrderBy(field=metrics[0], direction=direction))
    spec = MartSpec(
        metrics=metrics,
        axes=axes,
        time_grain=grain,
        time_dimension=time_dimension,
        filters=list(filters.values()),
        period=period,
        order_by=order_by,
        limit=limit,
    )
    spec = spec.model_copy(
        update={"name": MartSpec(metrics=metrics, name=_default_name(spec, period)).name}
    )
    return ParseOutcome(
        AgentAnswer(kind="mart", mart=spec), confident=not unknown, unknown=unknown, matched=matched
    )


def refine(
    base: MartSpec,
    instruction: str,
    layer: SemanticLayer,
    vocabulary: Vocabulary,
    *,
    values: dict[str, list[str]],
    bindings: dict[str, str],
    today: date,
) -> ParseOutcome:
    """Apply « ajoute la marge », « seulement le T1 », « retire la ville », « par mois »."""
    base_year = base.period.start.year if base.period and base.period.start else today.year
    state_words = words(instruction)
    removing = bool(set(state_words) & REMOVE_WORDS)
    # Parse the instruction as a request with a placeholder metric, then merge.
    outcome = parse(
        instruction,
        layer,
        vocabulary,
        values=values,
        bindings=bindings,
        today=today,
        default_year=base_year,
    )
    if outcome.answer is not None and outcome.answer.kind == "clarification":
        return outcome
    found = outcome.answer.mart if outcome.answer and outcome.answer.mart else None
    if found is None:
        # No metric in the instruction: re-parse with the base metrics as context.
        prefix = " et ".join(layer.metric(m).label if layer.metric(m) else m for m in base.metrics)  # type: ignore[union-attr]
        outcome = parse(
            f"{prefix} {instruction}",
            layer,
            vocabulary,
            values=values,
            bindings=bindings,
            today=today,
            default_year=base_year,
        )
        if outcome.answer is None or outcome.answer.mart is None:
            return outcome
        if outcome.answer.kind == "clarification":
            return outcome
        found = outcome.answer.mart.model_copy(
            update={"metrics": [m for m in outcome.answer.mart.metrics if m not in base.metrics]}
        )
    leftover = [w for w in outcome.unknown if w not in REMOVE_WORDS | ADD_WORDS | RESTRICT_WORDS]
    merged = base.model_copy(deep=True)
    if removing:
        merged.metrics = [m for m in merged.metrics if m not in found.metrics] or merged.metrics
        merged.axes = [a for a in merged.axes if a not in found.axes]
        removed_fields = {f.field for f in found.filters}
        merged.filters = [f for f in merged.filters if f.field not in removed_fields]
        if found.time_grain and merged.time_grain == found.time_grain:
            merged.time_grain = None
    else:
        merged.metrics = list(dict.fromkeys([*merged.metrics, *found.metrics]))
        merged.axes = list(dict.fromkeys([*merged.axes, *found.axes]))
        by_field = {f.field: f for f in merged.filters}
        for item in found.filters:
            by_field[item.field] = item
        merged.filters = list(by_field.values())
        if found.time_grain:
            merged.time_grain = found.time_grain
        if found.period:
            merged.period = found.period
        if found.limit:
            merged.limit, merged.order_by = found.limit, found.order_by
        if found.time_dimension:
            merged.time_dimension = found.time_dimension
    changed = merged != base
    return ParseOutcome(
        AgentAnswer(kind="mart", mart=merged),
        confident=changed and not leftover,
        unknown=leftover,
        matched=outcome.matched,
        notes=[] if changed else ["la demande ne modifie rien"],
    )
