"use client";

import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { API_PROXY_PREFIX } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { keys } from "@/lib/project/queries";
import { isActive, runKeys, type Job } from "@/lib/project/use-runs";

export type AppNotification = components["schemas"]["Notification"];

/**
 * Whether the event stream (GET /events through the proxy) is open. Queries that used to
 * poll the runs and the agent poll only while it is not: the stream carries their
 * changes.
 */
let connected = false;
const listeners = new Set<() => void>();

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  listeners.forEach((listener) => listener());
}

export function useLiveEvents(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => connected,
    () => false,
  );
}

/** A polling interval that applies only while the stream is down. */
export function offlinePoll(live: boolean, ms: number | false): number | false {
  return live ? false : ms;
}

export const notificationKeys = {
  all: ["notifications"] as const,
};

/** Agent queries, named here to avoid an import cycle with lib/agent/queries. */
const martRequestKey = (martId: string) => ["mart-request", martId] as const;

/** Applies a run sent by the stream to the cached run and run lists. */
export function applyJob(client: QueryClient, job: Job) {
  const previous = client.getQueryData<Job>(runKeys.detail(job.id));
  client.setQueryData(runKeys.detail(job.id), job);
  client.setQueryData<Job[]>(runKeys.list(job.project_id), (runs) => {
    if (!runs) return runs;
    const index = runs.findIndex((run) => run.id === job.id);
    if (index < 0) return [job, ...runs];
    const next = [...runs];
    next[index] = job;
    return next;
  });
  const ended = !isActive(job.status) && (!previous || isActive(previous.status));
  const started = job.status !== previous?.status;
  if (started || ended) {
    void client.invalidateQueries({ queryKey: ["graph", job.project_id] });
  }
  if (!ended) return;
  void client.invalidateQueries({ queryKey: ["counters", job.project_id] });
  const martId = job.params.mart_request_id;
  if (martId) {
    void client.invalidateQueries({ queryKey: martRequestKey(martId) });
    void client.invalidateQueries({ queryKey: keys.marts(job.project_id) });
  }
  if (job.type === "build_gold" || job.type === "build_all" || job.type === "gold_proposal") {
    void client.invalidateQueries({ queryKey: ["gold-plan", job.project_id] });
    void client.invalidateQueries({ queryKey: keys.tables(job.project_id) });
    void client.invalidateQueries({ queryKey: ["semantic", job.project_id] });
    void client.invalidateQueries({ queryKey: ["agent-overview", job.project_id] });
  }
}

/** A notification may mean that a request changed elsewhere (approved, rejected). */
export function applyNotification(client: QueryClient, notification: AppNotification) {
  void client.invalidateQueries({ queryKey: notificationKeys.all });
  const action = notification.action;
  if (action && (action.target_type === "mart" || action.target_type === "conversation")) {
    void client.invalidateQueries({ queryKey: martRequestKey(action.target_id) });
  }
  if (notification.project_id) {
    void client.invalidateQueries({ queryKey: ["counters", notification.project_id] });
    void client.invalidateQueries({ queryKey: keys.marts(notification.project_id) });
  }
}

/** Everything the stream would have told while it was down. */
export function refreshAfterGap(client: QueryClient) {
  for (const key of [["runs"], ["run"], ["marts"], ["mart-request"], ["counters"], ["graph"]]) {
    void client.invalidateQueries({ queryKey: key });
  }
  void client.invalidateQueries({ queryKey: notificationKeys.all });
}

export type StreamHandlers = {
  onJob: (job: Job) => void;
  onNotification: (notification: AppNotification) => void;
  onReconnect: () => void;
};

const STALE_MS = 45_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Opens the stream and keeps it open: the browser reconnects after a network error; a
 * stream closed for good (session refreshed, server restarted) or silent for longer
 * than three heartbeats is reopened with a growing delay. Returns the closing function.
 */
export function openEventStream(handlers: StreamHandlers): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  let source: EventSource | null = null;
  let stopped = false;
  let backoff = 2000;
  let wasOpen = false;
  let lastSeen = Date.now();
  let retry: number | undefined;

  const seen = () => {
    lastSeen = Date.now();
  };

  const schedule = () => {
    source?.close();
    source = null;
    setConnected(false);
    if (stopped) return;
    window.clearTimeout(retry);
    retry = window.setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  const connect = () => {
    if (stopped) return;
    seen();
    const stream = new EventSource(`${API_PROXY_PREFIX}/events`);
    source = stream;
    stream.addEventListener("ready", () => {
      seen();
      backoff = 2000;
      setConnected(true);
      if (wasOpen) handlers.onReconnect();
      wasOpen = true;
    });
    stream.addEventListener("ping", seen);
    stream.addEventListener("job", (event) => {
      seen();
      handlers.onJob(JSON.parse((event as MessageEvent<string>).data) as Job);
    });
    stream.addEventListener("notification", (event) => {
      seen();
      handlers.onNotification(JSON.parse((event as MessageEvent<string>).data) as AppNotification);
    });
    stream.onerror = () => {
      setConnected(false);
      // CONNECTING: the browser retries by itself; CLOSED: it gave up (HTTP error).
      if (stream.readyState === EventSource.CLOSED) schedule();
    };
  };

  const watchdog = window.setInterval(() => {
    if (source && Date.now() - lastSeen > STALE_MS) schedule();
  }, 5000);

  connect();
  return () => {
    stopped = true;
    window.clearInterval(watchdog);
    window.clearTimeout(retry);
    source?.close();
    source = null;
    setConnected(false);
  };
}
