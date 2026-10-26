import type { components } from "@/lib/api/schema";
import type { StatusKind } from "@/components/ui/status-badge";
import type { Job } from "@/lib/project/use-runs";
import type { GraphNode } from "./model";

type Plan = components["schemas"]["TransformationPlan"];
type Profile = components["schemas"]["ProfileReport"];
type SilverType = components["schemas"]["SilverType"];
type InferredType = components["schemas"]["InferredType"];

export type ColumnView = {
  name: string;
  type: string;
  description: string;
  example: string | null;
  key: boolean;
  pii: boolean;
};

export type RuleView = { id: string; title: string; kind: StatusKind; label: string };

const SILVER_TYPES: Record<SilverType, string> = {
  bigint: "entier",
  double: "décimal",
  "decimal(18,2)": "montant",
  boolean: "booléen",
  date: "date",
  timestamp: "date et heure",
  varchar: "texte",
};

const INFERRED_TYPES: Record<InferredType, string> = {
  integer: "entier",
  decimal: "décimal",
  boolean: "booléen",
  date: "date",
  datetime: "date et heure",
  string: "texte",
  other: "autre",
  empty: "vide",
};

const percent = (value: number) => `${String(Math.round(value * 10) / 10).replace(".", ",")} %`;

export function profileColumns(profile: Profile): ColumnView[] {
  const keys = new Set(profile.candidate_keys[0]?.columns ?? []);
  return profile.columns.map((column) => ({
    name: column.name,
    type: INFERRED_TYPES[column.inferred.inferred_type] ?? column.physical_type,
    description: `${percent(column.null_pct)} de vides, ${column.distinct_count.toLocaleString("fr-FR")} valeurs distinctes`,
    example: column.top_values?.[0] ? String(column.top_values[0].value) : null,
    key: keys.has(column.name),
    pii: column.pii != null,
  }));
}

export function planColumns(plan: Plan): ColumnView[] {
  const keys = new Set(plan.primary_key?.columns ?? []);
  return plan.columns
    .filter((column) => column.included)
    .map((column) => ({
      name: column.target_column,
      type: SILVER_TYPES[column.target_type],
      description: column.description || column.explanation,
      example: null,
      key: keys.has(column.source_column),
      pii: column.pii_type != null && column.pii_treatment !== "none",
    }));
}

/** DuckDB types of built tables, named as on the review screens. */
export function duckdbType(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith("decimal")) return "montant";
  if (/^(big|small|tiny|u?h?u?)?int(eger)?\d*$/.test(t) || t.endsWith("int")) return "entier";
  if (t === "double" || t === "float" || t === "real") return "décimal";
  if (t === "boolean") return "booléen";
  if (t === "date") return "date";
  if (t.startsWith("timestamp")) return "date et heure";
  if (t === "varchar" || t === "text" || t.startsWith("varchar")) return "texte";
  return t;
}

export function tableColumns(
  columns: { name: string; type: string; technical?: boolean }[],
  pii: string[],
): ColumnView[] {
  const personal = new Set(pii);
  return columns
    .filter((column) => !column.technical && !column.name.startsWith("dbt_"))
    .map((column) => ({
      name: column.name,
      type: duckdbType(column.type),
      description: column.name.endsWith("_key")
        ? "Clé du modèle"
        : personal.has(column.name)
          ? "Pseudonymisée à la publication"
          : "",
      example: null,
      key: column.name.endsWith("_key"),
      pii: personal.has(column.name),
    }));
}

/** The plan's rules, one decision each, numbered as on the review screen. */
export function planRules(plan: Plan): RuleView[] {
  const state: Pick<RuleView, "kind" | "label"> =
    plan.status === "draft"
      ? { kind: "prop", label: "À revoir" }
      : plan.status === "approved"
        ? { kind: "val", label: "Validé" }
        : { kind: "app", label: "Appliqué" };
  const titles: string[] = [];
  for (const column of plan.columns) {
    const name = column.target_column;
    if (!column.included) {
      titles.push(`Retirer ${column.source_column}`);
      continue;
    }
    if (column.from_text && column.target_type !== "varchar") {
      titles.push(`Convertir ${name} en ${SILVER_TYPES[column.target_type]}`);
    }
    if (column.normalization !== "none") titles.push(`Normaliser l’écriture de ${name}`);
    if (column.pii_treatment === "hash") titles.push(`Pseudonymiser ${name}`);
    if (column.pii_treatment === "mask") titles.push(`Masquer ${name}`);
    if (column.pii_treatment === "drop") titles.push(`Retirer ${name} (donnée personnelle)`);
    for (const rule of column.rules ?? []) {
      if (!rule.enabled) continue;
      titles.push(
        rule.kind === "not_null"
          ? `${name} obligatoire`
          : rule.kind === "castable"
            ? `${name} convertible`
            : `Format de ${name}`,
      );
    }
  }
  if (plan.deduplication?.enabled && (plan.deduplication.duplicate_rows ?? 0) > 0) {
    titles.push("Retirer les doublons exacts");
  }
  if (plan.primary_key) titles.push(`Clé primaire ${plan.primary_key.columns.join(", ")}`);
  return titles.map((title, index) => ({
    id: `R-${String(index + 1).padStart(2, "0")}`,
    title,
    ...state,
  }));
}

/** dbt model names that stand for a node in a run's items. */
export function nodeItems(node: GraphNode): string[] {
  switch (node.type) {
    case "source":
      return node.ref ? [node.ref] : [];
    case "silver":
    case "dimension":
    case "fact":
    case "date_dimension":
      return [node.id];
    default:
      return [];
  }
}

const RUN_TYPES: Partial<Record<GraphNode["type"], Job["type"][]>> = {
  source: ["profile"],
  silver: ["build_silver", "build_all"],
  dimension: ["build_gold", "build_all"],
  fact: ["build_gold", "build_all"],
  date_dimension: ["build_gold", "build_all"],
  mart: ["mart_request", "publish_mart"],
  destination: ["export", "build_all", "publish_mart"],
};

/** Runs that built (or tried to build) the node, most recent first. */
export function nodeRuns(node: GraphNode, runs: Job[]): Job[] {
  const types = RUN_TYPES[node.type] ?? [];
  const items = nodeItems(node);
  return runs.filter((run) => {
    if (!types.includes(run.type)) return false;
    if (node.type === "mart") return run.params.mart_request_id === node.ref;
    const progress = run.progress;
    const reported = progress && (progress.done?.length || progress.failed?.length);
    if (reported && items.length) {
      return items.some((item) => progress.done?.includes(item) || progress.failed?.includes(item));
    }
    if (node.type === "silver" || node.type === "source") {
      const ids = run.params.source_ids;
      return !ids || (node.ref != null && ids.includes(node.ref));
    }
    return true;
  });
}

export function runBadge(run: Job): { kind: StatusKind; label: string } {
  switch (run.status) {
    case "succeeded":
      return { kind: "app", label: "Réussi" };
    case "failed":
      return { kind: "err", label: "Échec" };
    case "running":
      return { kind: "run", label: "En cours" };
    case "queued":
      return { kind: "queue", label: "En attente" };
    default:
      return { kind: "rej", label: "Annulé" };
  }
}

/** dbt tests of the node's model in a run. */
export function modelTests(run: Job | undefined, model: string) {
  return (run?.metrics?.dbt_tests?.results ?? []).filter((test) => test.model === model);
}
