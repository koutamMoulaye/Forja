"use client";

import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { API_PROXY_PREFIX, api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";
import { CSRF_HEADER, readCsrfToken } from "@/lib/auth/csrf-client";
import type { AuditQuery } from "@/lib/governance/view";

type S = components["schemas"];
export type Source = S["Source"];
export type SourceVersion = S["SourceVersion"];
export type ProfileReport = S["ProfileReport"];
export type ColumnProfile = S["ColumnProfile"];
export type TransformationPlan = S["TransformationPlan"];
export type ColumnPlan = S["ColumnPlan"];
export type PlanReview = S["PlanReview"];
export type ReviewRule = S["ReviewRule"];
export type PlanSamples = S["PlanSamples"];
export type ColumnSamples = S["ColumnSamples"];
export type Quarantine = S["Quarantine"];
export type WarehouseTable = S["WarehouseTable"];
export type TablePreview = S["TablePreview"];
export type GoldPlan = S["GoldPlan"];
export type ValidationIssue = S["ValidationIssue"];
export type Relation = S["Relation"];
export type SemanticLayer = S["SemanticLayer"];
export type SemanticMetric = S["Metric"];
export type SemanticDimension = S["SemanticDimension"];
export type SynonymProposal = S["SynonymProposal"];
export type MartRequest = S["MartRequest"];
export type AuditEntry = S["AuditEntry"];
export type AuditPage = S["AuditPage"];
export type Membership = S["Membership"];
export type Invitation = S["Invitation"];
export type ApiKey = S["ApiKey"];
export type CreatedApiKey = S["CreatedApiKey"];
export type LLMConfigView = S["LLMConfigView"];
export type LLMCheck = S["LLMCheck"];

/** Query keys by resource, so a mutation refreshes exactly what it changed. */
export const keys = {
  sources: (projectId: string) => ["sources", projectId] as const,
  source: (sourceId: string) => ["source", sourceId] as const,
  profile: (sourceId: string, version?: number) => ["profile", sourceId, version ?? 0] as const,
  versions: (sourceId: string) => ["versions", sourceId] as const,
  plan: (sourceId: string, version?: number) => ["plan", sourceId, version ?? 0] as const,
  plans: (sourceId: string) => ["plans", sourceId] as const,
  review: (sourceId: string) => ["review", sourceId] as const,
  samples: (sourceId: string, version: number) => ["samples", sourceId, version] as const,
  rejects: (sourceId: string, runId: string | null) => ["rejects", sourceId, runId] as const,
  tables: (projectId: string) => ["tables", projectId] as const,
  tablePreview: (tableId: string) => ["table-preview", tableId] as const,
  goldPlan: (projectId: string, version?: number) =>
    ["gold-plan", projectId, version ?? 0] as const,
  goldPlans: (projectId: string) => ["gold-plans", projectId] as const,
  goldIssues: (projectId: string) => ["gold-issues", projectId] as const,
  relations: (projectId: string) => ["relations", projectId] as const,
  semantic: (projectId: string, version?: number) => ["semantic", projectId, version ?? 0] as const,
  semanticVersions: (projectId: string) => ["semantic-versions", projectId] as const,
  synonyms: (projectId: string) => ["synonyms", projectId] as const,
  marts: (projectId: string) => ["marts", projectId] as const,
  audit: (projectId: string) => ["audit", projectId] as const,
  members: (projectId: string) => ["members", projectId] as const,
  invitations: (projectId: string) => ["invitations", projectId] as const,
  apiKeys: () => ["api-keys"] as const,
  llm: () => ["settings-llm"] as const,
  runLogs: (runId: string) => ["run-logs", runId] as const,
};

/** A resource that does not exist yet (no plan, no Gold model) reads as null. */
export async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

const project = (projectId: string) => ({ params: { path: { project_id: projectId } } });
const source = (sourceId: string) => ({ params: { path: { source_id: sourceId } } });

export function useSources(projectId: string) {
  return useQuery({
    queryKey: keys.sources(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/sources", project(projectId))),
  });
}

export function useSource(sourceId: string) {
  return useQuery({
    queryKey: keys.source(sourceId),
    queryFn: async () => unwrap(await api.GET("/sources/{source_id}", source(sourceId))),
  });
}

export function useProfile(sourceId: string, version?: number) {
  return useQuery({
    queryKey: keys.profile(sourceId, version),
    queryFn: () =>
      orNull(async () =>
        unwrap(
          await api.GET("/sources/{source_id}/profile", {
            params: { path: { source_id: sourceId }, query: { version } },
          }),
        ),
      ),
  });
}

/** Profiles of many sources at once (PII counts of the source list). */
export function useProfiles(sourceIds: string[]) {
  return useQueries({
    queries: sourceIds.map((id) => ({
      queryKey: keys.profile(id),
      queryFn: () =>
        orNull(async () => unwrap(await api.GET("/sources/{source_id}/profile", source(id)))),
    })),
  });
}

export function useVersions(sourceId: string) {
  return useQuery({
    queryKey: keys.versions(sourceId),
    queryFn: async () => unwrap(await api.GET("/sources/{source_id}/versions", source(sourceId))),
  });
}

export function usePlan(sourceId: string, version?: number) {
  return useQuery({
    queryKey: keys.plan(sourceId, version),
    queryFn: () =>
      orNull(async () =>
        unwrap(
          await api.GET("/sources/{source_id}/plan", {
            params: { path: { source_id: sourceId }, query: { version } },
          }),
        ),
      ),
  });
}

/** Latest plans of many sources (status column of the source list). */
export function useLatestPlans(sourceIds: string[]) {
  return useQueries({
    queries: sourceIds.map((id) => ({
      queryKey: keys.plan(id),
      queryFn: () =>
        orNull(async () => unwrap(await api.GET("/sources/{source_id}/plan", source(id)))),
    })),
  });
}

export function usePlans(sourceId: string) {
  return useQuery({
    queryKey: keys.plans(sourceId),
    queryFn: async () => unwrap(await api.GET("/sources/{source_id}/plans", source(sourceId))),
  });
}

export function usePlanReview(sourceId: string) {
  return useQuery({
    queryKey: keys.review(sourceId),
    queryFn: () =>
      orNull(async () =>
        unwrap(await api.GET("/sources/{source_id}/plan/review", source(sourceId))),
      ),
  });
}

export function usePlanSamples(sourceId: string, version: number | undefined) {
  return useQuery({
    queryKey: keys.samples(sourceId, version ?? 0),
    enabled: version !== undefined,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await api.GET("/sources/{source_id}/plan/samples", {
          params: { path: { source_id: sourceId }, query: { version } },
        }),
      ),
  });
}

export function useRejects(sourceId: string, runId: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.rejects(sourceId, runId),
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET("/sources/{source_id}/rejects", {
          params: {
            path: { source_id: sourceId },
            query: { limit: 100, ...(runId ? { run_id: runId } : {}) },
          },
        }),
      ),
  });
}

