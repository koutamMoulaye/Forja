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
  barShares,
  formatTick,
  formatValue,
  lineGeometry,
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
  const points = insight.points ?? [];
  const geometry = lineGeometry(points, width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-labelledby={titleId}
      data-testid="answer-line"
    >
      <title id={titleId}>{insight.alt}</title>
      {geometry.ticks.map((tick) => (
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
      {geometry.labels.map((label) => (
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
      <path
        d={geometry.path}
        fill="none"
        className="stroke-acc"
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
            className="fill-node stroke-acc"
            strokeWidth={2}
          >
            <title>{`${dot.label} : ${formatValue(dot.value, insight.format, insight.unit)}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}

function Bars({ insight }: { insight: Insight }) {
  const points = insight.points ?? [];
  const shares = barShares(points);
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
              {point.label}
            </span>
            <span className="h-[14px] overflow-hidden rounded-full bg-sunk" aria-hidden>
              <span
                className={cn("block h-full rounded-full", index === 0 ? "bg-acc" : "bg-acc/55")}
                style={{ width: `${shares[index]}%` }}
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
                    {column.kind === "metric" && typeof value === "number"
                      ? formatValue(value, column.format, column.unit)
                      : value === null || value === undefined
                        ? "—"
                        : String(value)}
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

        {insight?.visual === "kpi" ? <Kpi insight={insight} /> : null}
        {insight?.visual === "line" ? <Line insight={insight} /> : null}
        {insight?.visual === "bars" ? <Bars insight={insight} /> : null}
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
