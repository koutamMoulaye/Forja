import { Globe, HardDrives, type Icon } from "@phosphor-icons/react";
import type { StatusKind } from "@/components/ui/status-badge";
import type { Connection, ConnectionType, Schedule } from "@/lib/connections/queries";

export type DatabaseType = Exclude<ConnectionType, "rest_api">;

export const CONNECTION_TYPES: Record<
  ConnectionType,
  { label: string; short: string; icon: Icon; port: number | null }
> = {
  postgres: { label: "PostgreSQL", short: "PostgreSQL", icon: HardDrives, port: 5432 },
  mysql: { label: "MySQL ou MariaDB", short: "MySQL", icon: HardDrives, port: 3306 },
  sqlserver: { label: "SQL Server", short: "SQL Server", icon: HardDrives, port: 1433 },
  rest_api: { label: "API REST", short: "API", icon: Globe, port: null },
};

export const DATABASE_TYPES: DatabaseType[] = ["postgres", "mysql", "sqlserver"];

/** Icon of a source on the canvas and in the lists: a file, a database or an API. */
export function originIcon(format: string): Icon | null {
  if (format === "database") return HardDrives;
  if (format === "api") return Globe;
  return null;
}

/** State of a connection, as a badge. */
export function connectionState(connection: Connection): { kind: StatusKind; label: string } {
  if (connection.active_run) return { kind: "run", label: "Chargement" };
  if (connection.last_test && !connection.last_test.ok)
    return { kind: "err", label: "Injoignable" };
  if (!(connection.sources ?? []).some((s) => s.loaded))
    return { kind: "queue", label: "Jamais chargée" };
  return { kind: "val", label: "Active" };
}

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A moment to come: « Auj. 06:00 », « Demain 06:00 », « lun. 03/11 06:00 ». */
export function formatNext(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return `Auj. ${time.format(date)}`;
  if (days === 1) return `Demain ${time.format(date)}`;
  return `${weekday.format(date)} ${time.format(date)}`;
}

/** The soonest scheduled load of a source: its own schedule or its connection's. */
export function nextLoad(
  schedules: Schedule[],
  sourceId: string,
  connectionId: string | null | undefined,
): Schedule | null {
  const candidates = schedules.filter(
    (s) =>
      s.enabled &&
      s.next_run_at &&
      ((s.target_type === "source" && s.target_id === sourceId) ||
        (s.target_type === "connection" && s.target_id === connectionId)),
  );
  candidates.sort((a, b) => (a.next_run_at! < b.next_run_at! ? -1 : 1));
  return candidates[0] ?? null;
}

/** Quick choices of the schedule step; any phrase or cron expression can be typed too. */
export const SCHEDULE_PRESETS = [
  "Manuel",
  "Toutes les heures",
  "Tous les jours à 6 h",
  "Du lundi au vendredi à 7 h",
  "Chaque lundi à 6 h",
] as const;

export const PAGINATION_LABELS = {
  none: "Aucune (une seule page)",
  page_number: "Numéro de page",
  offset: "Décalage (offset et limite)",
  cursor: "Curseur",
  link_header: "En-tête Link",
  next_url: "URL de la page suivante",
} as const;

export const AUTH_LABELS = {
  none: "Aucune",
  api_key: "Clé d’API",
  bearer: "Jeton Bearer",
  basic: "Utilisateur et mot de passe (Basic)",
  oauth2_client_credentials: "OAuth2 (client credentials)",
} as const;

export type PaginationKind = keyof typeof PAGINATION_LABELS;
export type AuthKind = keyof typeof AUTH_LABELS;

/** Secret fields asked by each authentication. */
export function authSecret(kind: AuthKind): { field: string; label: string } | null {
  switch (kind) {
    case "api_key":
      return { field: "api_key", label: "Clé" };
    case "bearer":
      return { field: "token", label: "Jeton" };
    case "basic":
      return { field: "password", label: "Mot de passe" };
    case "oauth2_client_credentials":
      return { field: "client_secret", label: "Secret client" };
    case "none":
      return null;
  }
}

/** « ≈ 1 284 310 lignes » estimated by the database, before its statistics exist too. */
export function estimateLabel(rows: number | null | undefined): string {
  if (rows == null) return "taille inconnue";
  return `≈ ${new Intl.NumberFormat("fr-FR").format(rows)} ligne${rows > 1 ? "s" : ""}`;
}
