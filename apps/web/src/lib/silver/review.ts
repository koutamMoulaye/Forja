import type { components } from "@/lib/api/schema";
import type { StatusKind } from "@/components/ui/status-badge";
import { formatLabel, piiLabel } from "@/lib/sources/view";
import type {
  ColumnPlan,
  PlanSamples,
  ReviewRule,
  TransformationPlan,
} from "@/lib/project/queries";

type S = components["schemas"];
export type ColumnPatch = S["ColumnPatch"];
export type PlanPatch = S["PlanPatch"];
export type Decision = "validated" | "rejected";
export type RuleFilter = "all" | "pending" | "validated" | "rejected";

/** « R-01 », in reading order. */
export function ruleLabel(index: number): string {
  return `R-${String(index + 1).padStart(2, "0")}`;
}

export const CONFIDENCE: Record<ReviewRule["confidence"], { label: string; bars: number }> = {
  high: { label: "Confiance élevée", bars: 3 },
  medium: { label: "Confiance moyenne", bars: 2 },
  low: { label: "Confiance faible", bars: 1 },
};

export function matchesRuleFilter(filter: RuleFilter, rule: ReviewRule): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return !rule.decision;
    case "validated":
      return rule.decision === "validated";
    case "rejected":
      return rule.decision === "rejected";
  }
}

export function countRules(rules: ReviewRule[]) {
  return {
    all: rules.length,
    pending: rules.filter((r) => !r.decision).length,
    validated: rules.filter((r) => r.decision === "validated").length,
    rejected: rules.filter((r) => r.decision === "rejected").length,
  };
}

/** Pending rules a person can accept at once: high confidence only. */
export function highConfidencePending(rules: ReviewRule[]): ReviewRule[] {
  return rules.filter((r) => !r.decision && r.confidence === "high");
}

/** Badge of a rule card: its decision, or the plan's state once applied. */
export function ruleBadge(
  rule: ReviewRule,
  status: TransformationPlan["status"],
): { kind: StatusKind; label: string } {
  if (rule.decision === "validated") return { kind: "val", label: "Validé" };
  if (rule.decision === "rejected") return { kind: "rej", label: "Rejeté" };
  if (status === "applied") return { kind: "app", label: "Appliqué" };
  if (status === "approved") return { kind: "val", label: "Approuvé" };
  return { kind: "prop", label: "À revoir" };
}

/** Decisions applied locally, before the API answers (optimistic update). */
export function withDecisions<T extends { rules: ReviewRule[] }>(
  review: T,
  decisions: Record<string, Decision | null>,
): T {
  const rules = review.rules.map((rule) =>
    rule.id in decisions ? { ...rule, decision: decisions[rule.id] ?? null } : rule,
  );
  const counts = countRules(rules);
  return {
    ...review,
    rules,
    pending: counts.pending,
    validated: counts.validated,
    rejected: counts.rejected,
  };
}

export type BeforeAfter = {
  column: string;
  before: string;
  after: string;
  invalid: boolean;
  personal: boolean;
};

function show(value: string | null | undefined): string {
  if (value == null) return "(vide)";
  if (/^[0-9a-f]{64}$/.test(value)) return `${value.slice(0, 10)}…`;
  return value === "" ? "(vide)" : value;
}

/**
 * Before and after values of a rule, from the plan samples: a conversion shows its column,
 * a normalization the values it changes across its columns, a pseudonymization the
 * treated values. The deduplication and the key have no per-value example.
 */
export function ruleExamples(rule: ReviewRule, samples: PlanSamples | undefined): BeforeAfter[] {
  if (!samples || !rule.columns.length) return [];
  if (rule.kind === "deduplicate" || rule.kind === "primary_key" || rule.kind === "exclude") {
    return [];
  }
  const byColumn = new Map(samples.columns.map((c) => [c.column, c]));
  const examples: BeforeAfter[] = [];
  // A normalization or a conversion is shown on plain columns first: the values of a
  // personal column are masked, its change would not read.
  const plain = rule.columns.filter((name) => !byColumn.get(name)?.personal);
  const names =
    rule.kind === "pii" || rule.kind === "format" || !plain.length ? rule.columns : plain;
  for (const name of names) {
    const column = byColumn.get(name);
    if (!column) continue;
    const values =
      rule.kind === "normalize" ? column.values.filter((v) => v.before !== v.after) : column.values;
    for (const value of values) {
      examples.push({
        column: name,
        before: show(value.before),
        after: value.invalid
          ? rule.kind === "cast"
            ? "vide · valeur impossible"
            : "(vide)"
          : column.treatment === "drop" && column.personal
            ? "retirée des exports"
            : show(value.after),
        invalid: value.invalid,
        personal: column.personal ?? false,
      });
    }
  }
  if (rule.kind === "normalize") {
    // One example per column first, so that a group shows its variety.
    const first = rule.columns
      .map((name) => examples.find((e) => e.column === name))
      .filter((e): e is BeforeAfter => Boolean(e));
    const rest = examples.filter((e) => !first.includes(e));
    return [...first, ...rest].slice(0, 3);
  }
  return examples.slice(0, 3);
}

