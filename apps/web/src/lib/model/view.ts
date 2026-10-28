import type { components } from "@/lib/api/schema";
import type { StatusKind } from "@/components/ui/status-badge";
import { formatRatio } from "@/lib/format";
import type { GoldPlan, Relation, ValidationIssue } from "@/lib/project/queries";

type S = components["schemas"];
export type Fact = S["Fact"];
export type Dimension = S["Dimension"];
export type Measure = S["Measure"];
export type GoldPlanPatch = S["GoldPlanPatch"];
export type Aggregation = Measure["aggregation"];

export const AGGREGATIONS: { value: NonNullable<Aggregation>; label: string }[] = [
  { value: "sum", label: "Somme" },
  { value: "count", label: "Nombre" },
  { value: "count_distinct", label: "Distinct" },
  { value: "avg", label: "Moyenne" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "none", label: "Non agrégée" },
];

export function aggregationLabel(aggregation: Aggregation): string {
  return AGGREGATIONS.find((a) => a.value === (aggregation ?? "sum"))?.label ?? "Somme";
}

/** Sums and counts add up across every dimension; the others never do. */
export function additivity(aggregation: Aggregation): "Additive" | "Non additive" {
  const value = aggregation ?? "sum";
  return value === "sum" || value === "count" ? "Additive" : "Non additive";
}

export function scdView(scd: Dimension["scd"]): { label: string; historized: boolean } {
  return scd === "scd2"
    ? { label: "SCD2, historisée", historized: true }
    : { label: "SCD1, écrasée", historized: false };
}

export const SCD_DESCRIPTIONS = {
  scd1: "La valeur est remplacée. Aucun historique conservé.",
  scd2: "Une nouvelle version est créée à chaque changement. Les ventes passées gardent la valeur de l’époque.",
} as const;

export type Origin = { kind: "local" | "cloud" | "heuristic"; title: string; detail: string };

/** « heuristic » or « llm:ollama/mistral-small3:24b ». */
export function originView(origin: string): Origin {
  if (!origin.startsWith("llm:")) {
    return {
      kind: "heuristic",
      title: "Heuristique",
      detail: "Clés, relations et mesures déduites des noms de colonnes et des taux d’inclusion.",
    };
  }
  const [provider = "", ...model] = origin.slice(4).split("/");
  const name = model.join("/") || provider;
  if (provider === "ollama") {
    return {
      kind: "local",
      title: "IA locale",
      detail: `Grain, mesures et historisation. ${name} via Ollama, sur ce poste.`,
    };
  }
  const company =
    provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : provider;
  return {
    kind: "cloud",
    title: `IA cloud, ${company}`,
    detail: `Grain, mesures et historisation. ${name}, à partir des schémas seuls.`,
  };
}

export const RELATION_STATUS: Record<Relation["status"], { kind: StatusKind; label: string }> = {
  suggested: { kind: "prop", label: "Suggérée" },
  confirmed: { kind: "val", label: "Confirmée" },
  rejected: { kind: "rej", label: "Rejetée" },
};

export function relationTitle(relation: Relation): string {
  return `${relation.from_source}.${relation.from_column} → ${relation.to_source}.${relation.to_column}`;
}

export function relationConfidence(relation: Relation): string {
  return formatRatio(relation.confidence);
}

export type IssueTarget =
  | { kind: "relation"; relation: Relation }
  | { kind: "measure"; fact: string; measure: string }
  | { kind: "dimension"; dimension: string }
  | { kind: "fact"; fact: string }
  | null;

/** What an issue is about, so that the « À résoudre » panel can act on it directly. */
export function issueTarget(
  issue: ValidationIssue,
  plan: GoldPlan,
  relations: Relation[],
): IssueTarget {
  const parts = (issue.location ?? "").split(".");
  if (parts[0] === "dimensions" && parts[1]) return { kind: "dimension", dimension: parts[1] };
  if (parts[0] !== "facts" || !parts[1]) return null;
  const fact = plan.facts?.find((f) => f.name === parts[1]);
  if (!fact) return null;
  if (parts[2] === "measures" && parts[3]) {
    return { kind: "measure", fact: fact.name, measure: parts[3] };
  }
  const findRelation = (fromSource: string, fromColumn: string, toSource: string) =>
    relations.find(
      (r) =>
        r.from_source === fromSource && r.from_column === fromColumn && r.to_source === toSource,
    );
  if (parts[2] === "foreign_keys" && parts[3]) {
    const key = fact.foreign_keys?.find((k) => k.name === parts[3]);
    const dimension = plan.dimensions?.find((d) => d.name === key?.dimension);
    const relation =
      key && dimension ? findRelation(key.source, key.column, dimension.source) : undefined;
    return relation ? { kind: "relation", relation } : { kind: "fact", fact: fact.name };
  }
  if (parts[2] === "joins" && parts[3]) {
    const join = fact.joins?.find((j) => j.source === parts[3]);
    const relation = join
      ? findRelation(join.from_source, join.from_column, join.source)
      : undefined;
    return relation ? { kind: "relation", relation } : { kind: "fact", fact: fact.name };
  }
  return { kind: "fact", fact: fact.name };
}

