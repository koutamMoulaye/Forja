import { describe, expect, it } from "vitest";
import {
  filterCounts,
  laneSubtitle,
  lineage,
  matchesFilter,
  nodeInfo,
  nodeLook,
  sourceSlug,
  type GraphNode,
} from "./model";

const node = (patch: Partial<GraphNode>): GraphNode => ({
  id: "stg_clients",
  type: "silver",
  lane: "cleaning",
  name: "clients",
  label: "Nettoyage de clients",
  ref: "s1",
  counts: { rows: 4809, columns: 9, rules: 3, tables: null },
  state: "applied",
  message: null,
  quality_score: null,
  pii_count: 0,
  pii_columns: [],
  review_count: 0,
  highlights: [],
  run: null,
  ...patch,
});

describe("node states", () => {
  it("map to the mockup's badges", () => {
    expect(nodeLook(node({ state: "review" }))).toMatchObject({
      kind: "prop",
      label: "À revoir",
      tone: "prop",
    });
    expect(nodeLook(node({ type: "mart", state: "review" })).label).toBe("À valider");
    expect(nodeLook(node({ state: "error" }))).toMatchObject({
      kind: "err",
      tone: "err",
      loud: true,
    });
    expect(nodeLook(node({ state: "pending" }))).toMatchObject({
      kind: "queue",
      label: "En attente",
    });
    expect(nodeLook(node({ state: "proposed" })).label).toBe("Proposé");
    expect(nodeLook(node({ state: "applied" }))).toMatchObject({ kind: "app", loud: false });
    const running = node({
      state: "running",
      run: { run_id: "r", type: "build_silver", status: "running", percent: 62, finished_at: null },
    });
    expect(nodeLook(running)).toMatchObject({ kind: "run", label: "62 %", tone: "run" });
  });

  it("say « Réussi » for a few seconds after the run", () => {
    const finished = "2026-10-26T10:00:00Z";
    const done = node({
      run: {
        run_id: "r",
        type: "build_silver",
        status: "succeeded",
        percent: null,
        finished_at: finished,
      },
    });
    expect(nodeLook(done, Date.parse(finished) + 2000)).toMatchObject({
      kind: "val",
      label: "Réussi",
    });
    expect(nodeLook(done, Date.parse(finished) + 60_000).kind).toBe("app");
  });

  it("describe their content", () => {
    expect(nodeInfo(node({}))).toBe("4 809 lignes");
    expect(nodeInfo(node({ state: "review" }))).toBe("3 règles");
    expect(nodeInfo(node({ state: "error", message: "prix_ht absent" }))).toBe("prix_ht absent");
    expect(
      nodeInfo(
        node({
          type: "date_dimension",
          counts: { rows: 1096, columns: 9, rules: null, tables: null },
        }),
      ),
    ).toBe("1 096 jours");
    expect(
      nodeInfo(
        node({
          type: "destination",
          counts: { rows: null, columns: null, rules: null, tables: 1 },
        }),
      ),
    ).toBe("1 table");
    expect(nodeInfo(node({ state: "running" }))).toBe("");
  });
});

describe("filters", () => {
  const nodes = [
    node({ id: "a", state: "review" }),
    node({ id: "b", state: "error" }),
    node({
      id: "c",
      state: "running",
      run: { run_id: "r", type: "build_all", status: "running", percent: 10, finished_at: null },
    }),
    node({ id: "d", state: "applied", review_count: 1 }),
    node({ id: "e" }),
  ];

  it("keep the nodes they are about", () => {
    expect(nodes.filter((n) => matchesFilter(n, "review")).map((n) => n.id)).toEqual(["a", "d"]);
    expect(nodes.filter((n) => matchesFilter(n, "error")).map((n) => n.id)).toEqual(["b"]);
    expect(nodes.filter((n) => matchesFilter(n, "running")).map((n) => n.id)).toEqual(["c"]);
    expect(nodes.every((n) => matchesFilter(n, "all"))).toBe(true);
    expect(filterCounts(nodes)).toEqual({ all: 5, review: 2, running: 1, error: 1 });
  });
});

describe("helpers", () => {
  it("follow a lineage both ways", () => {
    const edges = [
      {
        id: "1",
        source: "src",
        target: "stg",
        type: "lineage" as const,
        state: "applied" as const,
        confidence: null,
      },
      {
        id: "2",
        source: "stg",
        target: "dim",
        type: "lineage" as const,
        state: "applied" as const,
        confidence: null,
      },
      {
        id: "3",
        source: "dim",
        target: "fct",
        type: "relation" as const,
        state: "applied" as const,
        confidence: 0.9,
      },
      {
        id: "4",
        source: "other",
        target: "fct",
        type: "lineage" as const,
        state: "applied" as const,
        confidence: null,
      },
    ];
    expect([...lineage("stg", edges)].sort()).toEqual(["dim", "fct", "src", "stg"]);
  });

  it("name compartments and sources like the API", () => {
    expect(laneSubtitle("cleaning", [node({}), node({})])).toBe("Silver, 2 tables");
    expect(laneSubtitle("sources", [])).toBe("Vos fichiers");
    expect(sourceSlug("Lignes Commande (2024).CSV")).toBe("lignes_commande_2024");
    expect(sourceSlug("clients.csv")).toBe("clients");
  });
});
