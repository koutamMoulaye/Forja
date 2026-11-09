"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  CaretDown,
  ChartBar,
  ChartLineUp,
  DownloadSimple,
  NumberSquareOne,
  PencilSimple,
  Table,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SERIES_COLORS,
  barShares,
  formatCell,
  formatTick,
  formatValue,
  seriesGeometry,
  seriesOf,
  toCsv,
  type Insight,
} from "@/lib/agent/chart";
import {
  DESTINATIONS,
  controlsSummary,
  type Destination,
  type MartIteration,
  type MartRequest,
} from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";

const TABLE_ROWS = 10;

function Kpi({ insight }: { insight: Insight }) {
  const value = insight.points?.[0]?.value ?? insight.total ?? null;
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl bg-sunk px-5 py-4"
      data-testid="answer-kpi"
      role="img"
      aria-label={insight.alt}
    >
      <span className="text-meta font-semibold text-tx3">{insight.metric_label}</span>
      <span className="text-[30px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
        {formatValue(value, insight.format, insight.unit)}
      </span>
    </div>
  );
}

function Line({ insight }: { insight: Insight }) {
  const titleId = useId();
  const width = 640;
  const height = 220;
  const series = seriesOf(insight);
  const geometries = seriesGeometry(series, width, height);
  const axis = geometries[0]!;
  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="answer-line-figure">
      {series.length > 1 ? (
        <ul
          className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0"
          data-testid="answer-legend"
        >
          {series.map((item, index) => (
            <li key={item.metric} className="flex items-center gap-1.5 text-[13px] text-tx2">
              <span
                className={cn(
                  "inline-block h-[3px] w-4 rounded-full",
                  SERIES_COLORS[index % SERIES_COLORS.length]!.fill,
                )}
                aria-hidden
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={titleId}
        data-testid="answer-line"
      >
        <title id={titleId}>{insight.alt}</title>
        {axis.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={56}
              x2={width - 12}
              y1={tick.y}
              y2={tick.y}
              className="stroke-edge"
              strokeWidth={tick.value === 0 ? 1.2 : 0.6}
              strokeDasharray={tick.value === 0 ? undefined : "3 4"}
            />
            <text
              x={48}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-tx3 font-sans text-[11px] tabular-nums"
            >
              {formatTick(tick.value, insight.format)}
            </text>
          </g>
        ))}
        {axis.labels.map((label) => (
          <text
            key={`${label.x}-${label.text}`}
            x={label.x}
            y={height - 8}
            textAnchor="middle"
            className="fill-tx3 font-sans text-[11px]"
          >
            {label.text}
          </text>
        ))}
        {geometries.map((geometry, index) => {
          const item = series[index]!;
          const color = SERIES_COLORS[index % SERIES_COLORS.length]!.stroke;
          return (
            <g key={item.metric} data-testid="answer-series">
              <path
                d={geometry.path}
                fill="none"
                className={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {geometry.dots.map((dot) =>
                Number.isNaN(dot.y) ? null : (
                  <circle
                    key={`${dot.x}-${dot.label}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={3.5}
                    className={cn("fill-node", color)}
                    strokeWidth={2}
                  >
                    <title>{`${item.label}, ${dot.label} : ${formatValue(dot.value, item.format, item.unit)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function Bars({ insight }: { insight: Insight }) {
  const points = insight.points ?? [];
  // « Autres » groups the members beyond the first ten: its bar is drawn on the scale of
  // the members, not of their sum.
  const grouped = (insight.others ?? 0) > 0;
  const shares = barShares(grouped ? points.slice(0, -1) : points);
  if (grouped) shares.push(100);
  return (
    <figure className="m-0 flex flex-col gap-1.5" data-testid="answer-bars">
      <figcaption className="sr-only">{insight.alt}</figcaption>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {points.map((point, index) => (
          <li
            key={`${point.label}-${index}`}
            className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)_auto] items-center gap-3 text-[13.5px]"
          >
            <span className="truncate text-tx2" title={point.label}>
              {grouped && index === points.length - 1
                ? `${point.label} (${plural(insight.others ?? 0, "autre", "autres")})`
                : point.label}
            </span>
            <span className="h-[14px] overflow-hidden rounded-full bg-sunk" aria-hidden>
              <span
                className={cn(
                  "block h-full rounded-full",
                  grouped && index === points.length - 1
                    ? "bg-tx3/40"
                    : index === 0
                      ? "bg-acc"
                      : "bg-acc/55",
                )}
                style={{ width: `${Math.min(100, shares[index] ?? 0)}%` }}
              />
            </span>
            <span className="text-right whitespace-nowrap text-tx tabular-nums">
              {formatValue(point.value, insight.format, insight.unit)}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const VISUAL_ICONS = {
  kpi: NumberSquareOne,
  line: ChartLineUp,
  bars: ChartBar,
  table: Table,
} as const;

function RowsTable({
  iteration,
  limit,
  caption,
}: {
  iteration: MartIteration;
  limit: number;
  caption: string;
}) {
  const preview = iteration.preview;
  const columns = preview?.columns ?? [];
  const rows = (preview?.rows ?? []).slice(0, limit) as Record<string, unknown>[];
  return (
    <div className="overflow-x-auto rounded-xl bg-sunk">
      <table className="w-full border-collapse text-[13.5px]" data-testid="answer-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.name}
                scope="col"
                title={column.detail || undefined}
                className={cn(
                  "px-3 py-2 text-left font-semibold whitespace-nowrap text-tx2",
                  column.kind === "metric" && "text-right",
                )}
              >
                {column.label}
                {column.pii ? <span className="sr-only"> (pseudonymisé)</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-edge/40">
              {columns.map((column) => {
                const value = row[column.name];
                return (
                  <td
                    key={column.name}
                    className={cn(
                      "px-3 py-1.5 whitespace-nowrap",
                      column.kind === "metric" && "text-right tabular-nums",
                      column.pii && "font-mono text-[12.5px]",
                    )}
                  >
                    {formatCell(value, column)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every member of a ranking grouped under « Autres » in the chart. */
function Ranking({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const ranking = insight.ranking ?? [];
  if (!ranking.length) return null;
  return (
    <details
      className="group rounded-xl"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      data-testid="answer-ranking"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-meta font-medium text-acc-tx">
        <CaretDown size={14} className="transition-transform group-open:rotate-180" />
        {open
          ? "Masquer le classement complet"
          : `Voir le classement complet (${plural(ranking.length, "ligne", "lignes")})`}
      </summary>
      <div className="max-h-[360px] overflow-auto pt-2.5">
        <table className="w-full border-collapse rounded-xl bg-sunk text-[13.5px]">
          <caption className="sr-only">{insight.alt}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-tx2">
                Rang
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-tx2">
                {insight.axis_label}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-tx2">
                {insight.metric_label}
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((point, index) => (
              <tr key={`${point.label}-${index}`} className="border-t border-edge/40">
                <td className="px-3 py-1.5 text-tx3 tabular-nums">{index + 1}</td>
                <td className="px-3 py-1.5">{point.label}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {formatValue(point.value, insight.format, insight.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Why a preview cannot be published (an empty result, a failed control) and what to try. */
function Blocking({ iteration }: { iteration: MartIteration }) {
  const failed = (iteration.preview?.controls ?? []).filter((c) => c.status === "error");
  if (!failed.length) return null;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl bg-err-bg px-4 py-3 text-[13.5px] text-err-fg"
      role="status"
      data-testid="answer-blocking"
    >
      {failed.map((control, index) => {
        const suggestions = (control.details?.suggestions as string[] | undefined) ?? [];
        return (
          <div key={`${control.code}-${index}`} className="flex flex-col gap-1">
            <p className="m-0 font-medium">{control.message}</p>
            {suggestions.length ? (
              <ul className="m-0 list-disc pl-5 text-tx2">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The agent's answer once a data mart is ready (MT-18 of the manual tests): the
 * sentence computed from the result, a visual chosen by its shape, the first rows to
 * unfold, and the next actions. Nothing here is written by a language model.
 */
export function AnswerCard({
  request,
  iteration,
  previewHref,
  validating,
  onValidate,
  onRefine,
}: {
  request: MartRequest;
  iteration: MartIteration;
  previewHref: string;
  validating: boolean;
  onValidate: (destination: Destination) => void;
  onRefine: () => void;
}) {
  const [open, setOpen] = useState(false);
  const preview = iteration.preview;
  const insight = preview?.insight ?? null;
  const failing = preview?.controls?.some((c) => c.status === "error") ?? false;
  const rows = preview?.row_count ?? 0;
  const Icon = VISUAL_ICONS[insight?.visual ?? "table"];
  const caption = `Les ${Math.min(rows, TABLE_ROWS)} premières lignes du data mart`;
  const pseudonymized = preview?.pseudonymized?.length ?? 0;

  return (
    <div className="flex gap-3" data-testid="answer-card">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl bg-node px-5 py-[18px] shadow-float">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-xl bg-acc-soft text-acc-tx">
            <Icon size={18} weight="duotone" />
          </span>
          <p
            className="m-0 min-w-0 flex-1 text-[16px] leading-normal"
            data-testid="answer-sentence"
          >
            {insight?.sentence ?? iteration.summary}
          </p>
        </div>

        <Blocking iteration={iteration} />

        {insight?.visual === "kpi" ? <Kpi insight={insight} /> : null}
        {insight?.visual === "line" ? <Line insight={insight} /> : null}
        {insight?.visual === "bars" ? <Bars insight={insight} /> : null}
        {insight?.visual === "bars" ? <Ranking insight={insight} /> : null}
        {insight?.visual === "table" || !insight ? (
          <RowsTable iteration={iteration} limit={TABLE_ROWS} caption={caption} />
        ) : (
          <details
            className="group rounded-xl"
            open={open}
            onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
            data-testid="answer-rows"
          >
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-meta font-medium text-acc-tx">
              <CaretDown size={14} className="transition-transform group-open:rotate-180" />
              {open
                ? "Masquer les données"
                : `Voir les ${Math.min(rows, TABLE_ROWS)} premières lignes`}
            </summary>
            <div className="pt-2.5">
              <RowsTable iteration={iteration} limit={TABLE_ROWS} caption={caption} />
            </div>
          </details>
        )}

        <div className="text-[13px] text-tx3">
          {plural(rows, "ligne", "lignes")}
          {preview?.controls?.length ? ` · ${controlsSummary(preview.controls)}` : ""}
          {pseudonymized
            ? ` · ${plural(pseudonymized, "colonne pseudonymisée", "colonnes pseudonymisées")}`
            : ""}{" "}
          · rien n’est publié pour l’instant
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="tonal" size="md">
            <Link href={previewHref} data-testid="answer-open-preview">
              <ArrowSquareOut size={16} />
              Ouvrir l’aperçu complet
            </Link>
          </Button>
          {request.status === "previewed" ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="primary"
                  size="md"
                  disabled={failing}
                  loading={validating}
                  data-testid="answer-validate"
                >
                  Valider et publier
                  <CaretDown size={14} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex w-64 flex-col gap-1 p-1.5">
                {DESTINATIONS.map((destination) => (
                  <button
                    key={destination.id}
                    type="button"
                    className="flex flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-sunk focus-visible:bg-sunk"
                    onClick={() => onValidate(destination.id)}
                  >
                    <span className="text-[14px] font-semibold">{destination.label}</span>
                    <span className="text-[12.5px] text-tx3">{destination.description}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
          <Button
            variant="quiet"
            size="md"
            onClick={() =>
              download(
                `${iteration.spec?.name ?? "data_mart"}.csv`,
                toCsv(preview?.columns ?? [], (preview?.rows ?? []) as Record<string, unknown>[]),
              )
            }
            data-testid="answer-export"
          >
            <DownloadSimple size={16} />
            Exporter
          </Button>
          <Button variant="quiet" size="md" onClick={onRefine} data-testid="answer-refine">
            <PencilSimple size={16} />
            Affiner
          </Button>
        </div>
      </div>
    </div>
  );
}
