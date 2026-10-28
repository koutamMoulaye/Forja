import { matchesQuery } from "@/lib/format";
import { businessDescription } from "./view";
import type { SemanticDimension, SemanticLayer, SemanticMetric } from "@/lib/project/queries";

export type CatalogMetric = {
  name: string;
  label: string;
  description: string;
  synonyms: string[];
  format: string;
  additive: boolean;
  /** A question the parser understands with this metric alone. */
  question: string;
};

export type CatalogAxis = {
  ref: string;
  label: string;
  description: string;
  synonyms: string[];
  dimension: string;
};

export type CatalogDimension = {
  name: string;
  label: string;
  description: string;
  axes: CatalogAxis[];
  hierarchies: { label: string; levels: string[] }[];
  time: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  currency: "Montant en euros",
  integer: "Nombre entier",
  decimal: "Nombre décimal",
  percent: "Pourcentage",
};

export function formatName(format: string | null | undefined): string {
  return FORMAT_LABELS[format ?? "decimal"] ?? "Nombre";
}

function lowerFirst(text: string): string {
  return text[0] && text.slice(0, 2) !== text.slice(0, 2).toUpperCase()
    ? text[0].toLowerCase() + text.slice(1)
    : text;
}

function metricEntry(metric: SemanticMetric, timeGrain: boolean): CatalogMetric {
  return {
    name: metric.name,
    label: metric.label,
    description: businessDescription(metric),
    synonyms: (metric.synonyms ?? []).filter((s) => s.toLowerCase() !== metric.label.toLowerCase()),
    format: formatName(metric.format),
    additive: metric.additivity === "additive",
    question: timeGrain ? `${metric.label} par mois` : metric.label,
  };
}

function dimensionEntry(dim: SemanticDimension): CatalogDimension {
  const labels = new Map((dim.attributes ?? []).map((a) => [a.name, a.label]));
  return {
    name: dim.name,
    label: dim.label,
    description: dim.description ?? "",
    time: dim.kind === "time",
    axes: (dim.attributes ?? [])
      .filter((a) => !a.hidden && !a.pii)
      .filter((a) => dim.kind === "time" || a.filterable || a.name === dim.display_attribute)
      .map((a) => ({
        ref: `${dim.name}.${a.name}`,
        label: a.name === dim.display_attribute && dim.kind !== "time" ? dim.label : a.label,
        description: a.description ?? "",
        synonyms: (a.synonyms ?? []).filter((s) => s.toLowerCase() !== a.label.toLowerCase()),
        dimension: dim.label,
      })),
    hierarchies: (dim.hierarchies ?? []).map((h) => ({
      label: h.label,
      levels: h.levels.map((level) => labels.get(level) ?? level),
    })),
  };
}

/** The business catalogue of a semantic layer: visible metrics, then analysis axes. */
export function catalog(layer: SemanticLayer): {
  metrics: CatalogMetric[];
  dimensions: CatalogDimension[];
} {
  const timeGrain = (layer.dimensions ?? []).some((d) => d.kind === "time" && !d.hidden);
  return {
    metrics: (layer.metrics ?? [])
      .filter((m) => !m.hidden)
      .sort(
        (a, b) =>
          Number(b.default ?? false) - Number(a.default ?? false) ||
          a.label.localeCompare(b.label, "fr"),
      )
      .map((m) => metricEntry(m, timeGrain)),
    dimensions: (layer.dimensions ?? [])
      .filter((d) => !d.hidden && d.kind !== "degenerate")
      .map(dimensionEntry)
      .filter((d) => d.axes.length > 0),
  };
}

/** Search by label, description or synonym, accents and case ignored. */
export function searchCatalog(
  entries: ReturnType<typeof catalog>,
  query: string,
): ReturnType<typeof catalog> {
  const q = query.trim();
  if (!q) return entries;
  return {
    metrics: entries.metrics.filter((m) => matchesQuery(q, m.label, m.description, ...m.synonyms)),
    dimensions: entries.dimensions
      .map((d) => {
        if (matchesQuery(q, d.label, d.description)) return d;
        return {
          ...d,
          axes: d.axes.filter((a) => matchesQuery(q, a.label, a.description, ...a.synonyms)),
        };
      })
      .filter((d) => d.axes.length > 0),
  };
}

/** « Chiffre d’affaires par ville »: a metric crossed with an axis, for the agent. */
export function questionWith(metric: CatalogMetric, axis?: CatalogAxis): string {
  return axis ? `${metric.label} par ${lowerFirst(axis.label)}` : metric.question;
}
