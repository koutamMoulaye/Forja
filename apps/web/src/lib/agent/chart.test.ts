import { describe, expect, it } from "vitest";
import { barShares, formatValue, lineGeometry, niceTicks, toCsv } from "./chart";
import { refineSuggestions } from "./view";

const NNBSP = /[   ]/;

describe("answer charts (MT-18)", () => {
  it("formats a count with its business unit, never in euros (MT-6)", () => {
    expect(formatValue(3845164, "integer", "entrées")).toMatch(
      new RegExp(`^3${NNBSP.source}845${NNBSP.source}164 entrées$`),
    );
    expect(formatValue(12.5, "currency", "EUR")).toMatch(/^12,5\s?0?\s€$/);
    expect(formatValue(4.25, "decimal", null)).toBe("4,25");
    expect(formatValue(null, "integer", "entrées")).toBe("—");
    expect(formatValue(12, "integer", "lignes")).toBe("12");
  });

  it("puts round ticks around the values, zero included", () => {
    expect(niceTicks(0, 950)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(120, 480)[0]).toBe(0);
    expect(niceTicks(5, 5)).toEqual([0, 2, 4, 6]);
  });

  it("draws a line through the known points, a gap for a missing one", () => {
    const geometry = lineGeometry(
      [
        { label: "2021", value: 10 },
        { label: "2022", value: null },
        { label: "2023", value: 30 },
      ],
      600,
      200,
    );
    expect(geometry.path.match(/M/g)).toHaveLength(2);
    expect(geometry.dots[0]!.x).toBeLessThan(geometry.dots[2]!.x);
    expect(geometry.dots[2]!.y).toBeLessThan(geometry.dots[0]!.y);
    expect(geometry.labels.map((l) => l.text)).toEqual(["2021", "2022", "2023"]);
  });

  it("sizes bars on the largest one", () => {
    expect(
      barShares([
        { label: "a", value: 50 },
        { label: "b", value: 25 },
        { label: "c", value: null },
      ]),
    ).toEqual([100, 50, 0]);
  });

  it("exports the rows shown as a CSV readable by a spreadsheet", () => {
    const csv = toCsv(
      [
        { name: "region", label: "Région" },
        { name: "total", label: "Fréquentation" },
      ],
      [{ region: "Pays; de Loire", total: 12 }],
    );
    expect(csv.startsWith("﻿Région;Fréquentation\r\n")).toBe(true);
    expect(csv).toContain('"Pays; de Loire";12');
  });
});

describe("refine suggestions from the project's semantic layer (MT-17)", () => {
  const layer = {
    metrics: [
      { name: "total", label: "Fréquentation", default: true, fact: "fct_frequentation" },
      { name: "payant", label: "Entrées payantes", fact: "fct_frequentation" },
    ],
    dimensions: [
      { name: "annee", label: "Année de fréquentation", kind: "time", time_level: "annee" },
      {
        name: "musee",
        label: "Musée",
        kind: "standard",
        display_attribute: "nom_du_musee",
        attributes: [{ name: "region", label: "Région" }],
      },
    ],
  };

  it("offers years, not months, for a yearly date, and names axes by their label", () => {
    const spec = {
      metrics: ["total"],
      axes: ["musee.region"],
      time_dimension: "annee",
      period: { label: "2023", start: "2023-01-01", end: "2023-12-31" },
    } as Parameters<typeof refineSuggestions>[0];
    expect(refineSuggestions(spec, layer)).toEqual([
      "Ajoute entrées payantes",
      "Seulement 2022",
      "Par année",
    ]);
  });
});
