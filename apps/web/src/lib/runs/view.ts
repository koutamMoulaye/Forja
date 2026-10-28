import type { StatusKind } from "@/components/ui/status-badge";
import { formatClock, formatInteger, secondsBetween } from "@/lib/format";
import { JOB_TEXT, isActive, type Job, type JobStatus } from "@/lib/project/use-runs";

export type RunFilter = "all" | "running" | "failed";

export function matchesRunFilter(filter: RunFilter, run: Job): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return isActive(run.status);
    case "failed":
      return run.status === "failed";
  }
}

export const RUN_STATUS: Record<JobStatus, { kind: StatusKind; label: string }> = {
  queued: { kind: "queue", label: "En attente" },
  running: { kind: "run", label: "En cours" },
  succeeded: { kind: "app", label: "Réussi" },
  failed: { kind: "err", label: "Échec" },
  cancelled: { kind: "rej", label: "Annulé" },
};

/** « Nettoyage » and what it covered: « clients, commandes » or « tout le projet ». */
export function runTitle(
  run: Job,
  sourceNames: Map<string, string>,
): { op: string; scope: string } {
  const op = JOB_TEXT[run.type]?.label ?? run.type;
  const ids = run.params.source_ids ?? [];
  if (ids.length) {
    return { op, scope: ids.map((id) => sourceNames.get(id) ?? id.slice(0, 8)).join(", ") };
  }
  const scope: Record<string, string> = {
    build_gold: "modèle en étoile",
    gold_proposal: "modèle en étoile",
    export: "tables publiées",
    publish_mart: "data mart",
    mart_request: "question en français",
  };
  return { op, scope: scope[run.type] ?? "tout le projet" };
}

/** Short id shown in mono, as « run_0418 » in the mockups: the first characters. */
export function runCode(run: Pick<Job, "id">): string {
  return `run_${run.id.slice(0, 6)}`;
}

export function runDurationClock(run: Job, now = Date.now()): string {
  if (!run.started_at) return "—";
  return formatClock(secondsBetween(run.started_at, run.finished_at, now));
}

/** Who started it: you, someone else, or nobody (a schedule, the system). */
export function runTrigger(run: Job, meId: string): string {
  if (!run.created_by) return "Planifié";
  return run.created_by === meId ? "Vous" : "Un membre";
}

export type StepState = "done" | "run" | "err" | "rej" | "idle";
export type RunStep = { name: string; state: StepState; detail: string };

const MODEL_LABELS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^stg_(.+)__rejects$/, (m) => `Quarantaine de ${m[1]}`],
  [/^stg_(.+)$/, (m) => `Nettoyage de ${m[1]}`],
  [/^snap_(.+)$/, (m) => `Historisation de ${m[1]}`],
  [/^(dim_.+|fct_.+)$/, (m) => `Construction de ${m[1]}`],
  [/^mart_(.+)$/, (m) => `Data mart ${m[1]}`],
];

export function modelLabel(name: string): string {
  for (const [pattern, label] of MODEL_LABELS) {
    const match = name.match(pattern);
    if (match) return label(match);
  }
  return name;
}

/**
 * Steps of a run, table by table: from its progress while it runs, from its metrics once
 * it is done. Quarantine models are folded into their table.
 */
export function runSteps(run: Job): RunStep[] {
  const progress = run.progress;
  const metrics = run.metrics;
  const steps = new Map<string, RunStep>();
  const add = (name: string, state: StepState, detail = "") => {
    if (name.endsWith("__rejects")) return;
    steps.set(name, { name: modelLabel(name), state, detail });
  };
  for (const source of metrics?.sources ?? []) {
    add(
      source.model,
      source.model_status === "error" ? "err" : "done",
      `${formatInteger(source.rows_valid ?? 0)} lignes`,
    );
  }
  for (const model of metrics?.models ?? []) {
    if (!steps.has(model.name)) {
      add(
        model.name,
        model.status === "error" ? "err" : "done",
        `${formatInteger(model.rows)} lignes`,
      );
    }
  }
  for (const name of progress?.done ?? []) if (!steps.has(name)) add(name, "done");
  for (const name of progress?.failed ?? []) add(name, "err");
  if (isActive(run.status)) {
    for (const name of progress?.running ?? [])
      add(name, "run", progress?.percent != null ? `${progress.percent} %` : "");
  }
  const list = [...steps.values()];
  if (run.status === "cancelled") {
    list.push({ name: "Arrêt du run", state: "rej", detail: "Annulé" });
  }
  if (!list.length) {
    const label = JOB_TEXT[run.type]?.label ?? run.type;
    const state: StepState =
      run.status === "succeeded"
        ? "done"
        : run.status === "failed"
          ? "err"
          : run.status === "cancelled"
            ? "rej"
            : run.status === "running"
              ? "run"
              : "idle";
    list.push({
      name: progress?.message ? `${label} : ${progress.message}` : label,
      state,
      detail: state === "run" && progress?.percent != null ? `${progress.percent} %` : "",
    });
  }
  return list;
}

