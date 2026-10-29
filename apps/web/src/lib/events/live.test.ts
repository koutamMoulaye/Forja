import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { notificationHref, notificationTone } from "@/lib/notifications/queries";
import { runKeys, type Job } from "@/lib/project/use-runs";
import { applyJob, offlinePoll, type AppNotification } from "./live";

function job(over: Partial<Job> = {}): Job {
  return {
    id: "r1",
    project_id: "p1",
    type: "build_silver",
    status: "running",
    params: { type: "build_silver" },
    created_at: "2026-10-28T10:00:00Z",
    ...over,
  } as Job;
}

function notification(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    user_id: "u1",
    project_id: "p1",
    kind: "run_failed",
    title: "Échec du nettoyage",
    detail: "",
    created_at: "2026-10-28T10:00:00Z",
    ...over,
  } as AppNotification;
}

describe("live events", () => {
  it("polls only while the stream is down", () => {
    expect(offlinePoll(true, 2000)).toBe(false);
    expect(offlinePoll(false, 2000)).toBe(2000);
  });

  it("applies a run to the cached run and run list", () => {
    const client = new QueryClient();
    client.setQueryData(runKeys.list("p1"), [job({ id: "old", status: "succeeded" })]);
    applyJob(client, job());
    expect(client.getQueryData<Job[]>(runKeys.list("p1"))!.map((r) => r.id)).toEqual(["r1", "old"]);
    applyJob(client, job({ status: "succeeded" }));
    expect(client.getQueryData<Job>(runKeys.detail("r1"))!.status).toBe("succeeded");
    expect(client.getQueryData<Job[]>(runKeys.list("p1"))!.map((r) => r.status)).toEqual([
      "succeeded",
      "succeeded",
    ]);
  });

  it("turns a notification's target into a page", () => {
    const action = (target_type: string, target_id = "x") =>
      notification({
        action: { label: "Ouvrir", target_type, target_id } as AppNotification["action"],
      });
    expect(notificationHref(action("run", "r1"))).toBe("/projects/p1/runs/r1");
    expect(notificationHref(action("source", "s1"))).toBe("/projects/p1/sources/s1/plan");
    expect(notificationHref(action("gold_plan", "p1"))).toBe("/projects/p1/model");
    expect(notificationHref(action("mart", "m1"))).toBe("/projects/p1/marts/m1/preview");
    expect(notificationHref(action("conversation", "m1"))).toBe("/projects/p1/ask/m1");
    expect(notificationHref(notification())).toBeNull();
    expect(notificationTone(notification())).toBe("failure");
    expect(notificationTone(notification({ kind: "plan_review" }))).toBe("review");
    expect(notificationTone(notification({ kind: "mart_published" }))).toBe("success");
  });
});
