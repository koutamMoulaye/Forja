import type { GraphEdge, GraphNode, NodeState, ProjectGraph } from "./model";

const STATES: NodeState[] = [
  "applied",
  "applied",
  "applied",
  "applied",
  "review",
  "running",
  "error",
];

/**
 * A pipeline of about `size` nodes for performance checks: sources and their cleaned
 * tables, dimensions, facts reading several of them, data marts and two destinations.
 * Deterministic, so measurements compare.
 */
export function syntheticGraph(size = 200): ProjectGraph {
  const sources = Math.max(1, Math.round(size * 0.3));
  const dims = Math.max(1, Math.round(size * 0.12));
  const facts = Math.max(1, Math.round(size * 0.05));
  const marts = Math.max(1, size - 2 * sources - dims - facts - 2);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const node = (
    id: string,
    type: GraphNode["type"],
    lane: GraphNode["lane"],
    name: string,
    index: number,
  ): GraphNode => {
    const state = STATES[index % STATES.length]!;
    return {
      id,
      type,
      lane,
      name,
      label: name,
      ref: null,
      counts: { rows: 1000 + index * 37, columns: 8, rules: 4, tables: null },
      state,
      message: state === "error" ? "Colonne introuvable" : null,
      quality_score: type === "source" ? 70 + (index % 30) : null,
      pii_count: index % 5 === 0 ? 2 : 0,
      pii_columns: [],
      review_count: state === "review" ? 2 : 0,
      highlights: ["id", "date", "montant"],
      run:
        state === "running"
          ? {
              run_id: "synthetic",
              type: "build_all",
              status: "running",
              percent: 40,
              finished_at: null,
            }
          : null,
    };
  };
  const link = (source: string, target: string, type: GraphEdge["type"] = "lineage") =>
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type,
      state: "applied",
      confidence: type === "relation" ? 0.9 : null,
    });

  for (let i = 0; i < sources; i++) {
    nodes.push(node(`src_t${i}`, "source", "sources", `table_${i}.csv`, i));
    nodes.push(node(`stg_t${i}`, "silver", "cleaning", `table_${i}`, i + 1));
    link(`src_t${i}`, `stg_t${i}`);
  }
  for (let i = 0; i < dims; i++) {
    nodes.push(node(`dim_${i}`, "dimension", "star_schema", `dim_${i}`, i + 2));
    link(`stg_t${Math.floor(random() * sources)}`, `dim_${i}`);
  }
  for (let i = 0; i < facts; i++) {
    nodes.push(node(`fct_${i}`, "fact", "star_schema", `fct_${i}`, i + 3));
    for (let k = 0; k < 3; k++) link(`stg_t${Math.floor(random() * sources)}`, `fct_${i}`);
    for (let k = 0; k < 3; k++) link(`dim_${Math.floor(random() * dims)}`, `fct_${i}`, "relation");
  }
  nodes.push(node("dest_serving", "destination", "serving", "Base de diffusion", 0));
  nodes.push(node("dest_exports", "destination", "serving", "Exports", 0));
  for (let i = 0; i < marts; i++) {
    nodes.push(node(`mart_${i}`, "mart", "serving", `Indicateur ${i} par mois`, i + 4));
    link(`fct_${Math.floor(random() * facts)}`, `mart_${i}`);
    link(`mart_${i}`, i % 2 ? "dest_exports" : "dest_serving", "publication");
  }
  const unique = [...new Map(edges.map((e) => [e.id, e])).values()];
  const lanes = (["sources", "cleaning", "star_schema", "serving"] as const).map((lane) => {
    const members = nodes.filter((n) => n.lane === lane);
    const states: Record<string, number> = {};
    for (const n of members) states[n.state] = (states[n.state] ?? 0) + 1;
    return { lane, total: members.length, states };
  });
  return { project_id: "synthetic", version: `synthetic-${size}`, nodes, edges: unique, lanes };
}
