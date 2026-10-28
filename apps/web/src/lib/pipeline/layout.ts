import type { ELK, ElkNode } from "elkjs/lib/elk-api";
import { LANES, type Lane, type NodeType } from "./model";

/**
 * Layout of the canvas in two steps.
 *
 * 1. `rankGraph` asks ELK (layered, left to right, crossing minimisation, one partition
 *    per compartment) for the order of the nodes: their column inside the compartment
 *    and their height. It runs in a Web Worker on the canvas.
 * 2. `placeLanes` turns that order into the mockup's geometry: compartments side by
 *    side, 20 px of padding, 232 px columns. Folding a compartment only reruns this step.
 */

export type LayoutInput = {
  /** stacked: badge and info on two lines (see stacksInfo). */
  nodes: { id: string; type: NodeType; lane: Lane; name: string; stacked?: boolean }[];
  edges: { source: string; target: string }[];
};

/** Geometry of ForjaApp's canvas. */
export const GEOMETRY = {
  top: 92,
  bottom: 118,
  lanePadding: 20,
  laneGap: 14,
  foldedWidth: 76,
  column: 232,
  narrowColumn: 160,
  columnGap: { sources: 56, cleaning: 56, star_schema: 80, serving: 56 } as Record<Lane, number>,
  nodeHeight: 72,
  tallNodeHeight: 94,
  /** Second line under the badge of a node to review or in error. */
  stackedExtra: 24,
  /** Extra height of a node zoomed in (key columns, quality); reserved by the layout. */
  nearExtra: 52,
  rowGap: 12,
  minHeight: 560,
} as const;

export function nodeWidth(type: NodeType): number {
  return type === "destination" ? GEOMETRY.narrowColumn : GEOMETRY.column;
}

/** Names over 18 characters take two lines, as in the mockup; a stacked info one more. */
export function nodeHeight(name: string, stacked = false): number {
  const base = name.length > 18 ? GEOMETRY.tallNodeHeight : GEOMETRY.nodeHeight;
  return stacked ? base + GEOMETRY.stackedExtra : base;
}

export type Ranked = {
  /** Column inside the compartment and top of the node (without the header offset). */
  nodes: Record<string, { column: number; y: number }>;
  height: number;
};

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.partitioning.activate": "true",
  // One pipeline, even when it has independent branches: no packing of components.
  "elk.separateConnectedComponents": "false",
  "elk.edgeRouting": "SPLINES",
  "elk.spacing.nodeNode": String(GEOMETRY.rowGap),
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.thoroughness": "30",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.nodePlacement.favorStraightEdges": "true",
  "elk.padding": "[top=0,left=0,bottom=0,right=0]",
};

export async function rankGraph(
  elk: ELK,
  input: LayoutInput,
  options: Record<string, string> = {},
): Promise<Ranked> {
  const ids = new Set(input.nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: { ...ELK_OPTIONS, ...options },
    children: input.nodes.map((node) => ({
      id: node.id,
      width: nodeWidth(node.type),
      height: nodeHeight(node.name, node.stacked) + GEOMETRY.nearExtra,
      layoutOptions: { "elk.partitioning.partition": String(LANES.indexOf(node.lane)) },
    })),
    edges: input.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e, index) => ({ id: `e${index}`, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);
  const placed = result.children ?? [];

  // Layers are the distinct x positions; a compartment's columns are its layers in order.
  const xs = [...new Set(placed.map((n) => Math.round(n.x ?? 0)))].sort((a, b) => a - b);
  const layers: number[] = [];
  for (const x of xs) {
    if (!layers.length || x - layers[layers.length - 1]! > GEOMETRY.narrowColumn / 2) {
      layers.push(x);
    }
  }
  const layerOf = (x: number) =>
    layers.reduce(
      (best, layer, index) => (Math.abs(layer - x) < Math.abs(layers[best]! - x) ? index : best),
      0,
    );
  const laneOf = new Map(input.nodes.map((n) => [n.id, n.lane]));
  const laneLayers = new Map<Lane, number[]>();
  for (const node of placed) {
    const lane = laneOf.get(node.id)!;
    const layer = layerOf(Math.round(node.x ?? 0));
    const list = laneLayers.get(lane) ?? [];
    if (!list.includes(layer)) list.push(layer);
    laneLayers.set(lane, list);
  }
  for (const list of laneLayers.values()) list.sort((a, b) => a - b);

  const nodes: Ranked["nodes"] = {};
  const heights = new Map(placed.map((n) => [n.id, n.height ?? 0]));
  for (const node of placed) {
    const lane = laneOf.get(node.id)!;
    const column = laneLayers.get(lane)!.indexOf(layerOf(Math.round(node.x ?? 0)));
    nodes[node.id] = { column, y: Math.round(node.y ?? 0) };
  }
  alignChains(input, nodes, heights, laneOf);
  let height = 0;
  for (const [id, rank] of Object.entries(nodes)) {
    height = Math.max(height, rank.y + heights.get(id)!);
  }
  return { nodes, height };
}

/**
 * A node fed by a single parent, which feeds only it, takes the parent's height when
 * nothing in its column is in the way: a source and its cleaned table share a row.
 */
function alignChains(
  input: LayoutInput,
  nodes: Ranked["nodes"],
  heights: Map<string, number>,
  laneOf: Map<string, Lane>,
) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of input.edges) {
    if (!nodes[edge.source] || !nodes[edge.target]) continue;
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const ordered = [...input.nodes].sort((a, b) => LANES.indexOf(a.lane) - LANES.indexOf(b.lane));
  for (const node of ordered) {
    const parents = incoming.get(node.id) ?? [];
    if (parents.length !== 1 || (outgoing.get(parents[0]!) ?? []).length !== 1) continue;
    const target = nodes[parents[0]!]!.y;
    const self = nodes[node.id]!;
    if (target === self.y) continue;
    const height = heights.get(node.id)!;
    const blocked = Object.entries(nodes).some(
      ([id, other]) =>
        id !== node.id &&
        laneOf.get(id) === laneOf.get(node.id) &&
        other.column === self.column &&
        other.y < target + height + GEOMETRY.rowGap &&
        target < other.y + heights.get(id)! + GEOMETRY.rowGap,
    );
    if (!blocked) self.y = target;
  }
}

