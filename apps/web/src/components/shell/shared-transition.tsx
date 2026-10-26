"use client";

import { motion } from "motion/react";
import { NodeIcon } from "@/components/pipeline/node-icon";
import { springs } from "@/lib/motion";
import { useShell } from "./shell-context";

export const transitionLayoutId = (id: string) => `node-card:${id}`;

/**
 * The double-clicked node, drawn over itself while the route changes. The detailed
 * screen renders its header card with the same layoutId, so the card grows from the
 * node to the header on the panel spring (380/34).
 */
export function SharedTransitionLayer() {
  const { transition } = useShell();
  if (!transition) return null;
  return (
    <motion.div
      layoutId={transitionLayoutId(transition.id)}
      transition={{ layout: springs.sheet }}
      aria-hidden
      className="pointer-events-none fixed z-[60] flex items-start gap-3 overflow-hidden rounded-lg bg-node px-3.5 py-[13px] shadow-hover"
      style={{
        left: transition.rect.x,
        top: transition.rect.y,
        width: transition.rect.width,
        height: transition.rect.height,
      }}
    >
      <span className="flex size-[38px] flex-none items-center justify-center rounded-md bg-acc-soft text-acc-tx">
        <NodeIcon node={transition} size={21} weight="duotone" />
      </span>
      <span className="truncate text-[16.5px] font-semibold">{transition.name}</span>
    </motion.div>
  );
}
