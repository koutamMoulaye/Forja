"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { CaretLineLeft, CaretLineRight } from "@phosphor-icons/react";
import { StatusBadge, type StatusKind } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import type { Lane } from "@/lib/pipeline/model";
import type { ZoomLevel } from "./canvas-node";

export type LaneNodeData = {
  lane: Lane;
  title: string;
  subtitle: string;
  open: boolean;
  count: number;
  unit: string;
  summary: string;
  chips: { kind: StatusKind; count: number; label: string }[];
  level: ZoomLevel;
  /** Empty project: the later compartments wait, slightly faded. */
  waiting: boolean;
  onToggle: (lane: Lane) => void;
};

export type LaneNodeType = Node<LaneNodeData, "lane">;

/** A compartment: tinted zone without border, title, state chips, foldable. */
function LaneNodeView({ data }: NodeProps<LaneNodeType>) {
  const { lane, title, subtitle, open, count, unit, summary, chips, level, waiting, onToggle } =
    data;
  return (
    <section
      aria-label={`Compartiment ${title}`}
      data-testid={`lane-${lane}`}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-3xl bg-lane transition-opacity duration-300",
        waiting && "opacity-70",
      )}
    >
      {open ? (
        <>
          <div className="flex items-center gap-2.5 pt-[22px] pr-3.5 pl-[22px]">
            <h2 className="m-0 text-[19px] font-semibold tracking-[-0.015em] whitespace-nowrap">
              {title}
            </h2>
            {chips.map((chip) => (
              <span key={chip.kind} title={chip.label} className="flex">
                <StatusBadge kind={chip.kind} label={String(chip.count)} size={14.5} />
                <span className="sr-only">{chip.label}</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onToggle(lane)}
              aria-label={`Replier ${title}`}
              title="Replier"
              className="nodrag nopan ml-auto flex size-[34px] items-center justify-center rounded-md border-0 bg-transparent text-tx3 transition-colors hover:bg-sunk hover:text-tx"
            >
              <CaretLineLeft size={19} />
            </button>
          </div>
          <div className="px-[22px] pt-0.5 text-[15px] whitespace-nowrap text-tx3">{subtitle}</div>
          <div
            aria-hidden={level !== "far"}
            className={cn(
              "pointer-events-none absolute top-[150px] right-7 left-7 flex flex-col gap-4 transition-opacity duration-250",
              level === "far" ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex items-baseline gap-3">
              <span className="text-[84px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {count}
              </span>
              <span className="text-[28px] text-tx2">{unit}</span>
            </div>
            <div className="text-[26px] leading-[1.4] text-tx2">{summary}</div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(lane)}
          aria-label={`Déplier ${title}`}
          title="Déplier"
          className="nodrag nopan flex h-full w-full flex-col items-center gap-3.5 border-0 bg-transparent py-[22px] font-sans text-tx2 transition-colors hover:text-tx"
        >
          <CaretLineRight size={19} />
          <span className="text-[17px] font-semibold [writing-mode:vertical-rl]">{title}</span>
          <span className="text-[15px] text-tx3 tabular-nums">{count}</span>
        </button>
      )}
    </section>
  );
}

export const LaneNode = memo(LaneNodeView);
