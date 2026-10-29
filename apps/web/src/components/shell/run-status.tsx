"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, X } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { easeSoft } from "@/lib/motion";
import {
  JOB_TEXT,
  isActive,
  runDuration,
  useCancelRun,
  useRunTracker,
  type Job,
} from "@/lib/project/use-runs";
import { useShell } from "./shell-context";

/** Steps of a run as the top bar names them. */
const STEPS: Record<string, string> = {
  dbt: "Construction des tables",
  profile: "Profilage",
  silver: "Nettoyage",
  gold: "Modèle en étoile",
  serving: "Publication",
};

function describe(run: Job): { title: string; meta: string; percent: number } {
  const text = JOB_TEXT[run.type];
  const label = text.label;
  if (run.status === "queued") return { title: label, meta: "en attente", percent: 0 };
  if (run.status === "running") {
    const percent = run.progress?.percent ?? 0;
    return {
      title: run.progress?.message || STEPS[run.progress?.step ?? ""] || label,
      meta: `${percent} %`,
      percent,
    };
  }
  const duration = runDuration(run) ?? "";
  if (run.status === "succeeded") return { title: text.done, meta: duration, percent: 100 };
  if (run.status === "failed") return { title: text.failed, meta: duration, percent: 100 };
  return { title: "Run annulé", meta: "aucune table modifiée", percent: 0 };
}

/** The run in progress, in the top bar: GET /runs/{id} polled until it ends. */
export function RunStatus() {
  const shell = useShell();
  const { run } = useRunTracker(shell.project.id, shell.role !== "analyst");
  const cancel = useCancelRun(shell.project.id);
  useRunEndToast(run, shell.project.id);
  if (shell.view !== "engineer" || shell.tablet) return null;

  return (
    <>
      {/* A run that starts or ends is spoken; its percentage is not. */}
      <span className="sr-only" aria-live="polite" data-testid="run-status-announcer">
        {run ? describe(run).title + (isActive(run.status) ? ", en cours" : "") : ""}
      </span>
      <AnimatePresence>
        {run ? (
          <motion.div
            key="run"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: easeSoft }}
            data-testid="run-status"
            data-status={run.status}
            className="flex h-9 items-center gap-2.5 rounded-md bg-sunk pr-1.5 pl-2.5"
          >
            <RunIcon run={run} />
            <Link
              href={`/projects/${shell.project.id}/runs/${run.id}`}
              className="flex min-w-0 flex-col gap-[3px] text-tx no-underline hover:no-underline"
            >
              {(() => {
                const { title, meta, percent } = describe(run);
                return (
                  <>
                    <span className="flex gap-2 text-meta whitespace-nowrap">
                      <span className="max-w-[220px] truncate font-medium">{title}</span>
                      <span className="text-tx3 tabular-nums">{meta}</span>
                    </span>
                    <span className="flex h-[3px] w-full overflow-hidden rounded-[2px] bg-hair">
                      <span
                        className={cn(
                          "rounded-[2px] transition-[width] duration-150 ease-linear",
                          run.status === "succeeded"
                            ? "bg-val-fg"
                            : run.status === "failed"
                              ? "bg-err-solid"
                              : "bg-run-fg",
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  </>
                );
              })()}
            </Link>
            {isActive(run.status) ? (
              <Tooltip content="Annuler le run">
                <button
                  type="button"
                  aria-label="Annuler le run"
                  disabled={cancel.isPending || run.cancel_requested}
                  onClick={() =>
                    cancel.mutate(run.id, {
                      onSuccess: () =>
                        toast.info({
                          title: "Annulation demandée",
                          description: "Les tables gardent leur dernière version validée",
                        }),
                      onError: () => toast.error({ title: "Annulation impossible" }),
                    })
                  }
                  className="flex size-[26px] items-center justify-center rounded-lg border-0 bg-transparent text-tx3 transition-colors hover:bg-node hover:text-tx disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </Tooltip>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function RunIcon({ run }: { run: Job }) {
  const base = "flex size-6 flex-none items-center justify-center rounded-full";
  if (isActive(run.status)) {
    return (
      <span className={cn(base, "bg-run-bg text-run-fg")}>
        <Spinner size={11} />
      </span>
    );
  }
  if (run.status === "succeeded") {
    return (
      <span className={cn(base, "bg-val-bg text-val-fg")}>
        <Check size={12} weight="bold" />
      </span>
    );
  }
  if (run.status === "failed") {
    return (
      <span className={cn(base, "bg-err-solid text-on-err")}>
        <X size={12} weight="bold" />
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-sunk text-tx3")}>
      <Minus size={12} weight="bold" />
    </span>
  );
}

/** Toast at the top centre when the tracked run ends, wherever the user is in the project. */
function useRunEndToast(run: Job | null, projectId: string) {
  const router = useRouter();
  const seen = useRef<Map<string, Job["status"]>>(new Map());
  useEffect(() => {
    if (!run) return;
    const before = seen.current.get(run.id);
    seen.current.set(run.id, run.status);
    if (!before || !isActive(before) || isActive(run.status)) return;
    const text = JOB_TEXT[run.type];
    const duration = runDuration(run);
    const open = {
      label: "Voir le run",
      onClick: () => router.push(`/projects/${projectId}/runs/${run.id}`),
    };
    if (run.status === "succeeded") {
      const tables = run.progress?.done?.filter((item) => !item.endsWith("__rejects")).length;
      toast.success({
        title: text.done,
        description: [tables ? `${tables} table${tables > 1 ? "s" : ""} à jour` : "", duration]
          .filter(Boolean)
          .join(" en "),
      });
    } else if (run.status === "failed") {
      toast.error({ title: text.failed, description: run.error ?? undefined, action: open });
    }
  }, [run, projectId, router]);
}
