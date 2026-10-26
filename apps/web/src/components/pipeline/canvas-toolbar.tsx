"use client";

import { forwardRef, useState } from "react";
import {
  Broom,
  CornersOut,
  Cube,
  Graph,
  Minus,
  Play,
  Plus,
  TreeStructure,
  UploadSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useStore } from "@xyflow/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { FILTERS, type Filter } from "@/lib/pipeline/model";

export type RunChoice = "build_all" | "build_silver" | "build_gold";

export const RUN_CHOICES: { type: RunChoice; label: string; description: string; icon: Icon }[] = [
  {
    type: "build_all",
    label: "Run complet",
    description: "Nettoyage, modèle en étoile et diffusion",
    icon: Graph,
  },
  {
    type: "build_silver",
    label: "Nettoyage",
    description: "Tables Silver des sources",
    icon: Broom,
  },
  {
    type: "build_gold",
    label: "Modèle en étoile",
    description: "Dimensions et faits Gold",
    icon: Cube,
  },
];

function ToolButton({
  label,
  onClick,
  children,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
}) {
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-9 items-center justify-center rounded-md border-0 bg-transparent text-tx transition-colors hover:bg-sunk"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ZoomPercent() {
  const percent = useStore((s) => Math.round(s.transform[2] * 100));
  return <>{percent} %</>;
}

const Separator = () => <span aria-hidden className="mx-1 h-[22px] w-px bg-hair" />;

type Props = {
  filter: Filter;
  counts: Record<Filter, number>;
  onFilter: (filter: Filter) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onAutoLayout: () => void;
  onAdd: () => void;
  onRun: (type: RunChoice) => void;
  running: boolean;
  canRun: boolean;
  style?: React.CSSProperties;
};

/** Floating bar at the bottom: filters, zoom, fit, layout, add, run. */
export const CanvasToolbar = forwardRef<HTMLDivElement, Props>(function CanvasToolbar(
  {
    filter,
    counts,
    onFilter,
    onZoomIn,
    onZoomOut,
    onFit,
    onAutoLayout,
    onAdd,
    onRun,
    running,
    canRun,
    style,
  },
  ref,
) {
  const [runOpen, setRunOpen] = useState(false);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Outils du canvas"
      data-testid="canvas-toolbar"
      style={style}
      className="absolute bottom-[18px] z-[3] flex h-[52px] -translate-x-1/2 items-center gap-1 rounded-xl px-2 shadow-float material-glass transition-[left] duration-(--dur-sheet) ease-soft"
    >
      <div
        role="radiogroup"
        aria-label="Filtrer"
        className="flex gap-0.5 rounded-lg bg-sunk p-[3px]"
      >
        {FILTERS.map(({ id, label }) => {
          const active = filter === id;
          const count = id === "all" ? 0 : counts[id];
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onFilter(id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-sm border-0 px-[11px] text-ui font-medium whitespace-nowrap transition-[background,box-shadow] duration-200",
                active ? "bg-node text-tx shadow-sm" : "bg-transparent text-tx2",
              )}
            >
              {label}
              {count > 0 ? (
                <span
                  className={cn(
                    "text-[12.5px] font-semibold tabular-nums",
                    id === "review" ? "text-prop-fg" : id === "error" ? "text-err-fg" : "text-tx3",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <Separator />
      <ToolButton label="Zoom arrière" shortcut="-" onClick={onZoomOut}>
        <Minus size={17} />
      </ToolButton>
      <span
        aria-live="polite"
        aria-label="Niveau de zoom"
        className="w-[50px] text-center text-meta text-tx2 tabular-nums"
      >
        <ZoomPercent />
      </span>
      <ToolButton label="Zoom avant" shortcut="+" onClick={onZoomIn}>
        <Plus size={17} />
      </ToolButton>
      <ToolButton label="Ajuster à l’écran" shortcut="0" onClick={onFit}>
        <CornersOut size={18} />
      </ToolButton>
      <ToolButton label="Mise en page automatique" onClick={onAutoLayout}>
        <TreeStructure size={18} />
      </ToolButton>
      <Separator />
      <button
        type="button"
        onClick={onAdd}
        className="flex h-9 items-center gap-[7px] rounded-md border-0 bg-transparent px-3 text-[14px] font-medium whitespace-nowrap text-tx transition-colors hover:bg-sunk"
      >
        <UploadSimple size={17} />
        Ajouter
      </button>
      <Popover open={runOpen} onOpenChange={setRunOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!canRun}
            aria-haspopup="menu"
            className="flex h-9 items-center gap-[7px] rounded-md border-0 bg-acc px-3.5 text-[14px] font-semibold whitespace-nowrap text-on-acc transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
          >
            <Play size={14} weight="fill" />
            {running ? "Run en cours" : "Lancer un run"}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="flex w-[300px] flex-col gap-0.5"
          aria-label="Type de run"
        >
          <div className="px-2.5 pt-2 pb-1 text-[12.5px] font-semibold text-tx3">Lancer</div>
          {RUN_CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              role="menuitem"
              onClick={() => {
                setRunOpen(false);
                onRun(choice.type);
              }}
              className="flex min-h-[52px] items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-acc-soft"
            >
              <span className="flex size-[34px] flex-none items-center justify-center rounded-md bg-sunk text-tx2">
                <choice.icon size={18} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-body font-medium text-tx">{choice.label}</span>
                <span className="text-meta text-tx3">{choice.description}</span>
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
});
