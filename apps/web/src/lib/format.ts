/** French formatting shared by the screens: counts, percentages, dates, durations. */

const integer = new Intl.NumberFormat("fr-FR");
const oneDecimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatInteger(value: number): string {
  return integer.format(value);
}

/** 82.6 → « 82,6 ». */
export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

/** 0.943 → « 94 % » ; 0.9995 → « 99,9 % ». */
export function formatRatio(ratio: number): string {
  const percent = ratio * 100;
  if (percent >= 99 && percent < 100) return `${formatDecimal(Math.floor(percent * 10) / 10)} %`;
  return `${Math.round(percent)} %`;
}

/** « 1 règle », « 3 règles », « 4 812 lignes ». */
export function plural(count: number, one: string, many: string): string {
  return `${formatInteger(count)} ${Math.abs(count) > 1 ? many : one}`;
}

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const fullDate = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** As in the run list: « Auj. 10:42 », « Hier 16:58 », « 22/10 14:05 », « 03/01/2025 ». */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `Auj. ${time.format(date)}`;
  if (days === 1) return `Hier ${time.format(date)}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${dayMonth.format(date)} ${time.format(date)}`;
  }
  return fullDate.format(date);
}

/** « il y a 3 min », « il y a 2 h », « hier », « le 22/10/2026 ». */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "à l’instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `il y a ${Math.floor(seconds / 3600)} h`;
  if (days === 1) return "hier";
  return `le ${fullDate.format(date)}`;
}

/** « 03/01/2025 14:05 ». */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${fullDate.format(date)} ${time.format(date)}`;
}

/** Seconds as « 0:48 », « 4:12 », « 1:02:05 », as in the run list. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Seconds between two instants (or until now). */
export function secondsBetween(start: string, end: string | null | undefined, now = Date.now()) {
  return Math.max(0, ((end ? Date.parse(end) : now) - Date.parse(start)) / 1000);
}

/** Accent-insensitive, case-insensitive match, as in the command palette. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return fields.some((field) => field != null && normalizeText(field).includes(q));
}

/** Initials of an email: « thomas.lefevre@… » → TL. */
export function initialsOfEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

/** A pseudonym is 64 hex characters; the screens show its first ones. */
export function shortValue(value: string | null | undefined): string {
  if (value == null) return "(vide)";
  if (/^[0-9a-f]{64}$/.test(value)) return `${value.slice(0, 10)}…`;
  return value;
}