export type RunFigure = { label: string; value: string; tone?: "prop" };

/** Rows read, valid, rejected, duplicates and rows tied to an unknown member. */
export function runFigures(run: Job): RunFigure[] {
  const m = run.metrics;
  const pending = isActive(run.status) && !m;
  const value = (n: number | undefined) => (pending || n === undefined ? "…" : formatInteger(n));
  const unknown = (m?.unknown_member_rows ?? []).reduce((sum, u) => sum + u.rows, 0);
  return [
    { label: "Lignes lues", value: value(m?.rows_read) },
    { label: "Valides", value: value(m?.rows_valid) },
    {
      label: "Rejetées",
      value: value(m?.rows_rejected),
      tone: m?.rows_rejected ? "prop" : undefined,
    },
    {
      label: "Doublons",
      value: value(m?.duplicates_removed),
      tone: m?.duplicates_removed ? "prop" : undefined,
    },
    {
      label: "Membre inconnu",
      value: value(m ? unknown : undefined),
      tone: unknown ? "prop" : undefined,
    },
  ];
}

export type TestRow = { name: string; outcome: "pass" | "warn" | "fail" | "wait"; detail: string };

export function runTests(run: Job): { summary: string; rows: TestRow[] } {
  const tests = run.metrics?.dbt_tests;
  if (!tests || !tests.results?.length) {
    return {
      summary: isActive(run.status)
        ? "En attente"
        : run.status === "failed"
          ? "Interrompus"
          : "Aucun test",
      rows: [],
    };
  }
  const rows: TestRow[] = tests.results.map((t) => ({
    name: t.name,
    outcome:
      t.status === "pass"
        ? "pass"
        : t.status === "warn"
          ? "warn"
          : t.status === "skipped"
            ? "wait"
            : "fail",
    detail:
      t.status === "pass"
        ? "Réussi"
        : t.status === "skipped"
          ? "Ignoré"
          : t.failures
            ? `${formatInteger(t.failures)} ligne${t.failures > 1 ? "s" : ""} en défaut`
            : t.status === "warn"
              ? "Avertissement"
              : "Échec",
  }));
  // Failures first, then warnings, then the rest.
  const order = { fail: 0, warn: 1, wait: 2, pass: 3 } as const;
  rows.sort((a, b) => order[a.outcome] - order[b.outcome] || a.name.localeCompare(b.name));
  const parts = [
    `${tests.passed ?? 0} réussi${(tests.passed ?? 0) > 1 ? "s" : ""}`,
    tests.warned ? `${tests.warned} avertissement${tests.warned > 1 ? "s" : ""}` : "",
    (tests.failed ?? 0) + (tests.errored ?? 0)
      ? `${(tests.failed ?? 0) + (tests.errored ?? 0)} en échec`
      : "",
  ].filter(Boolean);
  return { summary: parts.join(", "), rows };
}

export type LogLine = { text: string; level: "info" | "warn" | "error" };

/** Log lines, with their level, filtered by a search (accent and case insensitive). */
export function logLines(text: string, query: string): LogLine[] {
  const q = query.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .filter((line) => !q || line.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q))
    .map((line) => ({
      text: line,
      level: /\b(ERROR|FAIL|Error|failed|échec)\b/.test(line)
        ? "error"
        : /\b(WARN|WARNING|warning)\b/.test(line)
          ? "warn"
          : "info",
    }));
}
