"""Local pre-selection of the semantic elements relevant to a request.

Before any language model call, the request is matched against the vocabulary of
the layer (labels, synonyms, normalized French). Only the matched metrics,
dimensions and attributes are kept, plus the base elements always offered (main
metrics, the display attribute of each dimension, the dates and time grains). The
rendered context stays well under 1 500 tokens; its size is measured and recorded
with each request.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from difflib import get_close_matches

from forja_core.agent.spec import MartSpec
from forja_core.agent.vocabulary import Match
from forja_core.semantic.models import SemanticLayer, TimeGrain
from forja_core.semantic.text import normalize

MAX_METRICS = 10
MAX_ATTRIBUTES = 16
MAX_SYNONYMS = 4
# Average for French text with identifiers, measured on qwen3.5 prompts.
CHARS_PER_TOKEN = 3.2


@dataclass(frozen=True)
class ContextItem:
    ref: str
    label: str
    synonyms: tuple[str, ...] = ()
    data_type: str | None = None
    unit: str | None = None


@dataclass
class Preselection:
    metrics: list[ContextItem] = field(default_factory=list)
    attributes: list[ContextItem] = field(default_factory=list)
    time_dimensions: list[ContextItem] = field(default_factory=list)
    time_grains: list[str] = field(default_factory=list)

    @property
    def refs(self) -> list[str]:
        return [
            *(f"metric:{m.ref}" for m in self.metrics),
            *(f"attribute:{a.ref}" for a in self.attributes),
            *(f"time:{t.ref}" for t in self.time_dimensions),
        ]

    def render(self, today: str | None = None) -> str:
        return render_context(
            self.metrics, self.attributes, self.time_dimensions, self.time_grains, today
        )

    def tokens(self, today: str | None = None) -> int:
        return estimate_tokens(self.render(today))


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def _line(item: ContextItem) -> str:
    parts = [item.ref, item.label]
    if item.data_type:
        parts.append(item.data_type)
    if item.unit:
        parts.append(item.unit)
    if item.synonyms:
        parts.append("syn: " + ", ".join(item.synonyms))
    return "- " + " | ".join(parts)


def render_context(
    metrics: Iterable[ContextItem],
    attributes: Iterable[ContextItem],
    time_dimensions: Iterable[ContextItem],
    time_grains: Iterable[str],
    today: str | None = None,
) -> str:
    """Compact text, one line per element: JSON would cost about twice the tokens."""
    attributes, time_dimensions, time_grains = (
        list(attributes),
        list(time_dimensions),
        list(time_grains),
    )
    lines = ["Metrics:", *(_line(m) for m in metrics)]
    if attributes:
        lines += ["Attributes (dimension.attribute):", *(_line(a) for a in attributes)]
    if time_dimensions:
        lines += ["Time dimensions:", *(_line(t) for t in time_dimensions)]
    if time_grains:
        lines.append("Time grains: " + ", ".join(time_grains))
    if today:
        lines.append(f"Today: {today}")
    return "\n".join(lines)


def _synonyms(values: Iterable[str], label: str) -> tuple[str, ...]:
    seen = {normalize(label)}
    kept = []
    for value in values:
        if normalize(value) not in seen:
            seen.add(normalize(value))
            kept.append(value)
    return tuple(kept[:MAX_SYNONYMS])


def preselect(
    layer: SemanticLayer,
    matches: list[Match],
    *,
    unknown_words: Iterable[str] = (),
    base: MartSpec | None = None,
    bindings: dict[str, str] | None = None,
) -> Preselection:
    metric_names: list[str] = []
    attribute_refs: list[str] = []
    dimensions: list[str] = []
    refs = [r for m in matches for r in m.refs] + list((bindings or {}).values())
    if base is not None:
        metric_names += base.metrics
        attribute_refs += base.axes + [f.field for f in base.filters if "." in f.field]
    for ref in refs:
        kind, _, name = ref.partition(":")
        if kind == "metric":
            metric_names.append(name)
        elif kind == "attribute":
            attribute_refs.append(name)
        elif kind == "value":
            attribute_refs.append(name.partition("=")[0])
        elif kind == "dimension":
            dimensions.append(name)

    # Close labels of words the vocabulary did not know (typos, near synonyms).
    labels: dict[str, str] = {}
    for metric in layer.metrics:
        labels[normalize(metric.label)] = f"metric:{metric.name}"
    for dim in layer.dimensions:
        for attribute in dim.attributes:
            labels[normalize(attribute.label)] = f"attribute:{dim.name}.{attribute.name}"
    for word in unknown_words:
        for close in get_close_matches(normalize(word), list(labels), n=2, cutoff=0.6):
            kind, _, name = labels[close].partition(":")
            (metric_names if kind == "metric" else attribute_refs).append(name)

    metric_names += [m.name for m in layer.metrics if m.default]
    selected_metrics = []
    for name in dict.fromkeys(metric_names):
        chosen = layer.metric(name)
        if chosen is None or chosen.hidden:
            continue
        selected_metrics.append(
            ContextItem(
                ref=chosen.name,
                label=chosen.label,
                synonyms=_synonyms(chosen.synonyms, chosen.label),
                unit=chosen.unit,
            )
        )
    for dim_name in dimensions:
        named = layer.dimension(dim_name)
        if named is None:
            continue
        if named.display_attribute:
            attribute_refs.append(f"{named.name}.{named.display_attribute}")
        attribute_refs += [f"{named.name}.{a.name}" for a in named.attributes if a.filterable][:3]
    # Base: how each dimension is named by default.
    for dim in layer.dimensions:
        if dim.kind == "standard" and dim.display_attribute and not dim.hidden:
            attribute_refs.append(f"{dim.name}.{dim.display_attribute}")

    selected_attributes = []
    for ref in dict.fromkeys(attribute_refs):
        found = layer.attribute(ref)
        if found is None:
            continue
        dim, attribute = found
        if attribute.hidden or dim.hidden or dim.kind == "time":
            continue
        selected_attributes.append(
            ContextItem(
                ref=f"{dim.name}.{attribute.name}",
                label=f"{attribute.label} ({dim.label.lower()})",
                synonyms=_synonyms([*attribute.synonyms, *dim.synonyms[:1]], attribute.label),
                data_type=attribute.data_type,
            )
        )
    time_dimensions = [ContextItem(ref=d.name, label=d.label) for d in layer.time_dimensions()]
    return Preselection(
        metrics=selected_metrics[:MAX_METRICS],
        attributes=selected_attributes[:MAX_ATTRIBUTES],
        time_dimensions=time_dimensions,
        time_grains=[g.value for g in TimeGrain] if time_dimensions else [],
    )
