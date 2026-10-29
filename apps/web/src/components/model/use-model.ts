"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { GoldPlanPatch } from "@/lib/model/view";
import { keys } from "@/lib/project/queries";
import {
  RUN_DEFAULTS,
  RUN_POLL_MS,
  isActive,
  runKeys,
  useProjectRuns,
  type Job,
} from "@/lib/project/use-runs";
import { useLiveEvents } from "@/lib/events/live";

function failure(title: string) {
  return (error: unknown) =>
    toast.error({
      title,
      description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
    });
}

/** Everything that changes when the model, its relations or its tables change. */
export function useModelRefresh(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ["gold-plan", projectId],
      keys.goldPlans(projectId),
      keys.goldIssues(projectId),
      keys.relations(projectId),
      keys.tables(projectId),
      ["graph", projectId],
      ["counters", projectId],
      runKeys.list(projectId),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useModelMutations(projectId: string) {
  const refresh = useModelRefresh(projectId);
  const path = { params: { path: { project_id: projectId } } };

  const patch = useMutation({
    mutationFn: async (body: GoldPlanPatch) =>
      unwrap(await api.PATCH("/projects/{project_id}/gold-plan", { ...path, body })),
    onSuccess: (plan) => {
      toast.success({
        title: `Modèle modifié, version ${plan.version}`,
        description: plan.issues?.some((i) => i.severity === "error")
          ? "Des points restent à résoudre"
          : "Prêt à valider",
      });
      refresh();
    },
    onError: failure("Modification refusée"),
  });

  const approve = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/projects/{project_id}/gold-plan/approve", path)),
    onSuccess: (plan) => {
      toast.success({
        title: "Modèle validé",
        description: `Version ${plan.version} prête à construire`,
      });
      refresh();
    },
    onError: failure("Validation refusée"),
  });

  const relation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "confirm" | "reject" }) =>
      action === "confirm"
        ? unwrap(
            await api.POST("/relations/{relation_id}/confirm", {
              params: { path: { relation_id: id } },
            }),
          )
        : unwrap(
            await api.POST("/relations/{relation_id}/reject", {
              params: { path: { relation_id: id } },
            }),
          ),
    onSuccess: (relation) => {
      toast.success({
        title: relation.status === "confirmed" ? "Relation confirmée" : "Relation rejetée",
        description: `${relation.from_source}.${relation.from_column} → ${relation.to_source}.${relation.to_column}`,
      });
      refresh();
    },
    onError: failure("Relation non modifiée"),
  });

  const declare = useMutation({
    mutationFn: async (body: {
      from_source_id: string;
      from_column: string;
      to_source_id: string;
      to_column: string;
    }) => unwrap(await api.POST("/projects/{project_id}/relations", { ...path, body })),
    onSuccess: (relation) => {
      toast.success({
        title: "Relation ajoutée",
        description: `Mesurée : ${Math.round(relation.inclusion_ratio * 100)} % des valeurs se retrouvent`,
      });
      refresh();
    },
    onError: failure("Relation refusée"),
  });

  return { patch, approve, relation, declare, refresh };
}

/**
 * A run started from the model screen (proposal or build): the latest of its type,
 * polled until it ends. Leaving the screen is fine: the top bar keeps following it and
 * its toast says when it is done.
 */
export function useModelRun(projectId: string, type: "gold_proposal" | "build_gold") {
  const runs = useProjectRuns(projectId);
  const latest = runs.data?.find((run) => run.type === type) ?? null;
  const stream = useLiveEvents();
  const detail = useQuery({
    queryKey: runKeys.detail(latest?.id ?? "none"),
    enabled: latest !== null,
    queryFn: async (): Promise<Job> =>
      unwrap(await api.GET("/runs/{run_id}", { params: { path: { run_id: latest!.id } } })),
    refetchInterval: (query) =>
      stream || (query.state.data && !isActive(query.state.data.status)) ? false : RUN_POLL_MS,
  });
  const run = detail.data && detail.data.id === latest?.id ? detail.data : latest;
  return { run, active: run !== null && isActive(run.status) };
}

export function useStartRun(projectId: string) {
  const queryClient = useQueryClient();
  const refresh = useModelRefresh(projectId);
  const path = { params: { path: { project_id: projectId } } };
  const propose = useMutation({
    mutationFn: async (useLlm: boolean) =>
      unwrap(
        await api.POST("/projects/{project_id}/gold-plan/propose", {
          ...path,
          body: { use_llm: useLlm },
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      refresh();
    },
    onError: failure("Proposition non lancée"),
  });
  const build = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/projects/{project_id}/runs", {
          ...path,
          body: { type: "build_gold", ...RUN_DEFAULTS },
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      toast.info({ title: "Construction lancée", description: "Le modèle se construit" });
      refresh();
    },
    onError: failure("Construction non lancée"),
  });
  const cancel = useMutation({
    mutationFn: async (runId: string) =>
      unwrap(await api.POST("/runs/{run_id}/cancel", { params: { path: { run_id: runId } } })),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      toast.info({ title: "Proposition annulée", description: "Le modèle actuel est conservé" });
      refresh();
    },
    onError: failure("Annulation impossible"),
  });
  return { propose, build, cancel };
}
