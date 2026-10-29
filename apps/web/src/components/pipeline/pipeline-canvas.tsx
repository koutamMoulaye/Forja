"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Node,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { cubicBezier, useReducedMotion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/components/shell/shell-context";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { fitViewport, type Layout } from "@/lib/pipeline/layout";
import {
  LANES,
  LANE_TITLES,
  LANE_UNITS,
  filterCounts,
  laneSubtitle,
  laneSummary,
  lineage,
  matchesFilter,
  nodeInfo,
  nodeLook,
  type Filter,
  type GraphNode,
  type Lane,
  type ProjectGraph,
} from "@/lib/pipeline/model";
import { graphKey, useLayout } from "@/lib/pipeline/use-graph";
import { JOB_TEXT, RUN_DEFAULTS, isActive, runKeys, useProjectRuns } from "@/lib/project/use-runs";
import { CanvasEdge, type CanvasEdgeType } from "./canvas-edge";
import { CanvasMinimap } from "./canvas-minimap";
import { CanvasNode, zoomLevel, type CanvasNodeType, type ZoomLevel } from "./canvas-node";
import { CanvasToolbar, type RunChoice } from "./canvas-toolbar";
import { Inspector, isInspectorTab, type InspectorTab } from "./inspector";
import { LaneNode, type LaneNodeType } from "./lane-node";
import { detailHref } from "./routes";
import { useRunAnnouncements } from "./announcements";
import { ProfilingGhosts, UploadLayer, useUploads } from "./uploads";

const nodeTypes = { pipeline: CanvasNode, lane: LaneNode };
const edgeTypes = { pipeline: CanvasEdge };
const easeSoft = cubicBezier(0.32, 0.72, 0, 1);
const CAMERA = { duration: 440, ease: easeSoft };
const INSPECTOR_WIDTH = 404;
const TOOLBAR_SPACE = 100;
const MIN_ZOOM = 0.05;
/** Below this zoom the dotted background would be a dense, costly pattern. */
const DOTS_MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

function storageKey(kind: "viewport" | "lanes", projectId: string) {
  return `forja-${kind}:${projectId}`;
}

function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the canvas forgets on reload.
  }
}

/** Position tweening between two layouts (folding, new nodes), 340 ms. */
function useTween(layout: Layout | null, reduce: boolean): Layout | null {
  const [shown, setShown] = useState(layout);
  const from = useRef<Layout | null>(null);
  useEffect(() => {
    if (!layout) return;
    const start = from.current;
    if (!start || reduce) {
      from.current = layout;
      setShown(layout);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 340);
      const k = easeSoft(t);
      const nodes: Layout["nodes"] = {};
      for (const [id, target] of Object.entries(layout.nodes)) {
        const origin = start.nodes[id];
        nodes[id] = origin
          ? {
              ...target,
              x: origin.x + (target.x - origin.x) * k,
              y: origin.y + (target.y - origin.y) * k,
              width: origin.width + (target.width - origin.width) * k,
            }
          : target;
      }
      const lanes = layout.lanes.map((lane, index) => {
        const origin = start.lanes[index];
        return origin
          ? {
              ...lane,
              x: origin.x + (lane.x - origin.x) * k,
              width: origin.width + (lane.width - origin.width) * k,
            }
          : lane;
      });
      const current = { ...layout, nodes, lanes };
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [layout, reduce]);
  return layout ? shown : null;
}

/** The free part of the screen: right of the sidebar, under the top bar, above the toolbar. */
function useArea(container: React.RefObject<HTMLDivElement | null>, inspector: boolean) {
  const shell = useShell();
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);
  const sidebar = shell.tablet ? 0 : shell.sidebarOpen ? 240 : 64;
  const left = sidebar + 20;
  const top = 72;
  return {
    size,
    left,
    area: {
      left,
      top,
      width: Math.max(200, size.width - left - 28 - (inspector ? INSPECTOR_WIDTH : 0)),
      height: Math.max(200, size.height - top - TOOLBAR_SPACE),
    },
  };
}

function Dots() {
  const visible = useStore((s) => s.transform[2] >= DOTS_MIN_ZOOM);
  return visible ? <Background variant={BackgroundVariant.Dots} gap={24} size={1} /> : null;
}

type Props = { projectId: string; graph: ProjectGraph; synthetic?: boolean };

