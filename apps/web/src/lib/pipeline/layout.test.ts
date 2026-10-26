// @vitest-environment node
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import demo from "./fixtures/demo-graph.json";
import { GEOMETRY, countCrossings, fitViewport, placeLanes, rankGraph } from "./layout";
import type { ProjectGraph } from "./model";
import { syntheticGraph } from "./synthetic";

const graph = demo as ProjectGraph;
const input = {
  nodes: graph.nodes.map(({ id, type, lane, name }) => ({ id, type, lane, name })),
  edges: graph.edges.map(({ source, target }) => ({ source, target })),
};

describe("layout of the demo project", async () => {
  const ranked = await rankGraph(new ELK(), input);
  const layout = placeLanes(input, ranked);
  const lane = (id: string) =>
    layout.lanes.find((l) => l.lane === graph.nodes.find((n) => n.id === id)!.lane)!;

  it("keeps each node inside its compartment, in pipeline order", () => {
    for (const node of graph.nodes) {
      const placed = layout.nodes[node.id]!;
      const box = lane(node.id);
      expect(placed.x).toBeGreaterThanOrEqual(box.x + GEOMETRY.lanePadding);
      expect(placed.x + placed.width).toBeLessThanOrEqual(box.x + box.width - GEOMETRY.lanePadding);
      expect(placed.y).toBeGreaterThanOrEqual(GEOMETRY.top);
    }
    expect(layout.lanes.map((l) => l.lane)).toEqual([
      "sources",
      "cleaning",
      "star_schema",
      "serving",
    ]);
  });

  it("puts fct_ventes in the star schema, right of its dimensions", () => {
    const fact = layout.nodes["fct_ventes"]!;
    expect(lane("fct_ventes").lane).toBe("star_schema");
    for (const dim of ["dim_clients", "dim_produits", "dim_date"]) {
      expect(layout.nodes[dim]!.x + layout.nodes[dim]!.width).toBeLessThan(fact.x);
    }
  });

  it("has no avoidable crossing", () => {
    expect(countCrossings(layout, input.edges)).toBe(0);
  });

  it("aligns a source with its cleaned table", () => {
    for (const name of ["clients", "commandes", "produits", "lignes_commande"]) {
      expect(layout.nodes[`stg_${name}`]!.y).toBe(layout.nodes[`src_${name}`]!.y);
    }
  });

  it("leaves nothing out of frame after « Ajuster »", () => {
    const area = { left: 84, top: 72, width: 1440 - 84 - 28, height: 900 - 72 - 100 };
    const view = fitViewport(layout, area);
    for (const placed of Object.values(layout.nodes)) {
      const left = placed.x * view.zoom + view.x;
      const top = placed.y * view.zoom + view.y;
      expect(left).toBeGreaterThanOrEqual(area.left - 0.5);
      expect(left + placed.width * view.zoom).toBeLessThanOrEqual(area.left + area.width + 0.5);
      expect(top).toBeGreaterThanOrEqual(area.top - 0.5);
      expect(top + (placed.height + GEOMETRY.nearExtra) * view.zoom).toBeLessThanOrEqual(
        area.top + area.height + 0.5,
      );
    }
  });

  it("folds a compartment into a narrow column, its nodes as points", () => {
    const folded = placeLanes(input, ranked, { cleaning: true });
    const cleaning = folded.lanes.find((l) => l.lane === "cleaning")!;
    expect(cleaning.width).toBe(GEOMETRY.foldedWidth);
    expect(folded.nodes["stg_clients"]!.hidden).toBe(true);
    expect(folded.width).toBeLessThan(layout.width);
  });
});

describe("layout of a large pipeline", () => {
  it("places 200 nodes", async () => {
    const big = syntheticGraph(200);
    const bigInput = {
      nodes: big.nodes.map(({ id, type, lane, name }) => ({ id, type, lane, name })),
      edges: big.edges.map(({ source, target }) => ({ source, target })),
    };
    const ranked = await rankGraph(new ELK(), bigInput);
    const layout = placeLanes(bigInput, ranked);
    expect(Object.keys(layout.nodes)).toHaveLength(big.nodes.length);
    expect(big.nodes.length).toBeGreaterThanOrEqual(195);
  }, 30_000);
});
