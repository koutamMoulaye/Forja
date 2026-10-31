"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useProjectRuns, isActive } from "@/lib/project/use-runs";
import {
  placeLanes,
  quickRank,
  rankGraph,
  type Layout,
  type LayoutInput,
  type Ranked,
} from "./layout";
import { stacksInfo, type Lane, type ProjectGraph } from "./model";
import { useLiveEvents } from "@/lib/events/live";

export const graphKey = (projectId: string) => ["graph", projectId] as const;

/** While something runs the graph is polled every 1.5 s (a 304 when nothing changed). */
const BUSY_POLL_MS = 1500;
const IDLE_POLL_MS = 20_000;

/** The last graph of each project with its ETag. */
const etags = new Map<string, { tag: string; graph: ProjectGraph }>();

/**
 * GET /projects/{id}/graph with its ETag: an unchanged graph costs a 304 and keeps the
 * same object, so nothing re-renders.
 */
export async function fetchGraph(projectId: string): Promise<ProjectGraph> {
  const cached = etags.get(projectId);
  const result = await api.GET("/projects/{project_id}/graph", {
    params: { path: { project_id: projectId } },
    headers: cached ? { "If-None-Match": cached.tag } : undefined,
  });
  if (result.response.status === 304 && cached) return cached.graph;
  if (!result.data) throw new ApiError(result.response.status, "empty_response", "Réponse vide");
  const tag = result.response.headers.get("ETag");
  if (tag) etags.set(projectId, { tag, graph: result.data });
  else etags.delete(projectId);
  return result.data;
}

export function useProjectGraph(projectId: string, enabled = true) {
  const runs = useProjectRuns(projectId, enabled);
  const runsBusy = runs.data?.some((run) => isActive(run.status)) ?? false;
  const stream = useLiveEvents();
  return useQuery({
    queryKey: graphKey(projectId),
    enabled,
    queryFn: () => fetchGraph(projectId),
    refetchInterval: (query) => {
      const busy = query.state.data?.nodes.some(
        (n) => n.run && (n.run.status === "running" || n.run.status === "queued"),
      );
      if (busy || runsBusy) return BUSY_POLL_MS;
      return stream ? false : IDLE_POLL_MS;
    },
  });
}

let worker: Worker | null | undefined;
let workerReady: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, (result: { ranked?: Ranked; error?: string }) => void>();

type WorkerMessage = { ready?: true; id?: number; ranked?: Ranked; error?: string };

/** A worker that does not answer within this delay is given up for the main thread. */
const WORKER_READY_MS = 8000;

function layoutWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const created = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });
    workerReady = new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("layout worker did not start")),
        WORKER_READY_MS,
      );
      created.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.ready) {
          window.clearTimeout(timer);
          return resolve();
        }
        const id = event.data.id!;
        pending.get(id)?.(event.data);
        pending.delete(id);
      };
      // A worker script that fails to load (network, CSP) must not leave the canvas on
      // its skeleton: the ranking falls back to the main thread.
      created.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("layout worker failed"));
      };
    });
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Starts the layout worker, and with it the download of ELK, before the graph arrives:
 * the pipeline screen calls it on mount, so the ranking does not wait for them after.
 */
export function warmLayout(): void {
  if (typeof Worker !== "undefined") layoutWorker();
}

async function rankHere(input: LayoutInput): Promise<Ranked> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  return rankGraph(new ELK(), input);
}

/** ELK in a Web Worker; on the main thread where workers are missing (tests) or fail. */
export async function rank(input: LayoutInput): Promise<Ranked> {
  const target = typeof Worker === "undefined" ? null : layoutWorker();
  if (!target) return rankHere(input);
  try {
    await workerReady;
  } catch {
    target.terminate();
    worker = null;
    return rankHere(input);
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (result) =>
      result.ranked ? resolve(result.ranked) : reject(new Error(result.error)),
    );
    target.postMessage({ id, input });
  });
}

const RANKING_KEY = "forja.ranking.";

/** ELK has this long to answer before the quick ranking is drawn in its place. */
const ELK_PATIENCE_MS = 800;

/**
 * The last ranking of a project, kept in this browser: ELK takes from 0.2 s to more than
 * 2 s on a busy page, for a result that only changes with the pipeline's structure.
 */
function readRanking(projectId: string, key: string): Ranked | null {
  try {
    const raw = window.localStorage.getItem(RANKING_KEY + projectId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { key: string; ranked: Ranked };
    return saved.key === key ? saved.ranked : null;
  } catch {
    return null;
  }
}

function saveRanking(projectId: string, key: string, ranked: Ranked): void {
  try {
    window.localStorage.setItem(RANKING_KEY + projectId, JSON.stringify({ key, ranked }));
  } catch {
    // Storage full or refused: the next visit ranks again.
  }
}

/** Only what moves nodes: ids, compartments, names and stacked infos (heights), links. */
function structureKey(input: LayoutInput): string {
  return JSON.stringify([
    input.nodes.map((n) => [n.id, n.lane, n.type, n.name.length > 18, Boolean(n.stacked)]),
    input.edges.map((e) => [e.source, e.target]),
  ]);
}

export function useLayout(
  graph: ProjectGraph | undefined,
  folded: Partial<Record<Lane, boolean>>,
  /** Bumped by « Mise en page automatique » to rerun ELK. */
  revision = 0,
): Layout | null {
  const input = useMemo<LayoutInput>(
    () => ({
      nodes: (graph?.nodes ?? []).map((node) => ({
        id: node.id,
        type: node.type,
        lane: node.lane,
        name: node.name,
        stacked: stacksInfo(node),
      })),
      edges: (graph?.edges ?? []).map(({ source, target }) => ({ source, target })),
    }),
    [graph],
  );
  const key = useMemo(() => structureKey(input), [input]);
  // The structure only changes when nodes or links do: states alone never rerun ELK.
  const [structure, setStructure] = useState({ key, input });
  if (structure.key !== key) setStructure({ key, input });
  const projectId = graph?.project_id ?? null;
  const [computed, setComputed] = useState<Ranked | null>(null);
  // The same structure was ranked before on this browser: drawn at once, without ELK.
  const cached = useMemo(
    () => (revision === 0 && projectId ? readRanking(projectId, structure.key) : null),
    [revision, projectId, structure.key],
  );

  // ELK late (its first start on a slow machine) or failed: the quick ranking is drawn.
  const [impatient, setImpatient] = useState<string | null>(null);
  useEffect(() => {
    if (cached) return;
    let live = true;
    const timer = window.setTimeout(() => setImpatient(structure.key), ELK_PATIENCE_MS);
    rank(structure.input).then(
      (result) => {
        window.clearTimeout(timer);
        if (projectId) saveRanking(projectId, structure.key, result);
        if (live) setComputed(result);
      },
      () => {
        window.clearTimeout(timer);
        if (live) setImpatient(structure.key);
      },
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [cached, structure, revision, projectId]);
  const quick = useMemo(
    () => (!cached && !computed && impatient === structure.key ? quickRank(structure.input) : null),
    [cached, computed, impatient, structure],
  );
  const ranked = cached ?? computed ?? quick;

  return useMemo(() => {
    if (!graph || !ranked) return null;
    // Nodes the ranking does not know yet appear once it is done.
    const known = { ...input, nodes: input.nodes.filter((n) => ranked.nodes[n.id]) };
    return { ...placeLanes(known, ranked, folded), provisional: ranked === quick };
  }, [graph, ranked, quick, input, folded]);
}