export type PlacedNode = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** In a folded compartment: drawn as a point at the compartment's centre. */
  hidden: boolean;
};

export type PlacedLane = { lane: Lane; x: number; width: number; open: boolean };

export type Layout = {
  nodes: Record<string, PlacedNode>;
  lanes: PlacedLane[];
  width: number;
  height: number;
};

export function placeLanes(
  input: LayoutInput,
  ranked: Ranked,
  folded: Partial<Record<Lane, boolean>> = {},
): Layout {
  const byLane = new Map<Lane, LayoutInput["nodes"]>(LANES.map((lane) => [lane, []]));
  for (const node of input.nodes) byLane.get(node.lane)!.push(node);

  const nodes: Layout["nodes"] = {};
  const lanes: PlacedLane[] = [];
  let x = 0;
  for (const lane of LANES) {
    const members = byLane.get(lane)!;
    const columns = Math.max(1, ...members.map((n) => (ranked.nodes[n.id]?.column ?? 0) + 1));
    const widths = Array.from({ length: columns }, (_, column) => {
      const inColumn = members.filter((n) => (ranked.nodes[n.id]?.column ?? 0) === column);
      return inColumn.length
        ? Math.max(...inColumn.map((n) => nodeWidth(n.type)))
        : GEOMETRY.column;
    });
    const gap = GEOMETRY.columnGap[lane];
    const open = !folded[lane];
    const full = 2 * GEOMETRY.lanePadding + widths.reduce((a, b) => a + b, 0) + gap * (columns - 1);
    const width = open ? full : GEOMETRY.foldedWidth;
    const offsets = widths.map((_, column) =>
      widths.slice(0, column).reduce((sum, w) => sum + w + gap, 0),
    );
    for (const node of members) {
      const rank = ranked.nodes[node.id] ?? { column: 0, y: 0 };
      const height = nodeHeight(node.name, node.stacked);
      const y = GEOMETRY.top + rank.y;
      nodes[node.id] = open
        ? {
            x: x + GEOMETRY.lanePadding + offsets[rank.column]!,
            y,
            width: nodeWidth(node.type),
            height,
            hidden: false,
          }
        : { x: x + GEOMETRY.foldedWidth / 2, y, width: 0, height, hidden: true };
    }
    lanes.push({ lane, x, width, open });
    x += width + GEOMETRY.laneGap;
  }
  const height = Math.max(GEOMETRY.minHeight, GEOMETRY.top + ranked.height + GEOMETRY.bottom);
  return { nodes, lanes, width: x - GEOMETRY.laneGap, height };
}

/** Viewport framing the whole layout in the free area, as ForjaApp's « Ajuster ». */
export function fitViewport(
  layout: { width: number; height: number },
  area: { left: number; top: number; width: number; height: number },
  maxZoom = 1.1,
): { x: number; y: number; zoom: number } {
  const zoom = Math.min(area.width / layout.width, area.height / layout.height, maxZoom);
  return {
    x: area.left + (area.width - layout.width * zoom) / 2,
    y: area.top,
    zoom,
  };
}

/**
 * Pairs of links that cross (straight-line approximation of the curves), leaving out
 * the crossings no order can avoid.
 */
export function countCrossings(
  layout: Layout,
  edges: { source: string; target: string }[],
  onCrossing?: (
    a: { source: string; target: string },
    b: { source: string; target: string },
  ) => void,
): number {
  const segments = edges
    .map((e) => {
      const a = layout.nodes[e.source];
      const b = layout.nodes[e.target];
      if (!a || !b) return null;
      return {
        x1: a.x + a.width,
        y1: a.y + a.height / 2,
        x2: b.x,
        y2: b.y + b.height / 2,
        source: e.source,
        target: e.target,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const links = new Set(edges.map((e) => `${e.source}>${e.target}`));
  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i]!;
      const t = segments[j]!;
      if (s.source === t.source || s.target === t.target) continue;
      // Two sources both linked to two targets cross whatever the order: unavoidable.
      if (links.has(`${s.source}>${t.target}`) && links.has(`${t.source}>${s.target}`)) continue;
      // Compare the vertical order at the start and the end of the shared x range.
      const from = Math.max(s.x1, t.x1);
      const to = Math.min(s.x2, t.x2);
      if (to <= from) continue;
      const at = (seg: typeof s, x: number) =>
        seg.y1 + ((seg.y2 - seg.y1) * (x - seg.x1)) / (seg.x2 - seg.x1 || 1);
      const before = at(s, from) - at(t, from);
      const after = at(s, to) - at(t, to);
      if (before * after < 0) {
        crossings += 1;
        onCrossing?.(s, t);
      }
    }
  }
  return crossings;
}
