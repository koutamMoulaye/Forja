import { formatInteger, plural } from "@/lib/format";
import type { Job } from "@/lib/project/use-runs";
import { controlsSummary, pathLabel, type MartIteration } from "./view";

export type StepState = "done" | "run" | "wait" | "idle" | "fail";

export type AgentStep = {
  id: "understand" | "search" | "clarify" | "build" | "check" | "ready";
  title: string;
  detail: string;
  state: StepState;
};

/** Where the run is, from the step it reports (forja_core.agent.service). */
const STAGES: Record<string, number> = { preselection: 1, llm: 1, validation: 3, preview: 4 };

function stageOf(job: Job | null | undefined): number {
  if (!job || job.status === "queued") return 0;
  return STAGES[job.progress?.step ?? ""] ?? 0;
}

function cancelled(iteration: MartIteration): boolean {
  return iteration.error === "annulée";
}

/**
 * The six steps of the preparation card (C4): understanding, search of the data, the
 * question back if any, construction, consistency checks, preview. They follow the real
 * job: its progress while it runs, the version's outcome once it is done.
 */
export function agentSteps(iteration: MartIteration, job?: Job | null): AgentStep[] {
  const answered = iteration.kind === "answer";
  const asked = iteration.status === "clarification";
  const preview = iteration.preview;
  const stage =
    iteration.status === "processing"
      ? stageOf(job)
      : iteration.status === "previewed"
        ? 6
        : asked
          ? 2
          : 1;
  const deep = iteration.path === "llm" || job?.progress?.step === "llm";

  const understandTitle =
    iteration.kind === "refinement"
      ? "Compréhension de l’ajustement"
      : iteration.kind === "correction"
        ? "Correction d’un terme"
        : answered
          ? "Prise en compte de votre précision"
          : "Compréhension de la question";
  const steps: AgentStep[] = [
    {
      id: "understand",
      title: understandTitle,
      detail: iteration.summary
        ? iteration.summary.replace(/\.$/, "")
        : iteration.effective || iteration.instruction,
      state: "idle",
    },
    {
      id: "search",
      title: "Recherche des données utiles",
      detail:
        job?.progress?.step === "llm"
          ? "Analyse approfondie : la demande est relue avec le modèle de vos données"
          : iteration.selected?.length
            ? `${plural(iteration.selected.length, "élément", "éléments")} du modèle retenus${
                deep ? " · analyse approfondie" : ""
              }`
            : "Mesures, axes et valeurs reconnus dans la demande",
      state: "idle",
    },
    {
      id: "clarify",
      title: asked
        ? "Une précision est nécessaire"
        : answered
          ? "Précision reçue"
          : "Aucune précision nécessaire",
      detail: asked
        ? (iteration.clarification?.question ?? "Un terme peut désigner plusieurs choses")
        : answered
          ? iteration.instruction
          : "La demande est sans ambiguïté",
      state: "idle",
    },
    {
      id: "build",
      title: "Construction du data mart",
      detail: preview
        ? `${plural(preview.row_count, "ligne", "lignes")} · ${plural(
            preview.columns.length,
            "colonne",
            "colonnes",
          )}`
        : "Croisement des faits avec les dimensions utiles",
      state: "idle",
    },
    {
      id: "check",
      title: "Contrôles de cohérence",
      detail: preview?.controls?.length
        ? controlsSummary(preview.controls)
        : "Totaux, rattachements, valeurs manquantes",
      state: "idle",
    },
    {
      id: "ready",
      title: "Aperçu prêt à vérifier",
      detail: "Vous validez avant toute publication",
      state: "idle",
    },
  ];

  steps.forEach((step, index) => {
    if (index < stage) step.state = "done";
    else if (index === stage && iteration.status === "processing") step.state = "run";
  });
  if (asked) steps[2]!.state = "wait";
  if (iteration.status === "previewed") steps.forEach((step) => (step.state = "done"));
  if (iteration.status === "refused") {
    steps[0]!.state = "done";
    steps[1]!.state = "fail";
    steps[1]!.title = "Hors du périmètre des données";
    steps[1]!.detail = iteration.refusal ?? "Ces données ne sont pas dans le projet";
  }
  if (iteration.status === "failed") {
    const at = Math.min(Math.max(stageOf(job), 1), 5);
    steps.forEach((step, index) => {
      if (index < at) step.state = "done";
    });
    steps[at]!.state = "fail";
    steps[at]!.detail = cancelled(iteration)
      ? "Annulée à votre demande"
      : (iteration.error ?? "La préparation s’est arrêtée");
  }
  return steps;
}

/** Head of the preparation card: what the agent is doing, in one line. */
export function agentHeadline(iteration: MartIteration): string {
  switch (iteration.status) {
    case "processing":
      return "Je prépare votre data mart";
    case "clarification":
      return "En pause, une question pour vous";
    case "previewed":
      return "Data mart préparé";
    case "refused":
      return "Je ne peux pas répondre à cette demande";
    case "failed":
      return cancelled(iteration) ? "Préparation annulée" : "La préparation a échoué";
  }
}

/** « Réponse immédiate · 0:04 », the path once known, then the elapsed time. */
export function agentMeta(
  iteration: MartIteration,
  job: Job | null | undefined,
  now = Date.now(),
): string {
  const start = job?.started_at ?? job?.created_at ?? iteration.created_at;
  const end = iteration.status === "processing" ? null : (job?.finished_at ?? null);
  const seconds = Math.max(
    0,
    Math.round(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  const elapsed =
    seconds < 60
      ? `${seconds} s`
      : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
  const path = iteration.status === "processing" ? null : pathLabel(iteration.path);
  const parts = [path, iteration.status === "processing" ? elapsed : `en ${elapsed}`];
  return parts.filter(Boolean).join(" · ");
}

/** Whether the run took long enough to call it a long job (worth a notification). */
export function isLongJob(job: Job | null | undefined, now = Date.now()): boolean {
  if (!job?.started_at) return false;
  const end = job.finished_at ? Date.parse(job.finished_at) : now;
  return end - Date.parse(job.started_at) > 15_000;
}

export function rowsLabel(count: number): string {
  return `${formatInteger(count)} ${count > 1 ? "lignes" : "ligne"}`;
}