export function useTables(projectId: string) {
  return useQuery({
    queryKey: keys.tables(projectId),
    queryFn: async () => unwrap(await api.GET("/projects/{project_id}/tables", project(projectId))),
  });
}

export function useTablePreview(tableId: string | null, limit = 20) {
  return useQuery({
    queryKey: [...keys.tablePreview(tableId ?? "none"), limit],
    enabled: tableId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET("/tables/{table_id}/preview", {
          params: { path: { table_id: tableId! }, query: { limit } },
        }),
      ),
  });
}

export function useGoldPlan(projectId: string, version?: number) {
  return useQuery({
    queryKey: keys.goldPlan(projectId, version),
    queryFn: () =>
      orNull(async () =>
        unwrap(
          await api.GET("/projects/{project_id}/gold-plan", {
            params: { path: { project_id: projectId }, query: { version } },
          }),
        ),
      ),
  });
}

export function useGoldPlans(projectId: string) {
  return useQuery({
    queryKey: keys.goldPlans(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/gold-plans", project(projectId))),
  });
}

export function useGoldIssues(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.goldIssues(projectId),
    enabled,
    queryFn: () =>
      orNull(async () =>
        unwrap(await api.GET("/projects/{project_id}/gold-plan/issues", project(projectId))),
      ),
  });
}

export function useRelations(projectId: string) {
  return useQuery({
    queryKey: keys.relations(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/relations", project(projectId))),
  });
}

export function useSemanticLayer(projectId: string, version?: number) {
  return useQuery({
    queryKey: keys.semantic(projectId, version),
    queryFn: () =>
      orNull(async () =>
        unwrap(
          await api.GET("/projects/{project_id}/semantic-layer", {
            params: { path: { project_id: projectId }, query: { version } },
          }),
        ),
      ),
  });
}

export function useSemanticVersions(projectId: string) {
  return useQuery({
    queryKey: keys.semanticVersions(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/semantic-layer/versions", project(projectId))),
  });
}

export function useSynonymProposals(projectId: string) {
  return useQuery({
    queryKey: keys.synonyms(projectId),
    queryFn: async () =>
      unwrap(
        await api.GET(
          "/projects/{project_id}/semantic-layer/synonym-proposals",
          project(projectId),
        ),
      ),
  });
}

export function useMartRequests(projectId: string) {
  return useQuery({
    queryKey: keys.marts(projectId),
    queryFn: async () =>
      unwrap(
        await api.GET("/projects/{project_id}/mart-requests", {
          params: { path: { project_id: projectId }, query: { limit: 200 } },
        }),
      ).items,
  });
}

export const AUDIT_PAGE = 100;

/** The audit log filtered by the API, newest first, a page at a time. */
export function useAudit(projectId: string, filters: AuditQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...keys.audit(projectId), filters],
    enabled,
    initialPageParam: 0,
    // The rows stay while a new filter loads.
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<AuditPage> =>
      unwrap(
        await api.GET("/projects/{project_id}/audit", {
          params: {
            path: { project_id: projectId },
            query: { ...filters, limit: AUDIT_PAGE, offset: pageParam },
          },
        }),
      ),
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: keys.members(projectId),
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/members", project(projectId))),
  });
}

export function useInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invitations(projectId),
    enabled,
    queryFn: async () =>
      unwrap(await api.GET("/projects/{project_id}/invitations", project(projectId))),
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: keys.apiKeys(),
    queryFn: async () => unwrap(await api.GET("/auth/api-keys")),
  });
}

export function useLlmSettings() {
  return useQuery({
    queryKey: keys.llm(),
    queryFn: async () => unwrap(await api.GET("/settings/llm")),
  });
}

/** Multipart upload through the proxy (openapi-fetch serializes JSON only). */
export async function uploadFile(path: string, file: File): Promise<unknown> {
  const body = new FormData();
  body.append("file", file, file.name);
  const headers = new Headers();
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);
  const response = await fetch(`${API_PROXY_PREFIX}${path}`, { method: "POST", body, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw ApiError.from(response.status, payload, response.headers.get("Retry-After"));
  }
  return payload;
}

/** A file download through the proxy, saved under the name the API gives. */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const response = await fetch(`${API_PROXY_PREFIX}${path}`);
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw ApiError.from(response.status, payload, response.headers.get("Retry-After"));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]!) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
