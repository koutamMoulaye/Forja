"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/status-badge";
import { HatchGlyph } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";
import type { GraphNode, NodeLook } from "@/lib/pipeline/model";
import { NodeIcon } from "./node-icon";

export type ZoomLevel = "far" | "standard" | "near";

/** Semantic zoom: compartments below 60 %, key columns above 115 %. */
export function zoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.6) return "far";
  if (zoom > 1.15) return "near";
  return "standard";
}

export type CanvasNodeData = {
  node: GraphNode;
  look: NodeLook;
  info: string;
  level: ZoomLevel;
  /** Outside the selected lineage or the active filter. */
  dimmed: boolean;
  /** Selected, or on the selected lineage. */
  active: boolean;
  selected: boolean;
  /** Folded compartment: the node is a point its links attach to. */
  hidden: boolean;
  /** Entrance delay in ms when the node first appears, null once it is there. */
  enterDelay: number | null;
  /** Height without the zoomed-in details: the far view draws a plain card of it. */
  height: number;
};

export type CanvasNodeType = Node<CanvasNodeData, "pipeline">;

const TONE_EDGE = {
  prop: "var(--prop-fg)",
  err: "var(--err-solid)",
  run: "var(--run-fg)",
  queue: "var(--edge)",
} as const;

const TONE_TILE = {
  prop: "text-prop-fg",
  err: "text-err-fg",
  run: "text-run-fg",
  queue: "text-tx2",
} as const;

/** Breaks names after « _ » and « . » only, never in the middle of a word. */
function breakable(name: string): React.ReactNode[] {
  return name
    .split(/(?<=[_.\-\s])/)
    .flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

function NodeName({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element) setCut(element.scrollHeight > element.clientHeight + 1);
  }, [name]);
  const text = (
    <div
      ref={ref}
      className="line-clamp-2 text-[16.5px] leading-[1.25] font-semibold tracking-[-0.012em] break-normal"
    >
      {breakable(name)}
    </div>
  );
  return cut ? <Tooltip content={name}>{text}</Tooltip> : text;
}

function CanvasNodeView({ data }: NodeProps<CanvasNodeType>) {
  const { node, look, info, level, dimmed, active, selected, hidden, enterDelay, height } = data;
  const reduce = useReducedMotion();
  const far = level === "far";
  const near = level === "near";
  const tone = look.tone;
  const shadows = [
    tone ? `inset 3px 0 0 ${TONE_EDGE[tone]}` : "",
    selected ? "0 0 0 2px var(--acc)" : "",
  ].filter(Boolean);
  const running = node.state === "running" && node.run?.percent != null;
  const quality = node.type === "source" && node.state === "applied" ? node.quality_score : null;

  if (far) {
    // Far zoom: the compartments' counters speak; nodes are light, plain cards.
    return (
      <>
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="canvas-handle"
        />
        <div
          data-testid={`node-${node.id}`}
          data-state={node.state}
          className="canvas-node animate-in-fade rounded-lg bg-node"
          style={
            {
              height,
              opacity: hidden ? 0 : dimmed ? 0.28 : 0.5,
              "--ring": shadows.length ? shadows.join(", ") : "0 0 #0000",
            } as React.CSSProperties
          }
        />
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className="canvas-handle"
        />
      </>
    );
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="canvas-handle"
      />
      <motion.div
        data-testid={`node-${node.id}`}
        data-state={node.state}
        initial={
          enterDelay === null ? false : reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }
        }
        animate={{ opacity: hidden ? 0 : dimmed ? 0.28 : far ? 0.5 : 1, scale: 1, y: 0 }}
        transition={{
          opacity: { duration: 0.26, delay: enterDelay ? enterDelay / 1000 : 0 },
          scale: { ...springs.sheet, delay: enterDelay ? enterDelay / 1000 : 0 },
          y: { ...springs.sheet, delay: enterDelay ? enterDelay / 1000 : 0 },
        }}
        style={
          { "--ring": shadows.length ? shadows.join(", ") : "0 0 #0000" } as React.CSSProperties
        }
        className={cn(
          "canvas-node relative box-border flex w-full cursor-pointer flex-col gap-2.5 rounded-lg bg-node px-3.5 py-[13px] text-tx",
          hidden && "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 animate-in-fade items-start gap-3 transition-opacity duration-250",
            far && "opacity-0",
          )}
        >
          <span
            className={cn(
              "flex size-[38px] flex-none items-center justify-center rounded-md transition-colors duration-200",
              active
                ? "bg-acc-soft text-acc-tx"
                : cn("bg-sunk", tone ? TONE_TILE[tone] : "text-tx2"),
            )}
          >
            <NodeIcon node={node} size={21} weight={active || look.loud ? "duotone" : "regular"} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px] pt-px">
            <NodeName name={node.name} />
            <div className="flex h-[23px] min-w-0 items-center gap-[7px]">
              {look.loud ? (
                <motion.span
                  key={`${look.kind}:${look.kind === "run" ? "" : look.label}`}
                  initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={reduce ? { duration: 0.2 } : springs.pop}
                  className="flex"
                >
                  <StatusBadge kind={look.kind} label={look.label} size={14.5} />
                </motion.span>
              ) : (
                <CheckCircle size={16} className="flex-none text-tx3" aria-hidden />
              )}
              {info ? (
                <span className="truncate text-[15.5px] text-tx3 tabular-nums">{info}</span>
              ) : null}
            </div>
          </div>
          {node.pii_count > 0 ? (
            <span title="Colonnes pseudonymisées" className="flex pt-1 text-pii-fg">
              <HatchGlyph size={13} />
            </span>
          ) : null}
        </div>
        <div
          aria-hidden={!near}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-250 ease-soft",
            near ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden pl-[50px]">
            {quality != null ? (
              <div className="flex items-center gap-2">
                <span className="flex h-[5px] flex-1 overflow-hidden rounded-[3px] bg-sunk">
                  <span
                    className={cn("rounded-[3px]", quality >= 85 ? "bg-val-fg" : "bg-prop-fg")}
                    style={{ width: `${quality}%` }}
                  />
                </span>
                <span className="text-[13.5px] text-tx2 tabular-nums">
                  Qualité {String(Math.round(quality * 10) / 10).replace(".", ",")}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {node.highlights.map((key) => (
                <span
                  key={key}
                  className="rounded-xs bg-sunk px-[7px] py-0.5 font-mono text-[13px] text-tx2"
                >
                  {key}
                </span>
              ))}
            </div>
          </div>
        </div>
        {running ? (
          <span className="absolute right-3.5 bottom-[7px] left-3.5 flex h-[3px] overflow-hidden rounded-[2px] bg-run-bg">
            <span
              className="rounded-[2px] bg-run-fg transition-[width] duration-150 ease-linear"
              style={{ width: `${node.run!.percent}%` }}
            />
          </span>
        ) : null}
      </motion.div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="canvas-handle"
      />
    </>
  );
}

export const CanvasNode = memo(CanvasNodeView);
