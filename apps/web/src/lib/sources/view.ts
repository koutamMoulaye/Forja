import type { StatusKind } from "@/components/ui/status-badge";
import { formatDecimal, plural } from "@/lib/format";
import type {
  ColumnProfile,
  ProfileReport,
  Source,
  SourceVersion,
  TransformationPlan,
} from "@/lib/project/queries";

export const FORMAT_LABELS: Record<Source["format"], string> = {
  csv: "CSV",
  excel: "Excel",
  parquet: "Parquet",
  json: "JSON",
  database: "Base de données",
  api: "API",
};

/** Status of a source's Silver plan, as a badge. */
export function planBadge(plan: TransformationPlan | null | undefined): {
  kind: StatusKind;
  label: string;
} {
  if (!plan) return { kind: "queue", label: "En préparation" };
  switch (plan.status) {
    case "draft":
      return { kind: "prop", label: "À revoir" };
    case "approved":
      return { kind: "val", label: "Validé" };
    case "applied":
      return { kind: "app", label: "Appliqué" };
  }
}

/** « 82,6 » and its tone: green from 85, amber below. */
export function qualityView(score: number | null | undefined) {
  if (score == null) return null;
  return { label: formatDecimal(score), tone: score >= 85 ? "val" : "prop", width: score } as const;
}

/** Share of non-empty values, 0 to 100. */
export function fillRate(column: Pick<ColumnProfile, "null_pct">): number {
  return Math.max(0, Math.min(100, 100 - column.null_pct));
}

const TYPE_LABELS: Record<string, string> = {
  integer: "entier",
  decimal: "décimal",
  boolean: "booléen",
  date: "date",
  datetime: "date et heure",
  string: "texte",
  other: "autre",
  empty: "vide",
};

export function inferredTypeLabel(column: ColumnProfile): string {
  const base = TYPE_LABELS[column.inferred.inferred_type] ?? column.inferred.inferred_type;
  if (column.inferred.format && column.inferred.inferred_type.startsWith("date")) {
    return `${base} (${formatLabel(column.inferred.format)})`;
  }
  return base;
}

/** « %d/%m/%Y » → « JJ/MM/AAAA », as in the plan explanations. */
export function formatLabel(format: string): string {
  if (format === "iso8601") return "ISO 8601";
  return format
    .replaceAll("%Y", "AAAA")
    .replaceAll("%y", "AA")
    .replaceAll("%m", "MM")
    .replaceAll("%d", "JJ")
    .replaceAll("%H", "hh")
    .replaceAll("%M", "mm")
    .replaceAll("%S", "ss");
}

const PII_LABELS: Record<string, string> = {
  email: "email",
  phone: "téléphone",
  iban: "IBAN",
  first_name: "prénom",
  last_name: "nom",
  full_name: "nom complet",
};

export function piiLabel(type: string | null | undefined): string {
  return type ? (PII_LABELS[type] ?? type) : "";
}

const LEVEL_LABELS: Record<string, string> = {
  high: "confiance élevée",
  medium: "confiance moyenne",
  low: "confiance faible",
};

export function levelLabel(level: string | null | undefined): string {
  return level ? (LEVEL_LABELS[level] ?? level) : "";
}

/** Personal columns found by profiling, with medium or high confidence. */
export function personalColumns(profile: ProfileReport | null | undefined): string[] {
  return (profile?.pii ?? []).filter((p) => p.level !== "low").map((p) => p.column);
}

export type DriftLine = { tone: "add" | "remove" | "change"; text: string };

/** Schema drift of a version, one line per change. */
export function driftLines(version: Pick<SourceVersion, "schema_drift">): DriftLine[] {
  const drift = version.schema_drift;
  if (!drift) return [];
  const { added = [], removed = [], type_changed = [] } = drift;
  return [
    ...added.map((c) => ({ tone: "add" as const, text: `${c} ajoutée` })),
    ...removed.map((c) => ({ tone: "remove" as const, text: `${c} supprimée` })),
    ...type_changed.map((t) => ({
      tone: "change" as const,
      text: `${t.column} : ${t.previous_type} → ${t.new_type}`,
    })),
  ];
}

