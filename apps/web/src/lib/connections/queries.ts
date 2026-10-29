"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { keys as projectKeys, orNull } from "@/lib/project/queries";
import { runKeys } from "@/lib/project/use-runs";

type S = components["schemas"];
export type Connection = S["ConnectionView"];
export type ConnectionType = S["ConnectionType"];
export type ConnectionCreate = S["ConnectionCreate"];
export type ConnectionTest = S["ConnectionTest"];
export type DatabaseExploration = S["DatabaseExploration"];
export type DatabaseTable = S["DatabaseTable"];
export type TableSelection = S["TableSelection"];
export type ApiPreview = S["ApiPreview"];
export type Schedule = S["Schedule"];
export type ScheduleInterpretation = S["ScheduleInterpretation"];
export type ImportResponse = S["ImportResponse"];
export type ConnectorSettings = S["ConnectorSettings"];
export type LoadMetrics = S["LoadMetrics"];

export const connectionKeys = {
  list: (projectId: string) => ["connections", projectId] as const,
  detail: (connectionId: string) => ["connection", connectionId] as const,
  explore: (connectionId: string) => ["connection-explore", connectionId] as const,
  schedules: (projectId: string) => ["schedules", projectId] as const,
  sourceSchedule: (sourceId: string) => ["source-schedule", sourceId] as const,
  settings: () => ["settings-connectors"] as const,
};

const project = (projectId: string) => ({ params: { path: { project_id: projectId } } });
const connection = (connectionId: string) => ({
  params: { path: { connection_id: connectionId } },
});

/** Polls while a load runs, so the list shows it ending. */
export function useConnections(projectId: string) {
  return useQuery({
    queryKey: connectionKeys.list(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/connections", project(projectId))),
    refetchInterval: (query) => (query.state.data?.some((c) => c.active_run) ? 2000 : false),
  });
}

export function useExploration(connectionId: string | null) {
  return useQuery({
    queryKey: connectionKeys.explore(connectionId ?? ""),
    enabled: connectionId !== null,
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(await api.GET("/connections/{connection_id}/explore", connection(connectionId!))),
  });
}

/** Next runs of every schedule of the project (canvas inspector, sources list). */
export function useProjectSchedules(projectId: string, enabled = true) {
  return useQuery({
    queryKey: connectionKeys.schedules(projectId),
    enabled,
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/schedules", project(projectId))),
  });
}

export function useConnectorSettings() {
  return useQuery({
    queryKey: connectionKeys.settings(),
    queryFn: async () => unwrap(await api.GET("/settings/connectors")),
  });
}

export async function testDraft(projectId: string, body: ConnectionCreate) {
  return unwrap(
    await api.POST("/projects/{project_id}/connections/test", { ...project(projectId), body }),
  );
}

export async function createConnection(projectId: string, body: ConnectionCreate) {
  return unwrap(
    await api.POST("/projects/{project_id}/connections", { ...project(projectId), body }),
  );
}

export async function previewApi(
  projectId: string,
  body: S["ApiPreviewRequest"],
): Promise<ApiPreview> {
  return unwrap(
    await api.POST("/projects/{project_id}/connections/preview", { ...project(projectId), body }),
  );
}

export async function importObjects(connectionId: string, body: S["ImportRequest"]) {
  return unwrap(
    await api.POST("/connections/{connection_id}/import", { ...connection(connectionId), body }),
  );
}

export async function interpretSchedule(
  projectId: string,
  text: string,
): Promise<ScheduleInterpretation> {
  return unwrap(
    await api.POST("/projects/{project_id}/schedules/interpret", {
      ...project(projectId),
      body: { text },
    }),
  );
}

export type ScheduleTarget = { type: "connection" | "source"; id: string };

export async function saveSchedule(target: ScheduleTarget, text: string): Promise<Schedule> {
  const body = { text, enabled: true };
  if (target.type === "connection") {
    return unwrap(
      await api.PUT("/connections/{connection_id}/schedule", { ...connection(target.id), body }),
    );
  }
  return unwrap(
    await api.PUT("/sources/{source_id}/schedule", {
      params: { path: { source_id: target.id } },
      body,
    }),
  );
}

export async function removeSchedule(target: ScheduleTarget): Promise<void> {
  if (target.type === "connection") {
    await api.DELETE("/connections/{connection_id}/schedule", connection(target.id));
    return;
  }
  await api.DELETE("/sources/{source_id}/schedule", {
    params: { path: { source_id: target.id } },
  });
}

export function useSourceSchedule(sourceId: string, enabled: boolean) {
  return useQuery({
    queryKey: connectionKeys.sourceSchedule(sourceId),
    enabled,
    queryFn: () =>
      orNull(async () =>
        unwrap(
          await api.GET("/sources/{source_id}/schedule", {
            params: { path: { source_id: sourceId } },
          }),
        ),
      ),
  });
}

/** Everything a connection change may affect: lists, schedules, sources, runs, canvas. */
export function useRefreshConnections(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionKeys.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: connectionKeys.schedules(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["source-schedule"] }),
      queryClient.invalidateQueries({ queryKey: projectKeys.sources(projectId) }),
      queryClient.invalidateQueries({ queryKey: runKeys.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["graph", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["counters", projectId] }),
    ]);
}

export function useConnectionActions(projectId: string) {
  const refresh = useRefreshConnections(projectId);
  const load = useMutation({
    mutationFn: async (connectionId: string) =>
      unwrap(
        await api.POST("/connections/{connection_id}/load", {
          ...connection(connectionId),
          body: { chain: false },
        }),
      ),
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: async (connectionId: string) =>
      unwrap(await api.POST("/connections/{connection_id}/test", connection(connectionId))),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (connectionId: string) => {
      await api.DELETE("/connections/{connection_id}", connection(connectionId));
    },
    onSettled: refresh,
  });
  return { load, test, remove, refresh };
}
