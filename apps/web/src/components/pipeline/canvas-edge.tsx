"use client";

import { memo } from "react";
import { EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import { LinkSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import type { GraphEdge } from "@/lib/pipeline/model";

export type CanvasEdgeData = {
  edge: GraphEdge;
  /** On the selected node's lineage: thicker, copper. */
  onLineage: boolean;
  dimmed: boolean;
  /** Show the confidence pill (hidden at far zoom). */
  labelled: boolean;
};

export type CanvasEdgeType = Edge<CanvasEdgeData, "pipeline">;

/** The mockup's curve: horizontal tangents, half the distance as control length. */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(24, (x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

function CanvasEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<CanvasEdgeType>) {
  if (!data) return null;
  const { edge, onLineage, dimmed, labelled } = data;
  const d = edgePath(sourceX, sourceY, targetX, targetY);
  const proposed = edge.state === "proposed";
  const error = edge.state === "error";
  const stroke = onLineage
    ? "var(--acc)"
    : proposed
      ? "var(--prop-fg)"
      : error
        ? "var(--err-solid)"
        : "var(--edge)";
  const confidence = edge.type === "relation" && edge.confidence != null ? edge.confidence : null;
  return (
    <>
      <path
        id={id}
        d={d}
        fill="none"
        className="canvas-edge"
        style={{
          stroke,
          strokeWidth: onLineage ? 2.5 : 1.6,
          strokeDasharray: proposed ? "6 6" : error ? "2 5" : undefined,
          strokeLinecap: "round",
          opacity: dimmed ? 0.12 : 1,
        }}
      />
      {edge.state === "running" && !dimmed ? (
        <path
          d={d}
          fill="none"
          data-testid="edge-flow"
          className="canvas-edge-flow"
          style={{
            stroke: "var(--run-fg)",
            strokeWidth: 2.5,
            strokeLinecap: "round",
            strokeDasharray: "2 10",
          }}
        />
      ) : null}
      {confidence != null && labelled ? (
        <EdgeLabelRenderer>
          <span
            className={cn(
              "nodrag nopan pointer-events-none absolute box-border flex h-[26px] items-center gap-[5px] rounded-full pr-2.5 pl-2 text-[14.5px] font-semibold whitespace-nowrap tabular-nums transition-opacity duration-250",
              proposed
                ? "border border-dashed border-prop-bd bg-prop-bg text-prop-fg"
                : "bg-node text-tx2 shadow-sm",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
              opacity: dimmed ? 0.2 : 1,
            }}
            title="Confiance de la relation"
          >
            <LinkSimple size={15} />
            {Math.round(confidence * 100)} %
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const CanvasEdge = memo(CanvasEdgeView);