export const ISSUE_TITLES: Record<string, string> = {
  unconfirmed_relation: "Relation à confirmer",
  fan_out: "Fan-out",
  orphan_dimension: "Dimension orpheline",
  natural_key_not_unique: "Clé naturelle non unique",
  invalid_expression: "Expression de mesure invalide",
  not_numeric: "Mesure non numérique",
  no_measure: "Aucune mesure",
  weighted_average: "Moyenne pondérée",
  grain_not_guaranteed: "Grain non garanti",
  unknown_column: "Colonne inconnue",
  unknown_source: "Source sans table",
};

export function issueTitle(issue: ValidationIssue): string {
  return ISSUE_TITLES[issue.code] ?? (issue.severity === "error" ? "Erreur" : "À surveiller");
}

export type StarGeometry = {
  width: number;
  height: number;
  fact: { x: number; y: number };
  dimensions: { x: number; y: number }[];
};

/**
 * The fact in the middle, its dimensions in two columns on its sides (left, right,
 * left…), each column centred on the fact. The height grows with the longer side, so
 * that no card ever covers another.
 */
export function starLayout(
  count: number,
  width: number,
  fact: { width: number; height: number },
  card: { width: number; height: number },
  gap = { x: 56, y: 18, pad: 24 },
): StarGeometry {
  const perSide = [Math.ceil(count / 2), Math.floor(count / 2)];
  const column = (n: number) => n * card.height + Math.max(0, n - 1) * gap.y;
  const height = Math.max(fact.height, column(perSide[0]!)) + 2 * gap.pad;
  const minWidth = fact.width + 2 * (card.width + gap.x) + 2 * gap.pad;
  const total = Math.max(width, minWidth);
  const fx = Math.round(total / 2 - fact.width / 2);
  const fy = Math.round(height / 2 - fact.height / 2);
  const left = fx - gap.x - card.width;
  const right = fx + fact.width + gap.x;
  const dimensions = Array.from({ length: count }, (_, index) => {
    const side = index % 2;
    const rank = Math.floor(index / 2);
    const top = height / 2 - column(perSide[side]!) / 2;
    return {
      x: Math.round(side === 0 ? left : right),
      y: Math.round(top + rank * (card.height + gap.y)),
    };
  });
  return { width: total, height, fact: { x: fx, y: fy }, dimensions };
}

export type GoldChange = string;

/** What changed between two Gold plan versions, in French. */
export function diffGold(before: GoldPlan, after: GoldPlan): GoldChange[] {
  const changes: GoldChange[] = [];
  const dims = new Map((before.dimensions ?? []).map((d) => [d.name, d]));
  for (const dim of after.dimensions ?? []) {
    const old = dims.get(dim.name);
    if (!old) changes.push(`${dim.name} ajoutée`);
    else {
      if (old.scd !== dim.scd)
        changes.push(`${dim.name} : ${scdView(old.scd).label} → ${scdView(dim.scd).label}`);
      const was = new Set((old.attributes ?? []).map((a) => a.name));
      const now = new Set((dim.attributes ?? []).map((a) => a.name));
      for (const a of now) if (!was.has(a)) changes.push(`${dim.name}.${a} ajouté`);
      for (const a of was) if (!now.has(a)) changes.push(`${dim.name}.${a} retiré`);
    }
    dims.delete(dim.name);
  }
  for (const name of dims.keys()) changes.push(`${name} retirée`);
  const facts = new Map((before.facts ?? []).map((f) => [f.name, f]));
  for (const fact of after.facts ?? []) {
    const old = facts.get(fact.name);
    const was = new Map((old?.measures ?? []).map((m) => [m.name, m]));
    for (const measure of fact.measures ?? []) {
      const previous = was.get(measure.name);
      if (!previous) changes.push(`mesure ${measure.name} ajoutée`);
      else if (
        previous.aggregation !== measure.aggregation ||
        previous.expression !== measure.expression
      ) {
        changes.push(`mesure ${measure.name} modifiée`);
      }
      was.delete(measure.name);
    }
    for (const name of was.keys()) changes.push(`mesure ${name} retirée`);
  }
  return changes;
}

export const GOLD_STEPS: { step: string; label: string }[] = [
  { step: "context", label: "Lecture des tables nettoyées et des relations" },
  { step: "llm", label: "Proposition du grain, des mesures et de l’historisation" },
  { step: "validation", label: "Contrôles du modèle et enregistrement" },
];

/** Index of the proposal step a run is at (progress.step), -1 before it starts. */
export function goldStepIndex(step: string | null | undefined): number {
  return GOLD_STEPS.findIndex((s) => s.step === step);
}
