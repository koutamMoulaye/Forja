import type { components } from "@/lib/api/schema";
import type { StatusKind } from "@/components/ui/status-badge";

export type ProjectGraph = components["schemas"]["ProjectGraph"];
export type GraphNode = components["schemas"]["GraphNode"];
export type GraphEdge = components["schemas"]["GraphEdge"];
export type NodeState = GraphNode["state"];
export type NodeType = GraphNode["type"];
export type Lane = GraphNode["lane"];
export type NodeRun = NonNullable<GraphNode["run"]>;

export const LANES: readonly Lane[] = ["sources", "cleaning", "star_schema", "serving"];

export const LANE_TITLES: Record<Lane, string> = {
  sources: "Sources",
  cleaning: "Nettoyage",
  star_schema: "Modèle en étoile",
  serving: "Diffusion",
};

/** Canvas filters of the toolbar; nodes outside fade out. */
export type Filter = "all" | "review" | "running" | "error";

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "review", label: "À revoir" },
  { id: "running", label: "En cours" },
  { id: "error", label: "Erreurs" },
];

/** A succeeded node keeps « Réussi » this long after its run ended. */
export const SUCCESS_VISIBLE_MS = 8000;

/** What the node shows: the badge of a loud state, or the calm check and its info. */
export type NodeLook = {
  kind: StatusKind;
  label: string;
  loud: boolean;
  /** Colour of the left edge and of the icon tile, for loud states. */
  tone: "prop" | "err" | "run" | "queue" | null;
};

export function succeededRecently(run: NodeRun | null | undefined, now: number): boolean {
  if (!run || run.status !== "succeeded") return false;
  if (!run.finished_at) return true; // the run goes on with later tables
  return now - Date.parse(run.finished_at) < SUCCESS_VISIBLE_MS;
}

export function nodeLook(node: GraphNode, now: number = Date.now()): NodeLook {
  switch (node.state) {
    case "error":
      return { kind: "err", label: "Erreur", loud: true, tone: "err" };
    case "review":
      return {
        kind: "prop",
        label: node.type === "mart" ? "À valider" : "À revoir",
        loud: true,
        tone: "prop",
      };
    case "proposed":
      return { kind: "prop", label: "Proposé", loud: true, tone: "prop" };
    case "running":
      return {
        kind: "run",
        label: node.run?.percent != null ? `${node.run.percent} %` : "En cours",
        loud: true,
        tone: "run",
      };
    case "pending":
      return { kind: "queue", label: "En attente", loud: true, tone: "queue" };
    case "rejected":
      return { kind: "rej", label: "Rejeté", loud: true, tone: null };
    default:
      if (succeededRecently(node.run, now)) {
        return { kind: "val", label: "Réussi", loud: true, tone: null };
      }
      return { kind: "app", label: "Appliqué", loud: false, tone: null };
  }
}

const integer = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return integer.format(value);
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count > 1 ? many : one}`;
}

/** The line under the name: rows, rules, the reason of an error... */
export function nodeInfo(node: GraphNode): string {
  const { rows, rules, tables } = node.counts;
  if (node.state === "running" || node.state === "pending") return "";
  if (node.state === "error" && node.message) return node.message;
  if (node.type === "silver" && node.state === "review" && rules != null) {
    return plural(rules, "règle", "règles");
  }
  if (node.type === "destination" && tables != null) {
    return plural(tables, "table", "tables");
  }
  if (node.type === "date_dimension" && rows != null) return plural(rows, "jour", "jours");
  if (rows != null) return plural(rows, "ligne", "lignes");
  if (node.message) return node.message;
  return "";
}

/**
 * A node to review or in error shows its badge, then its info on a line of its own: « À
 * revoir » and « 3 règles » never share a line where one would be cut. Only these lasting
 * states stack, so a run never moves the nodes.
 */
export function stacksInfo(node: Pick<GraphNode, "state" | "type" | "counts" | "message">) {
  return (node.state === "review" || node.state === "error") && nodeInfo(node as GraphNode) !== "";
}

export const TYPE_LABELS: Record<NodeType, string> = {
  source: "Source",
  silver: "Table nettoyée",
  dimension: "Dimension",
  fact: "Table de faits",
  date_dimension: "Dimension date",
  mart: "Data mart",
  destination: "Destination",
};

export function matchesFilter(node: GraphNode, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "review":
      return node.state === "review" || node.state === "proposed" || node.review_count > 0;
    case "running":
      return node.state === "running" || (node.state === "pending" && node.run != null);
    case "error":
      return node.state === "error";
  }
}

export function filterCounts(nodes: GraphNode[]): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: nodes.length, review: 0, running: 0, error: 0 };
  for (const node of nodes) {
    for (const filter of ["review", "running", "error"] as const) {
      if (matchesFilter(node, filter)) counts[filter] += 1;
    }
  }
  return counts;
}

/** The node and everything upstream and downstream of it. */
export function lineage(id: string, edges: GraphEdge[]): Set<string> {
  const set = new Set([id]);
  const walk = (current: string, down: boolean) => {
    for (const edge of edges) {
      const from = down ? edge.source : edge.target;
      const to = down ? edge.target : edge.source;
      if (from === current && !set.has(to)) {
        set.add(to);
        walk(to, down);
      }
    }
  };
  walk(id, true);
  walk(id, false);
  return set;
}

/** Sub-title of a compartment: « Silver, 4 tables », « Gold, 3 dimensions et 1 fait ». */
export function laneSubtitle(lane: Lane, nodes: GraphNode[]): string {
  const of = (type: NodeType) => nodes.filter((n) => n.type === type).length;
  switch (lane) {
    case "sources":
      return nodes.length ? plural(nodes.length, "fichier", "fichiers") : "Vos fichiers";
    case "cleaning":
      return nodes.length
        ? `Silver, ${plural(nodes.length, "table", "tables")}`
        : "Après le profilage";
    case "star_schema": {
      if (!nodes.length) return "Après le nettoyage";
      const dims = of("dimension") + of("date_dimension");
      const facts = of("fact");
      return `Gold, ${plural(dims, "dimension", "dimensions")} et ${plural(facts, "fait", "faits")}`;
    }
    case "serving": {
      if (!nodes.length) return "Vos data marts";
      const marts = of("mart");
      const outs = of("destination");
      return `${plural(marts, "data mart", "data marts")}, ${plural(outs, "sortie", "sorties")}`;
    }
  }
}

export const LANE_UNITS: Record<Lane, [string, string]> = {
  sources: ["fichier", "fichiers"],
  cleaning: ["table", "tables"],
  star_schema: ["table", "tables"],
  serving: ["data mart", "data marts"],
};

/** The summary of a compartment at far zoom: « 1 plan à revoir, 1 erreur ». */
export function laneSummary(nodes: GraphNode[]): string {
  const review = nodes.filter((n) => n.state === "review" || n.state === "proposed").length;
  const errors = nodes.filter((n) => n.state === "error").length;
  const running = nodes.filter((n) => n.state === "running").length;
  const parts = [
    running ? plural(running, "table en cours", "tables en cours") : "",
    review ? plural(review, "élément à revoir", "éléments à revoir") : "",
    errors ? plural(errors, "erreur", "erreurs") : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Tout est à jour";
}

/** Same rule as the API's slugify: the logical name a file gets as a source. */
export function sourceSlug(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const slug = stem
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63)
    .replace(/_+$/, "");
  return slug || "data";
}
