"use client";

import { CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./tooltip";

export type CheckOutcome = "pass" | "warn" | "fail";

const SPECS: Record<
  CheckOutcome,
  { label: string; icon: typeof CheckCircle; className: string; ring: string }
> = {
  pass: {
    label: "Réussi",
    icon: CheckCircle,
    className: "bg-val-bg text-val-fg",
    ring: "var(--val-fg)",
  },
  warn: {
    label: "À surveiller",
    icon: Warning,
    className: "bg-prop-bg text-prop-fg",
    ring: "var(--prop-fg)",
  },
  fail: {
    label: "Échec",
    icon: XCircle,
    className: "bg-err-solid text-on-err",
    ring: "var(--err-solid)",
  },
};

/** Result of a consistency check; the selected one carries a ring. */
export function CheckBadge({
  outcome,
  label,
  detail,
  selected = false,
  onClick,
  className,
}: {
  outcome: CheckOutcome;
  label?: React.ReactNode;
  detail?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const spec = SPECS[outcome];
  const Icon = spec.icon;
  const badge = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-outcome={outcome}
      className={cn(
        "inline-flex h-8 flex-none items-center gap-1.5 rounded-full border-0 pr-3 pl-2.5 text-ui font-semibold whitespace-nowrap",
        "transition-shadow duration-200 ease-soft",
        spec.className,
        className,
      )}
      style={{
        boxShadow: selected ? `0 0 0 2px var(--node), 0 0 0 3.5px ${spec.ring}` : "none",
      }}
    >
      <Icon size={15} weight="fill" />
      {label ?? spec.label}
    </button>
  );
  return detail ? <Tooltip content={detail}>{badge}</Tooltip> : badge;
}