/** What a rule says instead of examples, when it has none. */
export function ruleSummary(rule: ReviewRule, samples?: PlanSamples): string | null {
  if (rule.kind === "normalize" && samples) {
    return "Aucune valeur de l’échantillon n’est modifiée : la règle vaut pour les prochaines versions.";
  }
  if (rule.kind === "exclude") return "Colonne absente de la table nettoyée";
  if (rule.kind === "deduplicate") {
    const n = rule.affected ?? 0;
    return n ? `${n} ligne${n > 1 ? "s" : ""} en double → ${n} supprimée${n > 1 ? "s" : ""}` : null;
  }
  return null;
}

export type ParamKind =
  "type" | "date_format" | "invalid" | "normalization" | "treatment" | "exclude";

export type RuleParam = {
  kind: ParamKind;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

export const TYPE_OPTIONS = [
  { value: "varchar", label: "Texte" },
  { value: "bigint", label: "Entier" },
  { value: "double", label: "Nombre décimal" },
  { value: "decimal(18,2)", label: "Montant décimal" },
  { value: "boolean", label: "Booléen" },
  { value: "date", label: "Date" },
  { value: "timestamp", label: "Date et heure" },
];

const DATE_FORMATS = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%y", "%d.%m.%Y"];

const NORMALIZATIONS = [
  { value: "collapse_whitespace", label: "Espaces superflus retirés" },
  { value: "lowercase", label: "Minuscules, sans espaces" },
  { value: "compact_uppercase", label: "Majuscules, sans espaces" },
  { value: "trim", label: "Espaces de bord seulement" },
];

export const TREATMENTS = [
  { value: "hash", label: "Pseudonymiser (identifiant stable)" },
  { value: "mask", label: "Masquer partiellement" },
  { value: "drop", label: "Retirer des exports" },
  { value: "none", label: "Laisser en clair" },
];

/** The settings a rule card lets a person change, read from the plan. */
export function ruleParams(rule: ReviewRule, plan: TransformationPlan): RuleParam[] {
  const column = (name: string | undefined): ColumnPlan | undefined =>
    plan.columns.find((c) => c.source_column === name);
  const first = column(rule.columns[0]);
  const exclude: RuleParam = {
    kind: "exclude",
    label: "Colonne",
    value: "keep",
    options: [
      { value: "keep", label: "Conservée" },
      { value: "exclude", label: "Exclue de la table" },
    ],
  };
  switch (rule.kind) {
    case "cast": {
      if (!first) return [];
      const params: RuleParam[] = [
        {
          kind: "type",
          label: "Type",
          value: first.target_type,
          options: TYPE_OPTIONS,
        },
      ];
      if ((first.target_type === "date" || first.target_type === "timestamp") && first.from_text) {
        const current = first.cast?.date_format ?? "%Y-%m-%d";
        const formats = DATE_FORMATS.includes(current) ? DATE_FORMATS : [current, ...DATE_FORMATS];
        params.push({
          kind: "date_format",
          label: "Format de date",
          value: current,
          options: formats.map((f) => ({ value: f, label: formatLabel(f) })),
        });
      }
      const castable = first.rules?.find((r) => r.kind === "castable");
      if (castable) {
        params.push({
          kind: "invalid",
          label: "Valeur invalide",
          value: castable.enabled === false ? "empty" : "quarantine",
          options: [
            { value: "quarantine", label: "Mettre la ligne en quarantaine" },
            { value: "empty", label: "Mettre à vide et garder la ligne" },
          ],
        });
      }
      return [...params, exclude];
    }
    case "normalize":
      return [
        {
          kind: "normalization",
          label: "Écriture",
          value: first?.normalization ?? "collapse_whitespace",
          options: NORMALIZATIONS,
        },
      ];
    case "pii":
      return first
        ? [
            {
              kind: "treatment",
              label: `Traitement de ${piiLabel(first.pii_type)}`,
              value: first.pii_treatment ?? "none",
              options: TREATMENTS,
            },
            exclude,
          ]
        : [];
    case "format":
      return [exclude];
    default:
      return [];
  }
}

/** The plan patch for the values chosen in a rule card. */
export function paramsPatch(
  rule: ReviewRule,
  values: Partial<Record<ParamKind, string>>,
): PlanPatch {
  const change: ColumnPatch = {};
  if (values.type) change.target_type = values.type as ColumnPatch["target_type"];
  if (values.date_format) change.date_format = values.date_format;
  if (values.invalid) change.rules = { castable: values.invalid === "quarantine" };
  if (values.normalization) {
    change.normalization = values.normalization as ColumnPatch["normalization"];
  }
  if (values.treatment) change.pii_treatment = values.treatment as ColumnPatch["pii_treatment"];
  if (values.exclude === "exclude") change.included = false;
  const columns =
    rule.kind === "normalize"
      ? Object.fromEntries(rule.columns.map((name) => [name, change]))
      : rule.columns[0]
        ? { [rule.columns[0]]: change }
        : {};
  return { columns };
}

export type PlanChange = { column: string | null; text: string };

const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label.toLowerCase()]));
const TREATMENT_LABEL: Record<string, string> = {
  hash: "pseudonymisée",
  mask: "masquée",
  drop: "retirée des exports",
  none: "en clair",
};

