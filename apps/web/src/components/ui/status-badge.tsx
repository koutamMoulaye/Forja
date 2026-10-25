import {
  CheckCircle,
  Check,
  CircleDashed,
  Warning,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { HatchGlyph, Spinner } from "./spinner";

export type StatusKind =
  "err" | "prop" | "warn" | "run" | "pii" | "val" | "app" | "pub" | "rej" | "queue";

/**
 * Three levels of importance (planche v2, "Badges par importance"):
 * critical, a strong pill (solid or dashed); active, a tinted pill; calm, icon and text.
 */
export type StatusTier = "critical" | "active" | "calm";

type Spec = {
  label: string;
  tier: StatusTier;
  icon?: { component: Icon; weight: "regular" | "fill" };
  glyph?: "spinner" | "hatch";
  className: string;
  weight: number;
};

const SPECS: Record<StatusKind, Spec> = {
  err: {
    label: "Erreur",
    tier: "critical",
    icon: { component: WarningCircle, weight: "fill" },
    className: "bg-err-solid text-on-err",
    weight: 600,
  },
  prop: {
    label: "À revoir",
    tier: "critical",
    icon: { component: CircleDashed, weight: "regular" },
    className: "border border-dashed border-prop-bd bg-prop-bg text-prop-fg",
    weight: 600,
  },
  warn: {
    label: "À surveiller",
    tier: "critical",
    icon: { component: Warning, weight: "fill" },
    className: "bg-prop-bg text-prop-fg",
    weight: 600,
  },
  run: {
    label: "En cours",
    tier: "active",
    glyph: "spinner",
    className: "bg-run-bg text-run-fg",
    weight: 500,
  },
  pii: {
    label: "Pseudonymisé",
    tier: "active",
    glyph: "hatch",
    className: "bg-pii-bg text-pii-fg",
    weight: 500,
  },
  val: {
    label: "Validé",
    tier: "calm",
    icon: { component: CheckCircle, weight: "fill" },
    className: "text-val-fg",
    weight: 500,
  },
  app: {
    label: "Appliqué",
    tier: "calm",
    icon: { component: Check, weight: "regular" },
    className: "text-tx3",
    weight: 400,
  },
  pub: {
    label: "Publié",
    tier: "calm",
    icon: { component: Check, weight: "regular" },
    className: "text-tx3",
    weight: 400,
  },
  rej: {
    label: "Rejeté",
    tier: "calm",
    icon: { component: XCircle, weight: "regular" },
    className: "text-tx3",
    weight: 400,
  },
  queue: {
    label: "En attente",
    tier: "calm",
    icon: { component: CircleDashed, weight: "regular" },
    className: "text-tx3",
    weight: 400,
  },
};

export const STATUS_KINDS = Object.keys(SPECS) as StatusKind[];

export function statusTier(kind: StatusKind): StatusTier {
  return SPECS[kind].tier;
}

export function statusLabel(kind: StatusKind): string {
  return SPECS[kind].label;
}

/** Font size in px; the pill's height and padding follow it, as in the mockups. */
export type StatusBadgeSize = 12 | 12.5 | 13 | 14.5;

export function StatusBadge({
  kind,
  label,
  size = 12.5,
  className,
}: {
  kind: StatusKind;
  label?: React.ReactNode;
  size?: StatusBadgeSize;
  className?: string;
}) {
  const spec = SPECS[kind];
  const pill = spec.tier !== "calm";
  const glyph =
    spec.glyph === "spinner" ? (
      <Spinner size={size - 1} />
    ) : spec.glyph === "hatch" ? (
      <HatchGlyph size={size - 1} />
    ) : spec.icon ? (
      <spec.icon.component size={size + 2} weight={spec.icon.weight} className="flex-none" />
    ) : null;
  return (
    <span
      data-status={kind}
      data-tier={spec.tier}
      className={cn(
        "inline-flex flex-none items-center gap-[5px] leading-none whitespace-nowrap tabular-nums",
        pill && "box-border rounded-full",
        spec.className,
        className,
      )}
      style={{
        fontSize: size,
        fontWeight: spec.weight,
        ...(pill
          ? {
              height: Math.round(size * 1.84),
              padding: `0 ${Math.round(size * 0.72)}px 0 ${Math.round(size * 0.52)}px`,
            }
          : null),
      }}
    >
      {glyph}
      {label ?? spec.label}
    </span>
  );
}
