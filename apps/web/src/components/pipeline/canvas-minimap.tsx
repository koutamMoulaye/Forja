"use client";

import { memo } from "react";
import { useStore } from "@xyflow/react";
import { cn } from "@/lib/cn";
import type { Layout } from "@/lib/pipeline/layout";
import type { GraphNode } from "@/lib/pipeline/model";

const WIDTH = 200;
const INNER = 184;

const COLORS: Partial<Record<GraphNode["state"], string>> = {
  review: "var(--prop-fg)",
  proposed: "var(--prop-fg)",
  running: "var(--run-fg)",
  pending: "var(--edge)",
  error: "var(--err-solid)",
};

/**
 * Compartments and nodes coloured by state, the visible area framed in copper. A click
 * centres the camera there. Hidden while the inspector is open.
 */
function Frame({
  m,
  area,
}: {
  m: number;
  area: { left: number; top: number; width: number; height: number };
}) {
  const [tx, ty, zoom] = useStore((s) => s.transform);
  // The framed area: what the free part of the screen shows, in world coordinates.
  const view = {
    left: 8 + ((area.left - 20 - tx) / zoom) * m,
    top: 8 + ((area.top - ty) / zoom) * m,
    width: ((area.width + 40) / zoom) * m,
    height: ((area.height + 20) / zoom) * m,
  };
  return (
    <span className="absolute box-border rounded-[4px] border-[1.5px] border-acc" style={view} />
  );
}

const Content = memo(function Content({
  layout,
  nodes,
  m,
}: {
  layout: Layout;
  nodes: GraphNode[];
  m: number;
}) {
  return (
    <>
      {layout.lanes.map((lane) => (
        <span
          key={lane.lane}
          className="absolute rounded-[4px] bg-(--lane-mm)"
          style={{ left: 8 + lane.x * m, top: 8, width: lane.width * m, height: layout.height * m }}
        />
      ))}
      {nodes.map((node) => {
        const placed = layout.nodes[node.id];
        if (!placed || placed.hidden) return null;
        const color = COLORS[node.state];
        return (
          <span
            key={node.id}
            className="absolute rounded-[2px]"
            style={{
              left: 8 + placed.x * m,
              top: 8 + placed.y * m,
              width: placed.width * m,
              height: Math.max(4, placed.height * m),
              background: color ?? "var(--tx3)",
              opacity: color ? 1 : 0.4,
            }}
          />
        );
      })}
    </>
  );
});

export function CanvasMinimap({
  layout,
  nodes,
  area,
  visible,
  onNavigate,
}: {
  layout: Layout;
  nodes: GraphNode[];
  area: { left: number; top: number; width: number; height: number };
  visible: boolean;
  onNavigate: (x: number, y: number) => void;
}) {
  // Width-bound, unless the pipeline is very tall.
  const m = Math.min(INNER / layout.width, 244 / layout.height);
  const height = layout.height * m + 16;
  return (
    <button
      type="button"
      aria-label="Minimap : cliquez pour centrer la vue"
      data-testid="canvas-minimap"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onNavigate((event.clientX - rect.left - 8) / m, (event.clientY - rect.top - 8) / m);
      }}
      style={{ width: WIDTH, height }}
      className={cn(
        "absolute right-5 bottom-[18px] z-[3] cursor-pointer overflow-hidden rounded-[14px] border-0 p-0 shadow-float material-glass transition-opacity duration-250",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Content layout={layout} nodes={nodes} m={m} />
      <Frame m={m} area={area} />
    </button>
  );
}
