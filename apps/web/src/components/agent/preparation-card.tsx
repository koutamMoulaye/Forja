"use client";

import { useEffect, useState } from "react";
import { BellRinging, BellSimple, Check, Question, X } from "@phosphor-icons/react";
import { Monogram } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { agentHeadline, agentMeta, agentSteps, type AgentStep } from "@/lib/agent/steps";
import type { MartIteration } from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import type { Job } from "@/lib/project/use-runs";

/** The agent's avatar beside its messages (34 px monogram, as in ForjaApp). */
export function AgentAvatar() {
  return (
    <span className="mt-0.5 flex-none" aria-hidden>
      <Monogram size={34} />
    </span>
  );
}

function StepMark({ state }: { state: AgentStep["state"] }) {
  return (
    <span
      className={cn(
        "mt-px flex size-[26px] flex-none items-center justify-center rounded-full text-[12px] transition-all duration-(--dur-step) ease-soft",
        state === "done" && "bg-val-bg text-val-fg",
        state === "wait" && "bg-prop-bg text-prop-fg shadow-[inset_0_0_0_1px_var(--prop-bd)]",
        state === "run" && "bg-run-bg text-run-fg",
        state === "fail" && "bg-err-bg text-err-fg",
        state === "idle" && "shadow-[inset_0_0_0_1.5px_var(--edge)]",
      )}
    >
      {state === "done" ? (
        <Check size={13} weight="bold" />
      ) : state === "wait" ? (
        <Question size={13} weight="bold" />
      ) : state === "run" ? (
        <Spinner size={12} />
      ) : state === "fail" ? (
        <X size={13} weight="bold" />
      ) : null}
    </span>
  );
}

/**
 * What a screen reader hears: the step in progress (« Étape 3 sur 6 : … »), then the
 * outcome. Only step changes are spoken, never the ticking time.
 */
export function stepAnnouncement(iteration: MartIteration, steps: AgentStep[]): string {
  if (iteration.status !== "processing") return agentHeadline(iteration);
  const at = steps.findIndex((step) => step.state === "run" || step.state === "wait");
  if (at < 0) return agentHeadline(iteration);
  return `Étape ${at + 1} sur ${steps.length} : ${steps[at]!.title}`;
}

/** Seconds tick while the run is in progress, so the elapsed time moves. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Preparation card (C4): what the agent is doing, the six steps of the real job, the
 * elapsed time and the path used; « Me prévenir à la fin » and « Annuler » while busy.
 */
export function PreparationCard({
  iteration,
  job,
  watched,
  onWatch,
  onCancel,
  cancelling = false,
}: {
  iteration: MartIteration;
  job: Job | null | undefined;
  watched: boolean;
  onWatch?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const busy = iteration.status === "processing";
  const now = useNow(busy);
  const steps = agentSteps(iteration, job);
  const stage = steps.findIndex((step) => step.state === "run" || step.state === "wait");
  const progress = job?.progress?.percent ?? 0;
  return (
    <div className="flex items-start gap-3" data-testid="preparation-card">
      <AgentAvatar />
      <span className="sr-only" aria-live="polite" data-testid="agent-announcer">
        {stepAnnouncement(iteration, steps)}
      </span>
      <section
        aria-label="Préparation du data mart"
        aria-busy={busy}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-2xl bg-node px-[18px] pt-4 pb-2.5 shadow-sm"
      >
        <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-2 pb-1.5">
          <h2 className="m-0 text-[16px] font-semibold">{agentHeadline(iteration)}</h2>
          <span data-testid="preparation-meta" className="text-[13.5px] text-tx3 tabular-nums">
            {agentMeta(iteration, job, now)}
          </span>
          {busy ? (
            <span className="ml-auto flex gap-1.5">
              <Button
                variant="tonal"
                size="lg"
                aria-pressed={watched}
                onClick={onWatch}
                className="h-11 rounded-xl"
              >
                {watched ? <BellRinging size={17} weight="fill" /> : <BellSimple size={17} />}
                {watched ? "Notification à la fin" : "Me prévenir à la fin"}
              </Button>
              <Button
                variant="quiet"
                size="lg"
                onClick={onCancel}
                loading={cancelling}
                className="h-11 rounded-xl"
              >
                Annuler
              </Button>
            </span>
          ) : null}
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {steps.map((step, index) => (
            <li
              key={step.id}
              data-state={step.state}
              className={cn(
                "flex items-start gap-3.5 py-[7px] transition-opacity duration-(--dur-step)",
                stage >= 0 && index > stage && step.state === "idle" && "opacity-55",
              )}
            >
              <StepMark state={step.state} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[16px]",
                    step.state === "idle" ? "font-normal text-tx3" : "font-semibold text-tx",
                    step.state === "fail" && "text-err-fg",
                  )}
                >
                  {step.title}
                </div>
                <div className="text-[14px] leading-snug text-tx3">{step.detail}</div>
                {step.state === "run" && (step.id === "build" || step.id === "check") ? (
                  <div
                    className="mt-2 flex h-1 max-w-[360px] overflow-hidden rounded-[2px] bg-run-bg"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <span
                      className="rounded-[2px] bg-run-fg transition-[width] duration-150 ease-linear"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