/** « 3 colonnes ajoutées, 1 supprimée » or « Schéma identique ». */
export function driftSummary(version: Pick<SourceVersion, "schema_drift" | "version">): string {
  const drift = version.schema_drift;
  if (version.version === 1 || !drift) return "Première version";
  if (!drift.has_drift) return "Schéma identique";
  const { added = [], removed = [], type_changed = [] } = drift;
  const parts = [
    added.length ? plural(added.length, "colonne ajoutée", "colonnes ajoutées") : "",
    removed.length ? plural(removed.length, "supprimée", "supprimées") : "",
    type_changed.length ? plural(type_changed.length, "type changé", "types changés") : "",
  ].filter(Boolean);
  return parts.join(", ");
}

export type SourceFilter = "all" | "review" | "pii" | "drift";

export function matchesSourceFilter(
  filter: SourceFilter,
  source: Source,
  plan: TransformationPlan | null | undefined,
  personal: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "review":
      return plan?.status === "draft";
    case "pii":
      return personal > 0;
    case "drift":
      return Boolean(source.schema_drift?.has_drift);
  }
}

export const QUALITY_COMPONENTS: Record<string, string> = {
  completeness: "Complétude",
  validity: "Validité",
  uniqueness: "Unicité",
  identifiability: "Identifiant",
  consistency: "Cohérence",
};

/** The components of the score, with a French explanation of each. */
export function qualityComponents(profile: ProfileReport) {
  const simpleKey = profile.candidate_keys.some((k) => k.kind === "simple");
  const meanNull =
    profile.columns.reduce((sum, c) => sum + c.null_pct, 0) / Math.max(1, profile.columns.length);
  const details: Record<string, string> = {
    completeness: `${formatDecimal(meanNull)} % de valeurs vides en moyenne`,
    uniqueness: `${formatDecimal(profile.duplicates.duplicate_pct)} % de lignes en double`,
    validity: "Part des valeurs conformes au type détecté",
    identifiability: simpleKey
      ? "Une colonne identifie chaque ligne"
      : profile.candidate_keys.length
        ? "Seules des clés composées identifient les lignes"
        : "Aucune clé candidate",
  };
  return profile.quality.components.map((component) => ({
    name: component.name,
    label: QUALITY_COMPONENTS[component.name] ?? component.name,
    value: Math.round(component.score * 100),
    details: details[component.name] ?? "",
  }));
}

/** What lowers the score, in French, read from the profile (personal data aside). */
export function qualityIssues(profile: ProfileReport): string[] {
  const issues: string[] = [];
  for (const column of profile.columns) {
    const inferred = column.inferred;
    if (inferred.inferred_type === "empty") {
      issues.push(`${column.name} est entièrement vide`);
    } else if (column.null_pct >= 50) {
      issues.push(`${column.name} est vide à ${formatDecimal(column.null_pct)} %`);
    }
    if (column.is_constant && inferred.inferred_type !== "empty") {
      issues.push(`${column.name} n’a qu’une seule valeur`);
    }
    if (inferred.near_type && inferred.near_type_ratio != null) {
      const type = TYPE_LABELS[inferred.near_type] ?? inferred.near_type;
      const share = Math.round(inferred.near_type_ratio * 100);
      issues.push(
        `${column.name} ressemble à un type ${type}, ${share} % des valeurs le respectent`,
      );
    } else if (
      inferred.from_text &&
      inferred.match_ratio < 1 &&
      !["string", "empty"].includes(inferred.inferred_type)
    ) {
      const share = formatDecimal((1 - inferred.match_ratio) * 100);
      issues.push(`${column.name} : ${share} % de valeurs non conformes`);
    }
  }
  if (profile.duplicates.duplicate_rows) {
    issues.push(plural(profile.duplicates.duplicate_rows, "ligne en double", "lignes en double"));
  }
  if (!profile.candidate_keys.length) issues.push("Aucune clé primaire candidate");
  return issues;
}
