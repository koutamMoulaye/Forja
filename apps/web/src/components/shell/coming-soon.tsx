"use client";

import { CalendarDots, type Icon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";

/** Screen title and subtitle, as on every page of the mockups. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-title font-semibold">{title}</h1>
        {subtitle ? <div className="text-body text-tx2">{subtitle}</div> : null}
      </div>
      {actions ? <div className="ml-auto flex items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

/** A clean empty state for screens that arrive in a later step. */
export function ComingSoon({
  icon: ScreenIcon,
  title,
  subtitle,
  heading,
  description,
  step,
  mockup,
  canvas = false,
}: {
  icon: Icon;
  title: string;
  subtitle?: string;
  heading: string;
  description: string;
  /** The step that brings the screen, e.g. "5b". */
  step?: string;
  /** Mockup reference, e.g. "S3" or "v2 V6". */
  mockup?: string;
  canvas?: boolean;
}) {
  const card = (
    <div
      data-testid="coming-soon"
      className={cn(
        "flex w-full max-w-[640px] flex-col items-center gap-5 rounded-3xl px-10 pt-11 pb-9 text-center",
        canvas ? "shadow-float material-glass" : "bg-node shadow-sm",
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-[18px] bg-acc-soft text-acc-tx">
        <ScreenIcon size={34} weight="duotone" />
      </span>
      <div className="flex flex-col items-center gap-1.5">
        <h2 className="m-0 text-[24px] font-semibold tracking-[-0.022em]">{heading}</h2>
        <p className="m-0 max-w-[460px] text-[15px] leading-normal text-tx2">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="flex h-7 items-center gap-1.5 rounded-lg bg-sunk px-2.5 text-meta text-tx2">
          <CalendarDots size={16} />
          {step ? `À venir, étape ${step}` : "À venir"}
        </span>
        {mockup ? <StatusBadge kind="queue" label={`Maquette ${mockup}`} size={13} /> : null}
      </div>
    </div>
  );

  if (canvas) {
    return (
      <div className="relative flex h-full min-h-dvh items-center justify-center bg-cv bg-[radial-gradient(var(--dot)_1px,transparent_1.3px)] bg-[length:24px_24px] px-6 pt-14">
        <h1 className="sr-only">{title}</h1>
        {card}
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col gap-6 px-7 pt-2.5 pb-7">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex flex-1 items-start justify-center pt-[6vh]">{card}</div>
    </div>
  );
}
