"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type Job = components["schemas"]["Job"];
export type JobType = components["schemas"]["JobType"];
export type JobStatus = components["schemas"]["JobStatus"];

export const runKeys = {
  list: (projectId: string) => ["runs", projectId] as const,
  detail: (runId: string) => ["run", runId] as const,
};

/** How each run type reads: in progress, done, failed (French agreement included). */
export const JOB_TEXT: Record<JobType, { label: string; done: string; failed: string }> = {
  profile: { label: "Profilage", done: "Profilage terminé", failed: "Échec du profilage" },
  build_silver: { label: "Nettoyage", done: "Nettoyage terminé", failed: "Échec du nettoyage" },
  build_gold: {
    label: "Construction du modèle",
    done: "Modèle construit",
    failed: "Échec de la construction du modèle",
  },
  export: { label: "Export", done: "Export terminé", failed: "Échec de l’export" },
  gold_proposal: {
    label: "Proposition du modèle",
    done: "Modèle proposé",
    failed: "Échec de la proposition du modèle",
  },
  mart_request: {
    label: "Préparation d’un data mart",
    done: "Data mart préparé",
    failed: "Échec de la préparation du data mart",
  },
  build_all: {
    label: "Run complet",
    done: "Run complet terminé",
    failed: "Échec du run complet",
  },
  publish_mart: {
    label: "Publication d’un data mart",
    done: "Data mart publié",
    failed: "Échec de la publication du data mart",
  },
};

export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

/** Polling cadence: the run in progress every 2 s, the list every 5 s while busy, else 15 s. */
export const RUN_POLL_MS = 2000;
const LIST_POLL_BUSY_MS = 5000;
const LIST_POLL_IDLE_MS = 15_000;
/** A finished run stays in the top bar this long. */
export const FINISHED_VISIBLE_MS = 8000;

export function useProjectRuns(projectId: string, enabled = true) {
  return useQuery({
    queryKey: runKeys.list(projectId),
    enabled,
    queryFn: async (): Promise<Job[]> =>
      unwrap(
        await api.GET("/projects/{project_id}/runs", {
          params: { path: { project_id: projectId } },
        }),
      ),
    select: (runs) => [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isActive(run.status)) ? LIST_POLL_BUSY_MS : LIST_POLL_IDLE_MS,
  });
}

/**
 * The run shown in the top bar: the latest one in progress, polled with GET /runs/{id}
 * until it ends, then kept a few seconds with its outcome.
 */
export function useRunTracker(projectId: string, enabled = true) {
  const queryClient = useQueryClient();
  const runs = useProjectRuns(projectId, enabled);
  const activeId = useMemo(
    () => runs.data?.find((run) => isActive(run.status))?.id ?? null,
    [runs.data],
  );
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const currentId = activeId ?? trackedId;

  // Derived during render: a new run in progress becomes the tracked one.
  if (activeId && activeId !== trackedId) setTrackedId(activeId);

  const detail = useQuery({
    queryKey: runKeys.detail(currentId ?? "none"),
    enabled: enabled && currentId !== null,
    queryFn: async (): Promise<Job> =>
      unwrap(await api.GET("/runs/{run_id}", { params: { path: { run_id: currentId! } } })),
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data.status) ? false : RUN_POLL_MS,
  });

  const run = detail.data && detail.data.id === currentId ? detail.data : null;
  const finished = run !== null && !isActive(run.status);

  useEffect(() => {
    if (!run || !finished) return;
    void queryClient.invalidateQueries({ queryKey: runKeys.list(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["counters", projectId] });
    const timer = window.setTimeout(() => setHiddenId(run.id), FINISHED_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [run, finished, projectId, queryClient]);

  return { run: run && run.id !== hiddenId ? run : null, finished };
}

export function useCancelRun(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) =>
      unwrap(await api.POST("/runs/{run_id}/cancel", { params: { path: { run_id: runId } } })),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: runKeys.list(projectId) });
    },
  });
}

/** "2 min 06 s" from a run's start and end (or now). */
export function runDuration(run: Job, now: number = Date.now()): string | null {
  if (!run.started_at) return null;
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const seconds = Math.max(0, Math.round((end - Date.parse(run.started_at)) / 1000));
  if (seconds < 1) return "moins d’une seconde";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}
