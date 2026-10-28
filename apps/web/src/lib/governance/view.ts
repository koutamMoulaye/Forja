import { normalizeText } from "@/lib/format";
import type { AuditEntry, GoldPlan, TransformationPlan } from "@/lib/project/queries";

/** French labels of the audited actions; unknown ones are shown as they are. */
export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Connexion",
  "auth.refresh": "Session prolongée",
  "auth.refresh_reuse": "Jeton réutilisé, session révoquée",
  "auth.throttled": "Tentatives bloquées",
  "auth.password_changed": "Mot de passe changé",
  "auth.register": "Compte créé",
  "user.bootstrap": "Administrateur créé",
  "api_key.create": "Clé API créée",
  "api_key.revoke": "Clé API révoquée",
  "agent.request": "Question posée à l’agent",
  "agent.answer": "Précision donnée à l’agent",
  "agent.refine": "Data mart affiné",
  "mart.validate": "Aperçu validé",
  "mart.approve": "Data mart approuvé",
  "mart.publish": "Data mart publié",
  "mart.reject": "Data mart rejeté",
  "project.create": "Projet créé",
  "member.invite": "Invitation envoyée",
  "member.register": "Compte créé sur invitation",
  "member.role": "Rôle modifié",
  "member.remove": "Membre retiré",
  "member.invitation_revoke": "Invitation révoquée",
  "source.upload": "Fichier chargé",
  "source.bronze_preview": "Aperçu brut consulté",
  "silver_plan.edit": "Plan Silver modifié",
  "silver_plan.review": "Règles décidées",
  "silver_plan.approve": "Plan Silver approuvé",
  "relation.declare": "Relation déclarée",
  "relation.confirm": "Relation confirmée",
  "relation.reject": "Relation rejetée",
  "gold_plan.propose": "Modèle proposé",
  "gold_plan.edit": "Modèle modifié",
  "gold_plan.approve": "Modèle validé",
  "run.cancel": "Run annulé",
  "table.publish": "Table publiée",
  "table.unpublish": "Table retirée",
  "table.export": "Table exportée",
  "semantic.edit": "Couche sémantique modifiée",
  "semantic.regenerate": "Couche sémantique régénérée",
  "synonym.propose": "Synonyme proposé",
  "synonym.accept": "Synonyme validé",
  "synonym.reject": "Synonyme rejeté",
  "settings.llm": "Fournisseur IA changé",
  "settings.llm_test": "Connexion IA testée",
};

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith("run.")) return `Run lancé (${action.slice(4)})`;
  if (action.startsWith("mart.")) return `Data mart : ${action.slice(5)}`;
  return action;
}

export const OBJECT_LABELS: Record<string, string> = {
  source: "Source",
  silver_plan: "Plan Silver",
  gold_plan: "Plan Gold",
  relation: "Relation",
  run: "Run",
  table: "Table",
  semantic_layer: "Couche sémantique",
  synonym_proposal: "Synonyme",
  mart_request: "Data mart",
  invitation: "Invitation",
  user: "Utilisateur",
  project: "Projet",
  api_key: "Clé API",
  settings: "Réglages",
};

export type AuditPeriod = "all" | "day" | "week" | "month";

export type AuditFilters = {
  user: string | null;
  action: string | null;
  object: string | null;
  period: AuditPeriod;
  query: string;
};

export const NO_FILTER: AuditFilters = {
  user: null,
  action: null,
  object: null,
  period: "all",
  query: "",
};