/** What changed from one plan version to another, in French, column by column. */
export function diffPlans(before: TransformationPlan, after: TransformationPlan): PlanChange[] {
  const changes: PlanChange[] = [];
  const old = new Map(before.columns.map((c) => [c.source_column, c]));
  for (const column of after.columns) {
    const name = column.source_column;
    const previous = old.get(name);
    if (!previous) {
      changes.push({ column: name, text: "nouvelle colonne" });
      continue;
    }
    if (previous.included !== column.included) {
      changes.push({ column: name, text: column.included ? "réintégrée" : "exclue" });
    }
    if (previous.target_type !== column.target_type) {
      changes.push({
        column: name,
        text: `type ${TYPE_LABEL[previous.target_type] ?? previous.target_type} → ${
          TYPE_LABEL[column.target_type] ?? column.target_type
        }`,
      });
    }
    const pf = previous.cast?.date_format;
    const cf = column.cast?.date_format;
    if (pf !== cf && cf && column.target_type !== "varchar") {
      changes.push({ column: name, text: `format ${formatLabel(pf ?? "")} → ${formatLabel(cf)}` });
    }
    if (previous.normalization !== column.normalization) {
      changes.push({
        column: name,
        text: `écriture ${previous.normalization} → ${column.normalization}`,
      });
    }
    if (previous.pii_treatment !== column.pii_treatment) {
      changes.push({
        column: name,
        text: `${TREATMENT_LABEL[previous.pii_treatment ?? "none"]} → ${
          TREATMENT_LABEL[column.pii_treatment ?? "none"]
        }`,
      });
    }
    const enabled = (c: ColumnPlan) =>
      new Map((c.rules ?? []).map((r) => [r.kind, r.enabled !== false]));
    const was = enabled(previous);
    for (const [kind, on] of enabled(column)) {
      if (was.has(kind) && was.get(kind) !== on) {
        changes.push({ column: name, text: `règle ${kind} ${on ? "activée" : "désactivée"}` });
      }
    }
  }
  const key = (p: TransformationPlan) => p.primary_key?.columns.join(", ") ?? "";
  if (key(before) !== key(after)) {
    changes.push({
      column: null,
      text: key(after) ? `clé primaire : ${key(after)}` : "clé primaire retirée",
    });
  }
  const dedup = (p: TransformationPlan) => p.deduplication?.enabled !== false;
  if (dedup(before) !== dedup(after)) {
    changes.push({
      column: null,
      text: dedup(after) ? "déduplication activée" : "déduplication désactivée",
    });
  }
  return changes;
}

export const PLAN_STATUS: Record<
  TransformationPlan["status"],
  { kind: StatusKind; label: string }
> = {
  draft: { kind: "prop", label: "Brouillon" },
  approved: { kind: "val", label: "Approuvé" },
  applied: { kind: "app", label: "Appliqué" },
};
