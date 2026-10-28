import type { components } from "@/lib/api/schema";
import type { StatusKind } from "@/components/ui/status-badge";
import type { CheckOutcome } from "@/components/ui/check-badge";
import { formatInteger, normalizeText } from "@/lib/format";
import type { Job } from "@/lib/project/use-runs";

type S = components["schemas"];
export type MartRequest = S["MartRequest"];
export type MartIteration = S["MartIteration"];
export type SummaryPart = S["SummaryPart"];
export type SummaryTerm = S["SummaryTerm"];
export type OptionCount = S["OptionCount"];
export type Control = S["Control"];
export type AgentOverview = S["AgentOverview"];
export type Destination = NonNullable<MartRequest["destination"]>;

/** The latest version of a request, the one the conversation is about. */
export function latestIteration(request: MartRequest): MartIteration | null {
  const iterations = request.iterations ?? [];
  return iterations[iterations.length - 1] ?? null;
}

/** The latest version with a preview: what « Ouvrir l’aperçu » shows. */
export function previewedIteration(request: MartRequest): MartIteration | null {
  const iterations = request.iterations ?? [];
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index]!;
    if (iteration.status === "previewed" && iteration.preview) return iteration;
  }
  return null;
}

export function isProcessing(request: MartRequest): boolean {
  return latestIteration(request)?.status === "processing";
}

/** Waiting for an engineer: validated, approval required and not given yet. */
export function awaitsApproval(request: MartRequest): boolean {
  return request.status === "validated" && !request.approved_at && !request.publish_job_id;
}

export function isPublishing(request: MartRequest): boolean {
  return request.status === "validated" && Boolean(request.publish_job_id);
}

export type PublicationStep = {
  id: "validated" | "pending" | "approved" | "rejected" | "published";
  label: string;
  detail: string | null;
  at: string | null;
  state: "done" | "current" | "fail";
};

/**
 * What happened after the author validated: the wait for an engineer is shown whenever
 * it took place (approved later than validated, rejected, or still waiting), and is
 * left out when the author approved their own request at validation.
 */
export function publicationSteps(request: MartRequest): PublicationStep[] {
  if (!request.validated_at) return [];
  const steps: PublicationStep[] = [
    {
      id: "validated",
      label: "Validé",
      detail: request.owner_email ?? null,
      at: request.validated_at,
      state: "done",
    },
  ];
  const selfApproved = Boolean(request.approved_at) && request.approved_at === request.validated_at;
  if (!selfApproved) {
    steps.push({
      id: "pending",
      label: "En attente d’approbation",
      detail: null,
      at: request.validated_at,
      state: awaitsApproval(request) ? "current" : "done",
    });
  }
  if (request.status === "rejected") {
    steps.push({
      id: "rejected",
      label: "Rejeté",
      detail: request.rejection_reason || null,
      at: request.updated_at,
      state: "fail",
    });
    return steps;
  }
  if (request.approved_at && !selfApproved) {
    steps.push({
      id: "approved",
      label: "Approuvé",
      detail: request.approved_by_email ?? null,
      at: request.approved_at,
      state: "done",
    });
  }
  if (request.status === "published") {
    steps.push({
      id: "published",
      label: "Publié",
      detail: request.destination ? destinationLabel(request.destination) : null,
      at: request.published_at ?? null,
      state: "done",
    });
  } else if (isPublishing(request)) {
    steps.push({
      id: "published",
      label: request.publish_error ? "Échec de publication" : "Publication en cours",
      detail: request.publish_error ?? null,
      at: null,
      state: request.publish_error ? "fail" : "current",
    });
  }
  return steps;
}

function sentence(text: string): string {
  return text.replace(/\.\s*$/, "");
}

/**
 * Name of a data mart in lists: its summary up to the first comma (« Chiffre d’affaires
 * par mois et par ville »), else the question as asked.
 */
export function martTitle(request: MartRequest): string {
  const previewed = previewedIteration(request);
  const parts = previewed?.summary_parts ?? [];
  // Metrics and axes; the period, filters and limit stay in the summary.
  const cut = parts.findIndex((p) => p.term && ["period", "filter", "limit"].includes(p.term.kind));
  const fromParts = parts.length
    ? sentence(
        parts
          .slice(0, cut < 0 ? parts.length : cut)
          .map((p) => p.text)
          .join(""),
      ).replace(/,\s*$/, "")
    : null;
  const summary = fromParts ?? previewed?.summary ?? request.model_summary;
  if (summary) {
    const head = fromParts ?? sentence(summary).split(", ")[0]!;
    return head.length > 72 ? `${head.slice(0, 71)}…` : head;
  }
  return request.question;
}

export type MartFilter = "all" | "draft" | "pending" | "published";