const PERIOD_MS: Record<AuditPeriod, number> = {
  all: Number.POSITIVE_INFINITY,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

/** A short, readable summary of an entry's details: names, versions, counts. */
export function auditSummary(entry: AuditEntry): string {
  const d = entry.details ?? {};
  const parts: string[] = [];
  for (const key of ["name", "filename", "email", "from", "to", "target", "synonym", "format"]) {
    const value = d[key];
    if (typeof value === "string" && value) parts.push(key === "to" ? `→ ${value}` : value);
  }
  if (typeof d.version === "number") parts.push(`v${d.version}`);
  if (typeof d.rows === "number") parts.push(`${d.rows} lignes`);
  if (typeof d.role === "string") parts.push(d.role);
  if (typeof d.provider === "string") parts.push(d.provider);
  return parts.join(" · ");
}

export function filterAudit(
  entries: AuditEntry[],
  filters: AuditFilters,
  now: number = Date.now(),
): AuditEntry[] {
  return entries.filter((entry) => {
    if (filters.user && (entry.user_email ?? "système") !== filters.user) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.object && entry.object_type !== filters.object) return false;
    if (now - Date.parse(entry.at) > PERIOD_MS[filters.period]) return false;
    if (filters.query.trim()) {
      const haystack = normalizeText(
        [
          entry.user_email,
          entry.action,
          actionLabel(entry.action),
          entry.object_type,
          entry.object_id,
          auditSummary(entry),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!haystack.includes(normalizeText(filters.query.trim()))) return false;
    }
    return true;
  });
}

/** Distinct values of the entries for the filter menus, most frequent first. */
export function auditFacets(entries: AuditEntry[]) {
  const count = (values: string[]) => {
    const map = new Map<string, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
  };
  return {
    users: count(entries.map((e) => e.user_email ?? "système")),
    actions: count(entries.map((e) => e.action)),
    objects: count(entries.map((e) => e.object_type).filter((o): o is string => Boolean(o))),
  };
}

const TREATMENTS: Record<string, string> = {
  hash: "Pseudonymisée",
  mask: "Masquée",
  drop: "Retirée",
  none: "En clair",
};

export type PersonalColumn = {
  source: string;
  column: string;
  type: string;
  confidence: string;
  silver: string;
  gold: string;
  serving: string;
  analyst: string;
  /** Left in clear where an engineer reads it: worth a look. */
  exposed: boolean;
};

const PII_TYPES: Record<string, string> = {
  email: "Email",
  phone: "Téléphone",
  iban: "IBAN",
  first_name: "Prénom",
  last_name: "Nom",
  full_name: "Nom complet",
};

const LEVELS: Record<string, string> = { high: "élevée", medium: "moyenne", low: "faible" };

/**
 * Every personal column of the project and its treatment by layer: Silver keeps it in
 * clear inside Forja; Gold takes the dimension attribute's treatment (or the Silver
 * plan's); serving and exports apply it; analysts always get a pseudonym at least.
 */
export function personalDataMap(
  plans: TransformationPlan[],
  gold: GoldPlan | null,
): PersonalColumn[] {
  const rows: PersonalColumn[] = [];
  for (const plan of plans) {
    for (const column of plan.columns) {
      if (!column.pii_type) continue;
      const treatment = column.pii_treatment ?? "none";
      const attribute = gold?.dimensions
        ?.filter((d) => d.source === plan.source_name)
        .flatMap((d) => (d.attributes ?? []).map((a) => ({ d, a })))
        .find(({ a }) => a.column === column.target_column);
      const goldTreatment = attribute ? (attribute.a.pii_treatment ?? treatment) : null;
      const served = column.included ? TREATMENTS[treatment]! : "Exclue";
      rows.push({
        source: plan.source_name,
        column: column.target_column,
        type: PII_TYPES[column.pii_type] ?? column.pii_type,
        confidence: column.pii_level ? (LEVELS[column.pii_level] ?? column.pii_level) : "",
        silver: column.included ? "En clair, interne" : "Exclue",
        gold: goldTreatment ? `${TREATMENTS[goldTreatment]} (${attribute!.d.name})` : "Non reprise",
        serving: served,
        analyst:
          !column.included || treatment === "drop"
            ? "Invisible"
            : treatment === "mask"
              ? "Masquée"
              : "Pseudonymisée",
        exposed: column.included && treatment === "none",
      });
    }
  }
  return rows;
}