function Canvas({ projectId, graph, synthetic = false }: Props) {
  const shell = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const flow = useReactFlow();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion() ?? false;
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);

  const selectedId = params.get("node");
  const tabParam = params.get("tab");
  const tab: InspectorTab = isInspectorTab(tabParam) ? tabParam : "overview";
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const [filter, setFilter] = useState<Filter>("all");
  const [folded, setFolded] = useState<Partial<Record<Lane, boolean>>>(
    () => readStored(storageKey("lanes", projectId)) ?? {},
  );
  const [revision, setRevision] = useState(0);
  const layout = useLayout(graph, folded, revision);
  const shown = useTween(layout, reduce);
  const { area, size, left } = useArea(container, selected !== null);
  // Only the semantic level re-renders the canvas, not every frame of a zoom.
  const level: ZoomLevel = useStore((s) => zoomLevel(s.transform[2]));
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = useUploads(projectId, graph, fileInput);

  // Entrance: nodes enter 24 ms apart by rank the first time they show.
  const seen = useRef<Set<string> | null>(null);
  const [entering, setEntering] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!layout) return;
    const known = seen.current;
    const fresh = graph.nodes.filter((n) => layout.nodes[n.id] && !known?.has(n.id));
    if (!fresh.length) return;
    const order = [...fresh].sort(
      (a, b) =>
        LANES.indexOf(a.lane) - LANES.indexOf(b.lane) ||
        layout.nodes[a.id]!.x - layout.nodes[b.id]!.x ||
        layout.nodes[a.id]!.y - layout.nodes[b.id]!.y,
    );
    seen.current = new Set([...(known ?? []), ...fresh.map((n) => n.id)]);
    setEntering(new Map(order.map((n, rank) => [n.id, rank * 24])));
    const timer = window.setTimeout(() => setEntering(new Map()), 400 + order.length * 24);
    return () => window.clearTimeout(timer);
  }, [graph, layout]);

  const select = useCallback((id: string | null, nextTab?: InspectorTab) => {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("node", id);
      url.searchParams.set(
        "tab",
        nextTab ??
          (isInspectorTab(url.searchParams.get("tab")) ? url.searchParams.get("tab")! : "overview"),
      );
    } else {
      url.searchParams.delete("node");
      url.searchParams.delete("tab");
    }
    window.history.replaceState(null, "", url.toString());
  }, []);

  const fit = useCallback(
    (animate = true) => {
      if (!layout) return;
      flow.setViewport(fitViewport(layout, area), animate && !reduce ? CAMERA : undefined);
    },
    [flow, layout, area, reduce],
  );

  /** Centres a node in the free area, at least at 80 %. */
  const centerOn = useCallback(
    (id: string, minZoom = 0.8) => {
      const placed = layout?.nodes[id];
      if (!placed) return;
      const current = flow.getViewport();
      const z = Math.max(current.zoom, minZoom);
      const inspectorOpen = true;
      const width = size.width - left - 28 - (inspectorOpen ? INSPECTOR_WIDTH : 0);
      flow.setViewport(
        {
          zoom: z,
          x: left + width / 2 - (placed.x + placed.width / 2) * z,
          y: area.top + area.height / 2 - (placed.y + placed.height / 2) * z,
        },
        reduce ? undefined : CAMERA,
      );
    },
    [flow, layout, size.width, left, area, reduce],
  );

  /** After a selection, the camera brings the node out from under the inspector. */
  const reveal = useCallback(
    (id: string) => {
      const placed = layout?.nodes[id];
      if (!placed) return;
      const { x, y, zoom: z } = flow.getViewport();
      const right = size.width - 28 - INSPECTOR_WIDTH;
      const sx = placed.x * z + x;
      const sy = placed.y * z + y;
      const hidden =
        sx < left ||
        sx + placed.width * z > right ||
        sy < area.top ||
        sy + placed.height * z > area.top + area.height;
      if (hidden) centerOn(id);
    },
    [flow, layout, size.width, left, area, centerOn],
  );

  const pick = useCallback(
    (id: string, nextTab?: InspectorTab) => {
      select(id, nextTab);
      setFilter("all");
      requestAnimationFrame(() => reveal(id));
    },
    [select, reveal],
  );

  // First view: the stored camera of this project, otherwise « Ajuster ».
  const placedOnce = useRef(false);
  useEffect(() => {
    if (!layout || placedOnce.current) return;
    placedOnce.current = true;
    const stored = synthetic ? null : readStored<Viewport>(storageKey("viewport", projectId));
    const shared = selectedId ? byId.get(selectedId) : undefined;
    if (shared && layout.nodes[shared.id]) {
      // A shared link: frame the compartments up to the node's, the star schema at least.
      const last = layout.lanes[Math.max(2, LANES.indexOf(shared.lane))]!;
      const width = last.x + last.width;
      flow.setViewport(fitViewport({ width, height: layout.height }, area));
      requestAnimationFrame(() => reveal(shared.id));
    } else if (stored && Number.isFinite(stored.zoom)) flow.setViewport(stored);
    else fit(false);
  }, [layout, flow, fit, projectId, selectedId, reveal, synthetic, byId, area]);

  // An empty project receiving its first nodes: frame them.
  const hadNodes = useRef(graph.nodes.length > 0);
  useEffect(() => {
    if (!layout) return;
    const has = Object.keys(layout.nodes).length > 0;
    if (has && !hadNodes.current) fit();
    hadNodes.current = has;
  }, [layout, fit]);

  const open = useCallback(
    (node: GraphNode) => {
      const element = document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(node.id)}"]`,
      );
      const rect = element?.getBoundingClientRect();
      const href = detailHref(projectId, node);
      if (rect)
        shell.startTransition({ id: node.id, name: node.name, type: node.type, rect, href });
      router.push(href);
    },
    [projectId, router, shell],
  );

  // Lineage and filter fading.
  const line = useMemo(
    () => (selected ? lineage(selected.id, graph.edges) : null),
    [selected, graph.edges],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // « Réussi » fades back to the calm state a few seconds after a run.
    const recent = graph.nodes.some((n) => n.run?.status === "succeeded" && n.run.finished_at);
    if (!recent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [graph]);

  const nodes = useMemo<Node[]>(() => {
    if (!shown) return [];
    const byLane = new Map<Lane, GraphNode[]>(LANES.map((lane) => [lane, []]));
    for (const node of graph.nodes) byLane.get(node.lane)!.push(node);
    const lanes: LaneNodeType[] = shown.lanes.map((placed) => {
      const members = byLane.get(placed.lane)!;
      const review = members.filter((n) => n.state === "review" || n.state === "proposed").length;
      const errors = members.filter((n) => n.state === "error").length;
      const running = members.filter((n) => n.state === "running").length;
      const [one, many] = LANE_UNITS[placed.lane];
      return {
        id: `lane:${placed.lane}`,
        type: "lane",
        position: { x: placed.x, y: 0 },
        width: placed.width,
        height: shown.height + 600,
        style: { width: placed.width, height: shown.height + 600 },
        zIndex: -1,
        selectable: false,
        draggable: false,
        focusable: false,
        data: {
          lane: placed.lane,
          title: LANE_TITLES[placed.lane],
          subtitle: uploads.subtitle(placed.lane) ?? laneSubtitle(placed.lane, members),
          open: placed.open,
          count: members.length,
          unit: members.length > 1 ? many : one,
          summary: laneSummary(members),
          chips: [
            running ? { kind: "run" as const, count: running, label: `${running} en cours` } : null,
            review ? { kind: "prop" as const, count: review, label: `${review} à revoir` } : null,
            errors ? { kind: "err" as const, count: errors, label: `${errors} en erreur` } : null,
          ].filter((chip) => chip !== null),
          level,
          waiting: graph.nodes.length === 0 && placed.lane !== "sources",
          onToggle: (lane: Lane) =>
            setFolded((current) => {
              const next = { ...current, [lane]: !current[lane] };
              writeStored(storageKey("lanes", projectId), next);
              return next;
            }),
        },
      };
    });
    const pipeline: CanvasNodeType[] = graph.nodes
      .filter((n) => shown.nodes[n.id])
      .map((node) => {
        const placed = shown.nodes[node.id]!;
        const look = nodeLook(node, now);
        return {
          id: node.id,
          type: "pipeline",
          position: { x: placed.x, y: placed.y },
          width: placed.hidden ? 1 : placed.width,
          style: { width: placed.hidden ? 1 : placed.width },
          selectable: false,
          draggable: false,
          focusable: !placed.hidden,
          ariaLabel: `${node.name}, ${look.loud ? look.label : "appliqué"}${nodeInfo(node) ? `, ${nodeInfo(node)}` : ""}`,
          data: {
            node,
            look,
            info: nodeInfo(node),
            level,
            dimmed: (line !== null && !line.has(node.id)) || !matchesFilter(node, filter),
            active: selected?.id === node.id || (line?.has(node.id) ?? false),
            selected: selected?.id === node.id,
            hidden: placed.hidden,
            enterDelay: entering.get(node.id) ?? null,
            height: placed.height,
          },
        };
      });
    return [...lanes, ...pipeline];
  }, [shown, graph, level, line, filter, selected, entering, now, projectId, uploads]);

  const edges = useMemo<CanvasEdgeType[]>(() => {
    const visible = new Set(graph.nodes.filter((n) => matchesFilter(n, filter)).map((n) => n.id));
    return graph.edges
      .filter((e) => shown?.nodes[e.source] && shown?.nodes[e.target])
      .map((edge) => {
        const onLineage = line !== null && line.has(edge.source) && line.has(edge.target);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "pipeline",
          selectable: false,
          focusable: false,
          data: {
            edge,
            onLineage,
            dimmed:
              (line !== null && !onLineage) ||
              (filter !== "all" && !visible.has(edge.source) && !visible.has(edge.target)),
            labelled: level !== "far",
          },
        };
      });
  }, [graph, shown, line, filter, level]);

  // Runs launched from the toolbar.
  const runs = useProjectRuns(projectId);
  const busy = runs.data?.some((run) => isActive(run.status)) ?? false;
  const launch = useMutation({
    mutationFn: async (type: RunChoice) =>
      unwrap(
        await api.POST("/projects/{project_id}/runs", {
          params: { path: { project_id: projectId } },
          body: { type, ...RUN_DEFAULTS, use_llm: true },
        }),
      ),
    onSuccess: (job) => {
      toast.info({
        title: `${JOB_TEXT[job.type].label} lancé`,
        description: "Le canvas suit chaque table",
      });
      void queryClient.invalidateQueries({ queryKey: runKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: graphKey(projectId) });
    },
    onError: (error) =>
      toast.error({
        title: "Impossible de lancer le run",
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
  const announcement = useRunAnnouncements(graph);

  const counts = useMemo(() => filterCounts(graph.nodes), [graph.nodes]);

  const zoomBy = useCallback(
    (factor: number) => {
      const { x, y, zoom: z } = flow.getViewport();
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      const cx = area.left + area.width / 2;
      const cy = area.top + area.height / 2;
      const wx = (cx - x) / z;
      const wy = (cy - y) / z;
      flow.setViewport(
        { zoom: next, x: cx - wx * next, y: cy - wy * next },
        reduce ? undefined : { duration: 240, ease: easeSoft },
      );
    },
    [flow, area, reduce],
  );

  /** Arrow keys move the focus to the nearest node in that direction. */
  const moveFocus = useCallback(
    (from: string | null, key: string) => {
      if (!layout) return;
      const candidates = graph.nodes.filter(
        (n) => layout.nodes[n.id] && !layout.nodes[n.id]!.hidden,
      );
      let target: string | undefined;
      const origin = from ? layout.nodes[from] : undefined;
      if (!origin) {
        target = candidates[0]?.id;
      } else {
        const ox = origin.x + origin.width / 2;
        const oy = origin.y + origin.height / 2;
        let best = Infinity;
        for (const node of candidates) {
          if (node.id === from) continue;
          const p = layout.nodes[node.id]!;
          const dx = p.x + p.width / 2 - ox;
          const dy = p.y + p.height / 2 - oy;
          const [primary, secondary] =
            key === "ArrowRight"
              ? [dx, dy]
              : key === "ArrowLeft"
                ? [-dx, dy]
                : key === "ArrowDown"
                  ? [dy, dx]
                  : [-dy, dx];
          if (primary <= 1) continue;
          const score = primary + 2 * Math.abs(secondary);
          if (score < best) {
            best = score;
            target = node.id;
          }
        }
      }
      if (!target) return;
      document
        .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(target)}"]`)
        ?.focus({ preventScroll: true });
      const p = layout.nodes[target]!;
      const { x, y, zoom: z } = flow.getViewport();
      const sx = p.x * z + x;
      const sy = p.y * z + y;
      const right = area.left + area.width;
      if (
        sx < area.left ||
        sx + p.width * z > right ||
        sy < area.top ||
        sy + p.height * z > area.top + area.height
      ) {
        centerOn(target, z);
      }
    },
    [graph.nodes, layout, flow, area, centerOn],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        shell.paletteOpen ||
        (target &&
          (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const focused = target?.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null;
      const inCanvas = !!target?.closest(".react-flow") || target === document.body;
      if (!inCanvas && !focused) return;
      if (event.key === "+" || event.key === "=") zoomBy(1.2);
      else if (event.key === "-") zoomBy(1 / 1.2);
      else if (event.key === "0") fit();
      else if (event.key === "Escape") select(null);
      else if (event.key === "Enter" && focused && byId.has(focused)) pick(focused);
      else if (event.key.startsWith("Arrow")) moveFocus(focused ?? selectedId, event.key);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shell.paletteOpen, zoomBy, fit, select, pick, moveFocus, byId, selectedId]);

  // ⌘K: the palette searches the nodes and offers actions about them. The callbacks
  // change on every render; the palette reads the latest ones through this ref.
  const actions = useRef({
    select,
    centerOn,
    pick,
    launch: launch.mutate,
    choose: uploads.choose,
    fit,
  });
  useEffect(() => {
    actions.current = {
      select,
      centerOn,
      pick,
      launch: launch.mutate,
      choose: uploads.choose,
      fit,
    };
  });
  const { registerCanvas } = shell;
  useEffect(() => {
    registerCanvas({
      nodes: graph.nodes.map((node) => ({ node, lane: LANE_TITLES[node.lane] })),
      focus: (id) => {
        actions.current.select(id);
        setFilter("all");
        actions.current.centerOn(id);
      },
      review: (id, nextTab) => actions.current.pick(id, nextTab),
      run: (type) => actions.current.launch(type),
      add: () => actions.current.choose(),
      filter: (next) => setFilter(next),
      fit: () => actions.current.fit(),
    });
  }, [registerCanvas, graph.nodes]);
  useEffect(() => () => registerCanvas(null), [registerCanvas]);

  const [toolbarWidth, setToolbarWidth] = useState(660);
  useEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setToolbarWidth(element.offsetWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [graph.nodes.length, uploads.active]);
  const minimapRoom = size.width - left - 236 >= toolbarWidth + 24;
  const toolbarLeft = selected
    ? area.left + area.width / 2
    : minimapRoom
      ? (left + size.width - 236) / 2
      : left + (size.width - left) / 2;

  return (
    <div
      ref={container}
      className="pipeline-canvas absolute inset-0 bg-cv"
      onDragOver={uploads.onDragOver}
      onDragLeave={uploads.onDragLeave}
      onDrop={uploads.onDrop}
    >
      <h1 className="sr-only">Canvas du pipeline de {shell.project.name}</h1>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        onlyRenderVisibleElements={graph.nodes.length > 80}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => node.type === "pipeline" && pick(node.id)}
        onNodeDoubleClick={(_, node) => {
          const target = byId.get(node.id);
          if (target) open(target);
        }}
        onPaneClick={() => select(null)}
        onMoveEnd={(_, viewport) =>
          !synthetic && writeStored(storageKey("viewport", projectId), viewport)
        }
        aria-label="Graphe du pipeline"
      >
        <Dots />
        {layout ? <ProfilingGhosts uploads={uploads} layout={layout} graph={graph} /> : null}
      </ReactFlow>
      <UploadLayer
        inputRef={fileInput}
        uploads={uploads}
        empty={graph.nodes.length === 0}
        area={area}
        onDemo={() => {
          const demo = shell.projects.find((p) => p.name === "Démo e-commerce");
          if (demo) router.push(`/projects/${demo.id}/pipeline`);
          else
            toast.info({
              title: "Projet de démo absent",
              description: "Lancez « uv run forja demo » sur le poste, puis rechargez.",
            });
        }}
      />
      {graph.nodes.length > 0 || uploads.active ? (
        <>
          <CanvasToolbar
            ref={toolbar}
            style={{ left: toolbarLeft }}
            filter={filter}
            counts={counts}
            onFilter={setFilter}
            onZoomIn={() => zoomBy(1.25)}
            onZoomOut={() => zoomBy(1 / 1.25)}
            onFit={() => fit()}
            onAutoLayout={() => {
              setFolded({});
              writeStored(storageKey("lanes", projectId), {});
              setRevision((r) => r + 1);
              toast.info({
                title: "Mise en page recalculée",
                description: "Compartiments dépliés, graphe ajusté",
              });
              window.setTimeout(() => fit(), 380);
            }}
            onAdd={uploads.choose}
            onRun={(type) => launch.mutate(type)}
            running={busy || launch.isPending}
            canRun={!launch.isPending}
          />
          {layout && minimapRoom ? (
            <CanvasMinimap
              layout={layout}
              nodes={graph.nodes}
              area={area}
              visible={selected === null}
              onNavigate={(wx, wy) => {
                const z = flow.getViewport().zoom;
                flow.setViewport(
                  {
                    zoom: z,
                    x: area.left + area.width / 2 - wx * z,
                    y: area.top + area.height / 2 - wy * z,
                  },
                  reduce ? undefined : CAMERA,
                );
              }}
            />
          ) : null}
        </>
      ) : null}
      <Inspector
        node={selected}
        tab={tab}
        graph={graph}
        projectId={projectId}
        onTab={(next) => select(selected?.id ?? null, next)}
        onClose={() => select(null)}
        onSelect={(id) => pick(id)}
        onOpen={open}
      />
      <div aria-live="polite" className="sr-only" data-testid="run-announcer">
        {announcement}
      </div>
    </div>
  );
}

export function PipelineCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
