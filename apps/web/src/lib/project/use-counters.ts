"use client";

import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { CounterKey } from "@/lib/navigation";
import type { Role } from "@/lib/session/views";
import { isActive, useProjectRuns } from "./use-runs";

export type Counter = { count: number; tone: "prop" | "run" };
export type Counters = Partial<Record<CounterKey, Counter>>;

const STALE = 30_000;

function counter(count: number, tone: Counter["tone"] = "prop"): Counter | undefined {
  return count > 0 ? { count, tone } : undefined;
}

/**
 * Items waiting for someone, per sidebar section: Silver plans to review, a Gold plan to
 * approve, data marts awaiting approval, runs in progress; for analysts, previews to check.
 */
export function useCounters(projectId: string, role: Role | null): Counters {
  const engineer = role === "engineer" || role === "admin";
  // One request: a request per source plan made this grow with the project.
  const counts = useQuery({
    queryKey: ["counters", projectId, "counts"],
    enabled: role !== null,
    staleTime: STALE,
    queryFn: async () =>
      unwrap(
        await api.GET("/projects/{project_id}/counters", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
  const runs = useProjectRuns(projectId, engineer);

  const data = counts.data;
  return {
    cleaning: counter(data?.plans_to_review ?? 0),
    model: counter(data?.gold_plan_to_review ? 1 : 0),
    approvals: engineer ? counter(data?.marts_to_approve ?? 0) : undefined,
    runs: counter((runs.data ?? []).filter((run) => isActive(run.status)).length, "run"),
    marts: counter(data?.previews_to_check ?? 0),
  };
}
