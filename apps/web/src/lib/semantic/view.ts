import { normalizeText } from "@/lib/format";
import type {
  MartRequest,
  SemanticDimension,
  SemanticLayer,
  SemanticMetric,
  SynonymProposal,
} from "@/lib/project/queries";

export const ADDITIVITY: Record<
  SemanticMetric["additivity"],
  { label: string; description: string }
> = {
  additive: {
    label: "Additive",
    description: "Se somme sur toutes les dimensions.",
  },
  semi_additive: {
    label: "Semi-additive",
    description:
      "Se somme sur certaines dimensions seulement, pas dans le temps (exemple : un stock).",
  },
  non_additive: {
    label: "Non additive",
    description: "Ne se somme jamais : recalculée à partir de ses composantes à chaque niveau.",
  },
};

const LEVELS: Record<string, string> = {
  jour: "jours",
  semaine: "semaines",
  mois: "mois",
  trimestre: "trimestres",
  annee: "années",
};

function lower(text: string): string {
  return text.charAt(1) && text.charAt(1) === text.charAt(1).toUpperCase()
    ? text
    : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function pluralLabel(text: string): string {
  const word = lower(text);
  return /[sxz]$/.test(word) ? word : `${word}s`;
}

/** What the additivity of a metric means here, with the project's own dimensions
 * (« se somme sur les années, les musées et les régions »), never a generic example. */
export function additivityText(metric: SemanticMetric, layer: SemanticLayer): string {
  const dims = (layer.dimensions ?? []).filter((d) => d.fact === metric.fact && !d.hidden);
  const time = dims.filter((d) => d.kind === "time");
  const others = dims.filter((d) => d.kind !== "time");
  const levels = [
    ...new Set(time.map((d) => LEVELS[d.time_level ?? "jour"] ?? "dates").filter(Boolean)),
  ];
  const attributes = others.flatMap((d) =>
    (d.attributes ?? [])
      .filter((a) => !a.hidden && !a.pii && (a.filterable || a.name === d.display_attribute))
      .slice(0, 3)
      .map((a) => (a.name === d.display_attribute ? pluralLabel(d.label) : pluralLabel(a.label))),
  );
  const join = (items: string[]) =>
    items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : items[0];
  if (metric.additivity === "additive") {
    const all = [...levels, ...attributes].slice(0, 5);
    return all.length
      ? `Se somme sur toutes les dimensions de ce projet : ${join(all)}.`
      : ADDITIVITY.additive.description;
  }
  if (metric.additivity === "semi_additive") {
    return attributes.length
      ? `Se somme sur ${join(attributes.slice(0, 4))}, pas dans le temps${
          levels.length ? ` (${join(levels)})` : ""
        } : on lit la dernière valeur connue.`
      : ADDITIVITY.semi_additive.description;
  }
  if (metric.entity) {
    const entity = others.find((d) => d.name === metric.entity);
    const noun = entity ? lower(entity.label) : "membre";
    return `Ne se somme pas : un ${noun} présent sur plusieurs ${
      levels[0] ?? "périodes"
    } ou dans plusieurs groupes ne compte qu’une fois à chaque niveau.`;
  }
  return ADDITIVITY.non_additive.description;
}

const FORMATS: Record<string, string> = {
  currency: "Monétaire",
  integer: "Entier",
  decimal: "Décimal",
  percent: "Pourcentage",
};

export function formatLabel(metric: SemanticMetric): string {
  const base = FORMATS[metric.format ?? "decimal"] ?? "Décimal";
  return metric.unit ? `${base}, ${metric.unit}` : base;
}

const DATA_TYPES: Record<string, string> = {
  text: "Texte",
  number: "Nombre",
  date: "Date",
  boolean: "Booléen",
};

export type SemanticRow = {
  /** override target: metric:x, attribute:dim.attr */
  target: string;
  /** URL value: the metric name, or dim.attr */
  key: string;
  label: string;
  id: string;
  formula: string;
  kind: string;
  synonyms: string[];
  marts: number;
  hidden: boolean;
  description: string;
  /** Engineers only (the number of fact rows). */
  technical?: boolean;
};

/** Specs of the data marts that are not drafts, to count where an element is used. */
function specs(marts: MartRequest[]) {
  return marts
    .filter((m) => m.status !== "rejected")
    .map((m) => [...(m.iterations ?? [])].reverse().find((i) => i.spec)?.spec)
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));
}

