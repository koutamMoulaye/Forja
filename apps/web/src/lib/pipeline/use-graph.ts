"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useProjectRuns, isActive } from "@/lib/project/use-runs";
import { placeLanes, rankGraph, type Layout, type LayoutInput, type Ranked } from "./layout";
import { stacksInfo, type Lane, type ProjectGraph } from "./model";

export const graphKey = (projectId: string) => ["graph", projectId] as const;

/** While something runs the graph is polled every 1.5 s (a 304 when nothing changed). */
const BUSY_POLL_MS = 1500;
const IDLE_POLL_MS = 20_000;

/**
 * GET /projects/{id}/graph with its ETag: an unchanged graph costs a 304 and keeps the
 * same object, so nothing re-renders.
 */
export function useProjectGraph(projectId: string, enabled = true) {
  const etag = useRef<{ tag: string; graph: ProjectGraph } | null>(null);
  const runs = useProjectRuns(projectId, enabled);
  const runsBusy = runs.data?.some((run) => isActive(run.status)) ?? false;
  return useQuery({
    queryKey: graphKey(projectId),
    enabled,
    queryFn: async (): Promise<ProjectGraph> => {
      const cached = etag.current;
      const result = await api.GET("/projects/{project_id}/graph", {
        params: { path: { project_id: projectId } },
        headers: cached ? { "If-None-Match": cached.tag } : undefined,
      });
      if (result.response.status === 304 && cached) return cached.graph;
      if (!result.data)
        throw new ApiError(result.response.status, "empty_response", "Réponse vide");
      const tag = result.response.headers.get("ETag");
      etag.current = tag ? { tag, graph: result.data } : null;
      return result.data;
    },
    refetchInterval: (query) => {
      const busy = query.state.data?.nodes.some(
        (n) => n.run && (n.run.status === "running" || n.run.status === "queued"),
      );
      return busy || runsBusy ? BUSY_POLL_MS : IDLE_POLL_MS;
    },
  });
}

let worker: Worker | null | undefined;
let workerReady: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, (result: { ranked?: Ranked; error?: string }) => void>();

type WorkerMessage = { ready?: true; id?: number; ranked?: Ranked; error?: string };

function layoutWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const created = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });
    workerReady = new Promise((resolve) => {
      created.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.ready) return resolve();
        const id = event.data.id!;
        pending.get(id)?.(event.data);
        pending.delete(id);
      };
    });
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

/** ELK in a Web Worker; on the main thread where workers are missing (tests). */
export async function rank(input: LayoutInput): Promise<Ranked> {
  const target = typeof Worker === "undefined" ? null : layoutWorker();
  if (!target) {
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    return rankGraph(new ELK(), input);
  }
  await workerReady;
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (result) =>
      result.ranked ? resolve(result.ranked) : reject(new Error(result.error)),
    );
    target.postMessage({ id, input });
  });
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
  const [ranked, setRanked] = useState<Ranked | null>(null);

  useEffect(() => {
    let live = true;
    rank(structure.input).then(
      (result) => live && setRanked(result),
      () => live && setRanked({ nodes: {}, height: 0 }),
    );
    return () => {
      live = false;
    };
  }, [structure, revision]);

  return useMemo(() => {
    if (!graph || !ranked) return null;
    // Nodes the ranking does not know yet appear once it is done.
    const known = { ...input, nodes: input.nodes.filter((n) => ranked.nodes[n.id]) };
    return placeLanes(known, ranked, folded);
  }, [graph, ranked, input, folded]);
}