export const MART_FILTERS: { id: MartFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "draft", label: "Brouillons" },
  { id: "pending", label: "En attente" },
  { id: "published", label: "Publiés" },
];

/** Drafts: being prepared or ready to check; pending: validated, before publication. */
export function martGroup(request: MartRequest): Exclude<MartFilter, "all"> | "rejected" {
  if (request.status === "published") return "published";
  if (request.status === "validated") return "pending";
  if (request.status === "rejected") return "rejected";
  return "draft";
}

export function filterMarts(requests: MartRequest[], filter: MartFilter): MartRequest[] {
  const sorted = [...requests].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (filter === "all") return sorted;
  return sorted.filter((request) => martGroup(request) === filter);
}

export function countByFilter(requests: MartRequest[]): Record<MartFilter, number> {
  const counts: Record<MartFilter, number> = { all: 0, draft: 0, pending: 0, published: 0 };
  for (const request of requests) {
    counts.all += 1;
    const group = martGroup(request);
    if (group !== "rejected") counts[group] += 1;
  }
  return counts;
}

export type MartBadge = { kind: StatusKind; label: string };

/** Status pill of a request, as the analyst reads it. */
export function martBadge(request: MartRequest): MartBadge {
  const latest = latestIteration(request);
  switch (request.status) {
    case "published":
      return { kind: "pub", label: "Publié" };
    case "rejected":
      return { kind: "rej", label: "Rejeté" };
    case "validated":
      if (isPublishing(request)) {
        return request.publish_error
          ? { kind: "err", label: "Échec de publication" }
          : { kind: "run", label: "Publication" };
      }
      return { kind: "queue", label: "En attente d’approbation" };
    default:
      if (latest?.status === "processing") return { kind: "run", label: "En préparation" };
      if (latest?.status === "clarification") return { kind: "prop", label: "Une question" };
      if (request.status === "previewed") return { kind: "prop", label: "À vérifier" };
      if (latest?.status === "refused") return { kind: "rej", label: "Hors périmètre" };
      if (latest?.status === "failed") return { kind: "err", label: "Interrompu" };
      return { kind: "queue", label: "Brouillon" };
  }
}

export const DESTINATIONS: {
  id: Destination;
  label: string;
  description: string;
}[] = [
  { id: "powerbi", label: "Power BI", description: "Base serving, actualisée à chaque run" },
  { id: "superset", label: "Superset", description: "Table dans la base serving partagée" },
  { id: "csv", label: "Fichier CSV", description: "Téléchargement, pour un tableur" },
  { id: "parquet", label: "Fichier Parquet", description: "Pour les équipes data" },
];

/** The destination chosen at validation; a mart published without one is in the serving base. */
export function destinationLabel(
  destination: Destination | null | undefined,
  published = false,
): string {
  return (
    DESTINATIONS.find((d) => d.id === destination)?.label ?? (published ? "Base serving" : "—")
  );
}

/** A metric's definition for analysts: its description, unless it is only a formula. */
export function businessDescription(metric: {
  label: string;
  description?: string | null;
  formula: string;
  kind?: string | null;
  aggregation?: string | null;
}): string {
  const text = metric.description?.trim() ?? "";
  const technical = !text || /^\w+\(.*\)( sur \w+)?$/.test(text) || text === metric.formula;
  if (!technical) return text;
  switch (metric.aggregation) {
    case "count_distinct":
      return `${metric.label}, chaque élément compté une seule fois.`;
    case "count":
      return `${metric.label} sur le périmètre choisi.`;
    case "min":
    case "max":
      return `${metric.label} : valeur ${metric.aggregation === "min" ? "la plus basse" : "la plus haute"}.`;
    default:
      return metric.kind === "ratio"
        ? `${metric.label}, recalculé à chaque niveau d’analyse.`
        : `${metric.label} : somme sur la période et le périmètre choisis.`;
  }
}

/** How the request was understood, without jargon. */
export function pathLabel(path: MartIteration["path"]): string | null {
  switch (path) {
    case "parser":
      return "Réponse immédiate";
    case "llm_cache":
      return "Réponse immédiate, question déjà analysée";
    case "llm":
      return "Analyse approfondie";
    default:
      return null;
  }
}

/** « 1 284 clients », « 48 210 € ». */
export function formatOptionCount(count: OptionCount | null | undefined): string | null {
  if (!count) return null;
  switch (count.format) {
    case "currency":
      return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(count.value);
    case "percent":
      return `${Math.round(count.value * 100)} %`;
    case "decimal":
      return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(count.value);
    default:
      return `${formatInteger(count.value)}${count.unit ? ` ${count.unit}` : ""}`;
  }
}

export function controlOutcome(control: Control): CheckOutcome {
  if (control.status === "error") return "fail";
  if (control.status === "warning") return "warn";
  return "pass";
}