export function metricRows(layer: SemanticLayer, marts: MartRequest[]): SemanticRow[] {
  const used = specs(marts);
  return (layer.metrics ?? []).map((metric) => ({
    target: `metric:${metric.name}`,
    key: metric.name,
    label: metric.label,
    id: metric.name,
    formula: metric.formula,
    kind: ADDITIVITY[metric.additivity].label,
    technical: metric.technical ?? false,
    synonyms: metric.synonyms ?? [],
    marts: used.filter((spec) => spec.metrics.includes(metric.name)).length,
    hidden: metric.hidden ?? false,
    description: metric.description ?? "",
  }));
}

export function dimensionRows(layer: SemanticLayer, marts: MartRequest[]): SemanticRow[] {
  const used = specs(marts);
  return (layer.dimensions ?? []).flatMap((dimension) =>
    (dimension.attributes ?? []).map((attribute) => {
      const ref = `${dimension.name}.${attribute.name}`;
      return {
        target: `attribute:${ref}`,
        key: ref,
        label: attribute.label,
        id: ref,
        formula: `${dimension.table}.${attribute.column}`,
        kind: DATA_TYPES[attribute.data_type ?? "text"] ?? "Texte",
        synonyms: attribute.synonyms ?? [],
        marts: used.filter((spec) =>
          (spec.axes ?? []).some((axis) => axis === ref || axis === dimension.name),
        ).length,
        hidden: (attribute.hidden ?? false) || (dimension.hidden ?? false),
        description: attribute.description ?? "",
      };
    }),
  );
}

export function findMetric(layer: SemanticLayer, name: string): SemanticMetric | undefined {
  return layer.metrics?.find((m) => m.name === name);
}

export function findAttribute(layer: SemanticLayer, ref: string) {
  const [dimensionName, attributeName] = ref.split(".");
  const dimension = layer.dimensions?.find((d) => d.name === dimensionName);
  const attribute = dimension?.attributes?.find((a) => a.name === attributeName);
  return dimension && attribute ? { dimension, attribute } : null;
}

/** « metric:chiffre_affaires » → its label, for the synonym queue. */
export function targetLabel(layer: SemanticLayer, target: string): string {
  const [kind, ref = ""] = target.split(":");
  if (kind === "metric") return findMetric(layer, ref)?.label ?? ref;
  if (kind === "attribute") {
    const found = findAttribute(layer, ref);
    return found ? `${found.attribute.label} (${found.dimension.label})` : ref;
  }
  if (kind === "dimension") {
    return layer.dimensions?.find((d: SemanticDimension) => d.name === ref)?.label ?? ref;
  }
  return target;
}

/**
 * Why accepting a synonym could mislead the agent: the term already names another
 * element, the target is hidden, or it speaks of TTC where the metric is HT.
 */
export function synonymWarnings(layer: SemanticLayer, proposal: SynonymProposal): string[] {
  const term = normalizeText(proposal.synonym.trim());
  const warnings: string[] = [];
  const names: { target: string; label: string; words: string[] }[] = [
    ...(layer.metrics ?? []).map((m) => ({
      target: `metric:${m.name}`,
      label: m.label,
      words: [m.label, m.name, ...(m.synonyms ?? [])],
    })),
    ...(layer.dimensions ?? []).flatMap((d) =>
      (d.attributes ?? []).map((a) => ({
        target: `attribute:${d.name}.${a.name}`,
        label: a.label,
        words: [a.label, a.name, ...(a.synonyms ?? [])],
      })),
    ),
  ];
  for (const other of names) {
    if (other.target === proposal.target) continue;
    if (other.words.some((w) => normalizeText(w) === term)) {
      warnings.push(`« ${proposal.synonym} » désigne déjà ${other.label} : l’agent hésiterait.`);
    }
  }
  const [kind, ref = ""] = proposal.target.split(":");
  if (kind === "metric") {
    const metric = findMetric(layer, ref);
    const text = normalizeText(`${metric?.label ?? ""} ${metric?.description ?? ""}`);
    if (/\bttc\b/.test(term) && /\bht\b/.test(text)) {
      warnings.push(`${metric?.label} est hors taxes : ce synonyme serait trompeur.`);
    }
    if (metric?.hidden) warnings.push(`${metric.label} est masquée aux analysts.`);
    if (metric && metric.kind !== "ratio" && /\b(moyen|moyenne|ratio|taux)\b/.test(term)) {
      warnings.push(`${metric.label} est une somme : « ${proposal.synonym} » évoque un ratio.`);
    }
  }
  return warnings;
}

export type SynonymFilter = "pending" | "decided";

export function sortProposals(proposals: SynonymProposal[]): SynonymProposal[] {
  return [...proposals].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
