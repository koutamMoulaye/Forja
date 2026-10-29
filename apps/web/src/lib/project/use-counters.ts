"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { CounterKey } from "@/lib/navigation";
import type { Role } from "@/lib/session/views";
import { isActive, useProjectRuns } from "./use-runs";

export type Counter = { count: number; tone: "prop" | "run" };
export type Counters = Partial<Record<CounterKey, Counter>>;

const STALE = 30_000;

function counter(count: number, tone: Counter["tone"] = "prop"): Counter | undefined {
  return count > 0 ? { count, tone } : undefined;
}

/** A missing resource (no Gold plan yet...) counts as nothing to review. */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Items waiting for someone, per sidebar section: Silver plans to review, a Gold plan to
 * approve, data marts awaiting approval, runs in progress; for analysts, previews to check.
 */
export function useCounters(projectId: string, role: Role | null): Counters {
  const engineer = role === "engineer" || role === "admin";
  const path = { params: { path: { project_id: projectId } } };

  const sources = useQuery({
    queryKey: ["counters", projectId, "sources"],
    enabled: engineer,
    staleTime: STALE,
    queryFn: async () => unwrap(await api.GET("/projects/{project_id}/sources", path)),
  });
  const plans = useQueries({
    queries: (sources.data ?? []).map((source) => ({
      queryKey: ["counters", projectId, "plan", source.id],
      staleTime: STALE,
      queryFn: () =>
        orNull(async () =>
          unwrap(
            await api.GET("/sources/{source_id}/plan", {
              params: { path: { source_id: source.id } },
            }),
          ),
        ),
    })),
  });
  const gold = useQuery({
    queryKey: ["counters", projectId, "gold"],
    enabled: engineer,
    staleTime: STALE,
    queryFn: () =>
      orNull(async () => unwrap(await api.GET("/projects/{project_id}/gold-plan", path))),
  });
  const martsQuery = (status: "validated" | "previewed") => ({
    queryKey: ["counters", projectId, "marts", status],
    enabled: role !== null && (status === "previewed" || engineer),
    staleTime: STALE,
    queryFn: async () =>
      unwrap(
        await api.GET("/projects/{project_id}/mart-requests", {
          params: { path: { project_id: projectId }, query: { status, limit: 200 } },
        }),
      ),
  });
  const validated = useQuery(martsQuery("validated"));
  const previewed = useQuery(martsQuery("previewed"));
  const runs = useProjectRuns(projectId, engineer);

  const draftPlans = plans.filter((plan) => plan.data?.status === "draft").length;
  return {
    cleaning: counter(draftPlans),
    model: counter(gold.data?.status === "draft" ? 1 : 0),
    approvals: engineer
      ? counter(
          (validated.data?.items ?? []).filter((mart) => !mart.approved_at && !mart.publish_job_id)
            .length,
        )
      : undefined,
    runs: counter((runs.data ?? []).filter((run) => isActive(run.status)).length, "run"),
    marts: counter(previewed.data?.total ?? 0),
  };
}