/** « 4 contrôles réussis, 1 à surveiller ». */
export function controlsSummary(controls: Control[]): string {
  const failed = controls.filter((c) => c.status === "error").length;
  const warned = controls.filter((c) => c.status === "warning").length;
  const passed = controls.length - failed - warned;
  const parts = [
    passed ? `${passed} ${passed > 1 ? "contrôles réussis" : "contrôle réussi"}` : null,
    warned ? `${warned} à surveiller` : null,
    failed ? `${failed} en échec` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Aucun contrôle";
}

/** Short name of a check badge, from its code (the message stays in the tooltip). */
export function controlLabel(control: Control): string {
  if (control.code === "reconciliation") {
    const metric = control.message.split(" : ")[0]!.split(" n'est pas")[0]!;
    if (control.status === "ok") return `${metric} : total exact`;
    if (control.status === "error") return `${metric} : écart de total`;
    return `${metric} : non additive`;
  }
  if (control.code === "unknown_member") {
    const dimension = /membre (?:inconnu )?de ([^.:]+)/.exec(control.message)?.[1]?.trim();
    if (control.status === "ok") {
      return dimension ? `Rattachement complet : ${dimension}` : "Lignes rattachées";
    }
    return dimension ? `Rattachement incomplet : ${dimension}` : "Lignes non rattachées";
  }
  const labels: Record<string, Partial<Record<Control["status"], string>>> = {
    null_column: { ok: "Aucune colonne vide", warning: "Colonne vide", info: "Valeurs manquantes" },
    empty_period: { warning: "Période sans données" },
    empty: { warning: "Data mart vide" },
  };
  return labels[control.code]?.[control.status] ?? control.message.split(". ")[0]!;
}

/** Recent conversations of the sidebar, most recent first. */
export function recentConversations(requests: MartRequest[], limit = 6): MartRequest[] {
  return [...requests]
    .filter((request) => request.status !== "rejected" || request.iterations?.length)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

/**
 * Questions offered on the home page and after a refusal: the agent's verified ones,
 * then none of those the user just asked (accents and case ignored).
 */
export function pickSuggestions(
  overview: AgentOverview | null | undefined,
  asked: string[] = [],
  limit = 4,
): string[] {
  const seen = new Set(asked.map((q) => normalizeText(q.trim())));
  const out: string[] = [];
  for (const suggestion of overview?.suggestions ?? []) {
    const key = normalizeText(suggestion.trim());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length === limit) break;
  }
  return out;
}

/** The parts of « Ce que Forja a compris », the summary when the parts are missing. */
export function summaryParts(iteration: MartIteration): SummaryPart[] {
  if (iteration.summary_parts?.length) return iteration.summary_parts;
  return iteration.summary ? [{ text: iteration.summary }] : [];
}

/** Whether a finished publication or preview run deserves a notice. */
export function finishedRecently(job: Job | null | undefined, now = Date.now()): boolean {
  return Boolean(job?.finished_at && now - Date.parse(job.finished_at) < 10 * 60_000);
}

export type ConversationState =
  "working" | "question" | "ready" | "refused" | "failed" | "pending" | "published" | "rejected";

export type ConversationOutcome = {
  state: ConversationState;
  title: string;
  detail: string;
  tone: "success" | "info" | "error";
  /** Where the outcome is read: the preview once there is one, else the conversation. */
  href: (projectId: string) => string;
};

/** Where a conversation stands, as a notice would say it. */
export function conversationOutcome(request: MartRequest): ConversationOutcome {
  const latest = latestIteration(request);
  const name = martTitle(request);
  const ask = (projectId: string) => `/projects/${projectId}/ask/${request.id}`;
  const preview = (projectId: string) => `/projects/${projectId}/marts/${request.id}/preview`;
  if (latest?.status === "processing" || (isPublishing(request) && !request.publish_error)) {
    return {
      state: "working",
      title: "Préparation en cours",
      detail: name,
      tone: "info",
      href: ask,
    };
  }
  switch (request.status) {
    case "published":
      return {
        state: "published",
        title: "Data mart publié",
        detail: request.destination ? `${name} · ${destinationLabel(request.destination)}` : name,
        tone: "success",
        href: preview,
      };
    case "rejected":
      return {
        state: "rejected",
        title: "Data mart rejeté",
        detail: request.rejection_reason ? `${name} · ${request.rejection_reason}` : name,
        tone: "error",
        href: ask,
      };
    case "validated":
      return request.publish_error
        ? {
            state: "failed",
            title: "Échec de la publication",
            detail: name,
            tone: "error",
            href: preview,
          }
        : {
            state: "pending",
            title: "En attente d’approbation",
            detail: name,
            tone: "info",
            href: preview,
          };
  }
  if (latest?.status === "clarification") {
    return {
      state: "question",
      title: "Une question pour vous",
      detail: name,
      tone: "info",
      href: ask,
    };
  }
  if (latest?.status === "refused") {
    return {
      state: "refused",
      title: "Demande hors périmètre",
      detail: latest.refusal ?? name,
      tone: "info",
      href: ask,
    };
  }
  if (latest?.status === "failed") {
    return {
      state: "failed",
      title: latest.error === "annulée" ? "Préparation annulée" : "Préparation interrompue",
      detail: name,
      tone: "error",
      href: ask,
    };
  }
  return {
    state: "ready",
    title: "Aperçu prêt à vérifier",
    detail: name,
    tone: "success",
    href: preview,
  };
}

const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** « mis à jour ce matin à 06:00 », « mis à jour hier à 18:02 », « mis à jour le 22 octobre ». */
export function freshnessLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "données pas encore construites";
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  const time = clock.format(date);
  if (days === 0) {
    const part =
      date.getHours() < 12 ? "ce matin" : date.getHours() < 18 ? "cet après-midi" : "ce soir";
    return `mis à jour ${part} à ${time}`;
  }
  if (days === 1) return `mis à jour hier à ${time}`;
  return `mis à jour le ${day.format(date)}`;
}

