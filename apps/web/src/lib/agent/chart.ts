/**
 * Geometry and French formatting of the answer charts (KPI, line, horizontal bars).
 *
 * The charts are plain SVG and HTML drawn from these helpers: no chart library, no
 * script or style injected at run time, so they live under the strict CSP and take
 * their colours from the ForjaApp tokens (light and dark). See docs/decisions.md.
 */
import type { components } from "@/lib/api/schema";

export type Insight = components["schemas"]["Insight"];
export type InsightPoint = components["schemas"]["InsightPoint"];

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

/** « 3 845 164 entrées », « 12 345,6 € », « 4,5 » — the unit of the metric, never € by default. */
export function formatValue(
  value: number | null | undefined,
  format: string | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (format === "currency" || unit === "EUR") return euros.format(value);
  if (format === "percent") return percent.format(value);
  const text =
    format === "integer" || Number.isInteger(value) ? integer.format(value) : decimal.format(value);
  return unit && unit !== "lignes" ? `${text} ${unit}` : text;
}

/** Axis ticks: « 1,2 M », « 350 k ». */
export function formatTick(value: number, format?: string | null): string {
  if (format === "currency") return `${compact.format(value)} €`;
  if (format === "percent") return percent.format(value);
  return Math.abs(value) >= 10_000 ? compact.format(value) : decimal.format(value);
}

/** Round bounds and 3 to 5 ticks covering [min, max], zero included. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const low = Math.min(0, min);
  const high = Math.max(0, max);
  if (high === low) return [low, low + 1];
  const raw = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const first = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let tick = first; tick <= high + step * 0.5; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
    if (ticks.length > 8) break;
  }
  return ticks;
}

export type LineGeometry = {
  path: string;
  dots: { x: number; y: number; label: string; value: number | null }[];
  ticks: { y: number; value: number }[];
  labels: { x: number; text: string }[];
};

/** Points of a line chart in a ``width`` × ``height`` box with left and bottom margins. */
export function lineGeometry(
  points: InsightPoint[],
  width: number,
  height: number,
  margin = { left: 56, right: 12, top: 12, bottom: 28 },
): LineGeometry {
  const known = points.map((p) => p.value).filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.min(...known, 0), Math.max(...known, 0));
  const low = ticks[0]!;
  const high = ticks[ticks.length - 1]!;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = (index: number) =>
    margin.left + (points.length > 1 ? (index * innerWidth) / (points.length - 1) : innerWidth / 2);
  const y = (value: number) =>
    margin.top + innerHeight - ((value - low) / (high - low)) * innerHeight;
  const dots = points.map((p, index) => ({
    x: x(index),
    y: p.value === null ? NaN : y(p.value),
    label: p.label,
    value: p.value,
  }));
  let path = "";
  let drawing = false;
  for (const dot of dots) {
    if (Number.isNaN(dot.y)) {
      drawing = false;
      continue;
    }
    path += `${drawing ? "L" : "M"}${dot.x.toFixed(1)} ${dot.y.toFixed(1)} `;
    drawing = true;
  }
  // Labels under the axis: all of them when few, else about six, first and last kept.
  const every = Math.max(1, Math.ceil(points.length / 6));
  const labels = dots
    .filter((_, index) => index % every === 0 || index === dots.length - 1)
    .map((d) => ({ x: d.x, text: d.label }));
  return {
    path: path.trim(),
    dots,
    ticks: ticks.map((value) => ({ y: y(value), value })),
    labels,
  };
}

/** Share of the largest bar, in percent of the track (bars start at zero). */
export function barShares(points: InsightPoint[]): number[] {
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  return points.map((p) => (max > 0 && p.value !== null ? Math.max(0, (p.value / max) * 100) : 0));
}

/** CSV of rows as shown (personal values already pseudonymized), « ; » separated. */
export function toCsv(columns: { name: string; label: string }[], rows: Record<string, unknown>[]) {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.name])).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
