"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { keys } from "@/lib/project/queries";
import { RUN_POLL_MS, isActive, runKeys, type Job } from "@/lib/project/use-runs";
import {
  isProcessing,
  isPublishing,
  latestIteration,
  type Destination,
  type MartRequest,
} from "./view";

export const agentKeys = {
  overview: (projectId: string) => ["agent-overview", projectId] as const,
  request: (martId: string) => ["mart-request", martId] as const,
};

/** A request keeps being read while the agent works on it or while it is published. */
export const REQUEST_POLL_MS = 1200;

export function useAgentOverview(projectId: string) {
  return useQuery({
    queryKey: agentKeys.overview(projectId),
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(
        await api.GET("/projects/{project_id}/agent/overview", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

/** The caller's requests (all of them for engineers), polled while one is in progress. */
export function useConversations(projectId: string, enabled = true) {
  return useQuery({
    queryKey: keys.marts(projectId),
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET("/projects/{project_id}/mart-requests", {
          params: { path: { project_id: projectId } },
        }),
      ),
    refetchInterval: (query) =>
      query.state.data?.some((r) => isProcessing(r) || isPublishing(r)) ? 2500 : 30_000,
  });
}

export function useMartRequest(martId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: agentKeys.request(martId ?? "none"),
    enabled: martId !== null,
    queryFn: async () =>
      unwrap(await api.GET("/mart-requests/{mart_id}", { params: { path: { mart_id: martId! } } })),
    refetchInterval: (query) => {
      const request = query.state.data;
      if (!request) return false;
      if (isProcessing(request)) return REQUEST_POLL_MS;
      if (isPublishing(request) && !request.publish_error) return REQUEST_POLL_MS * 2;
      return false;
    },
  });
  // A version or a publication that ends changes the lists (sidebar, marts, counters).
  const working = query.data ? isProcessing(query.data) || isPublishing(query.data) : false;
  const projectId = query.data?.project_id;
  const was = useRef(working);
  useEffect(() => {
    if (was.current && !working && projectId) {
      void queryClient.invalidateQueries({ queryKey: keys.marts(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["counters", projectId] });
    }
    was.current = working;
  }, [working, projectId, queryClient]);
  return query;
}

/** The run of a version, for its progress and elapsed time. */
export function useAgentRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: runKeys.detail(runId ?? "none"),
    enabled: Boolean(runId),
    queryFn: async (): Promise<Job> =>
      unwrap(await api.GET("/runs/{run_id}", { params: { path: { run_id: runId! } } })),
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data.status) ? false : RUN_POLL_MS / 2,
  });
}

type RequestRun = { mart_request: MartRequest; run?: Job | null };

/** Mutations of a conversation; each one stores the request it returns. */
export function useAgentActions(projectId: string) {
  const queryClient = useQueryClient();
  const store = (result: RequestRun | MartRequest) => {
    const request = "mart_request" in result ? result.mart_request : result;
    queryClient.setQueryData(agentKeys.request(request.id), request);
    if ("run" in result && result.run) {
      queryClient.setQueryData(runKeys.detail(result.run.id), result.run);
    }
    void queryClient.invalidateQueries({ queryKey: keys.marts(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["counters", projectId] });
    return request;
  };
  const path = (martId: string) => ({ params: { path: { mart_id: martId } } });

  const ask = useMutation({
    mutationFn: async (question: string) =>
      store(
        unwrap(
          await api.POST("/projects/{project_id}/mart-requests", {
            params: { path: { project_id: projectId } },
            body: { question },
          }),
        ),
      ),
  });
  const answer = useMutation({
    mutationFn: async (input: { martId: string; option?: number; text?: string }) =>
      store(
        unwrap(
          await api.POST("/mart-requests/{mart_id}/answer", {
            ...path(input.martId),
            body: input.option !== undefined ? { option: input.option } : { text: input.text },
          }),
        ),
      ),
  });
  const refine = useMutation({
    mutationFn: async (input: { martId: string; instruction: string }) =>
      store(
        unwrap(
          await api.POST("/mart-requests/{mart_id}/refine", {
            ...path(input.martId),
            body: { instruction: input.instruction },
          }),
        ),
      ),
  });
  const correct = useMutation({
    mutationFn: async (input: { martId: string; version: number; term: number; option: number }) =>
      store(
        unwrap(
          await api.POST("/mart-requests/{mart_id}/correct", {
            ...path(input.martId),
            body: { version: input.version, term: input.term, option: input.option },
          }),
        ),
      ),
  });
  const validate = useMutation({
    mutationFn: async (input: { martId: string; destination: Destination | null }) =>
      store(
        unwrap(
          await api.POST("/mart-requests/{mart_id}/validate", {
            ...path(input.martId),
            body: { destination: input.destination },
          }),
        ),
      ),
  });
  const approve = useMutation({
    mutationFn: async (martId: string) =>
      store(unwrap(await api.POST("/mart-requests/{mart_id}/approve", path(martId)))),
  });
  const reject = useMutation({
    mutationFn: async (input: { martId: string; reason: string }) =>
      store(
        unwrap(
          await api.POST("/mart-requests/{mart_id}/reject", {
            ...path(input.martId),
            body: { reason: input.reason },
          }),
        ),
      ),
  });
  const cancel = useMutation({
    mutationFn: async (runId: string) =>
      unwrap(await api.POST("/runs/{run_id}/cancel", { params: { path: { run_id: runId } } })),
    onSuccess: (job) => queryClient.setQueryData(runKeys.detail(job.id), job),
  });
  const proposeSynonym = useMutation({
    mutationFn: async (input: { target: string; synonym: string; martId: string }) =>
      unwrap(
        await api.POST("/projects/{project_id}/semantic-layer/synonym-proposals", {
          params: { path: { project_id: projectId } },
          body: { target: input.target, synonym: input.synonym, mart_request_id: input.martId },
        }),
      ),
  });
  return { ask, answer, refine, correct, validate, approve, reject, cancel, proposeSynonym };
}

/** The run of the version the conversation is waiting on, if any. */
export function pendingRunId(request: MartRequest | undefined): string | null {
  if (!request) return null;
  const latest = latestIteration(request);
  if (latest?.status === "processing") return latest.job_id ?? null;
  return null;
}