/** « Bonjour Claire »: the first name given at registration, else the email's first part. */
export function greetingName(user: { name?: string | null; email: string }): string {
  const first = user.name?.trim().split(/\s+/)[0];
  if (first) return first;
  const local = user.email.split("@")[0]?.split(/[._-]+/)[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

type LayerLike = {
  metrics?: { name: string; label: string; hidden?: boolean; default?: boolean; fact: string }[];
};
type SpecLike = NonNullable<MartIteration["spec"]>;

/** Adjustments offered under « Affiner »: phrases the parser understands. */
export function refineSuggestions(
  spec: SpecLike | null | undefined,
  layer: LayerLike | null | undefined,
): string[] {
  if (!spec) return [];
  const out: string[] = [];
  const fact = layer?.metrics?.find((m) => m.name === spec.metrics[0])?.fact;
  const extra = layer?.metrics?.find(
    (m) => !m.hidden && m.default && m.fact === fact && !spec.metrics.includes(m.name),
  );
  if (extra) out.push(`Ajoute ${extra.label.charAt(0).toLowerCase()}${extra.label.slice(1)}`);
  if (spec.time_grain === "mois") out.push("Par trimestre");
  else out.push("Par mois");
  const year = spec.period?.label && /^\d{4}$/.test(spec.period.label) ? spec.period.label : null;
  out.push(year ? `Seulement le T1 ${year}` : "Seulement le T1");
  const axes = spec.axes ?? [];
  if (axes.length)
    out.push(`Retire ${axes[axes.length - 1]!.split(".").pop()!.replace(/_/g, " ")}`);
  return out.slice(0, 3);
}

export type LineageNode = { name: string; kind: "fact" | "dimension" | "mart"; detail: string };

/** « D’où viennent les chiffres »: the fact and the dimensions the compiled SQL reads. */
export function lineage(iteration: MartIteration): LineageNode[] {
  const sql = iteration.sql ?? "";
  const fact = /\bfrom\s+"?([a-z0-9_]+)"?\s+as\s+f\b/i.exec(sql)?.[1];
  const joins = [...sql.matchAll(/\bjoin\s+"?([a-z0-9_]+)"?\s+as\s+"?([a-z0-9_]+)"?/gi)];
  const nodes: LineageNode[] = [];
  if (fact) nodes.push({ name: fact, kind: "fact", detail: "faits" });
  const seen = new Set<string>();
  for (const [, table, alias] of joins) {
    if (!table || seen.has(table)) continue;
    seen.add(table);
    const filtered = (iteration.spec?.filters ?? []).some((f) => f.field.split(".")[0] === alias);
    nodes.push({ name: table, kind: "dimension", detail: filtered ? "filtre appliqué" : "axe" });
  }
  const rows = iteration.preview?.row_count;
  nodes.push({
    name: "Data mart",
    kind: "mart",
    detail:
      rows === undefined ? "aperçu" : `${formatInteger(rows)} ${rows > 1 ? "lignes" : "ligne"}`,
  });
  return nodes;
}

/** The figure of the total card: the first metric reconciled with the fact. */
export function mainTotal(
  iteration: MartIteration,
): { metric: string; label: string; value: number } | null {
  for (const control of iteration.preview?.controls ?? []) {
    const details = control.details as { metric?: string; mart_total?: number } | undefined;
    if (
      control.code === "reconciliation" &&
      control.status !== "info" &&
      details?.metric !== undefined
    ) {
      if (typeof details.mart_total !== "number") continue;
      return {
        metric: details.metric,
        label: control.message.split(" : ")[0]!,
        value: details.mart_total,
      };
    }
  }
  return null;
}
