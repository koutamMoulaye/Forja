"use client";

import { Check, Info, X } from "@phosphor-icons/react";
import { toast as sonner, Toaster as SonnerToaster } from "sonner";
import { cn } from "@/lib/cn";
import { toastDurations } from "@/lib/motion";

export type ToastTone = "success" | "info" | "error";

type ToastInput = {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

const TONES: Record<ToastTone, { icon: React.ReactNode; className: string }> = {
  success: { icon: <Check size={13} weight="fill" />, className: "bg-val-bg text-val-fg" },
  info: { icon: <Info size={13} weight="bold" />, className: "bg-run-bg text-run-fg" },
  error: { icon: <X size={13} weight="bold" />, className: "bg-err-solid text-on-err" },
};

export function ToastCard({
  tone,
  title,
  description,
  action,
  onDismiss,
}: ToastInput & { tone: ToastTone; onDismiss?: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex w-max max-w-[min(520px,calc(100vw-32px))] items-center gap-3 rounded-xl py-3 pr-4 pl-3.5 text-tx shadow-float material-glass-hi"
    >
      <span
        className={cn(
          "flex size-6 flex-none items-center justify-center rounded-full",
          TONES[tone].className,
        )}
      >
        {TONES[tone].icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        {description ? <div className="text-meta text-tx3">{description}</div> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            onDismiss?.();
          }}
          className="ml-2 border-0 bg-transparent p-0 text-meta font-semibold text-acc-tx hover:underline"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function show(tone: ToastTone, input: ToastInput) {
  return sonner.custom(
    (id) => <ToastCard tone={tone} {...input} onDismiss={() => sonner.dismiss(id)} />,
    { duration: input.action ? toastDurations.long : toastDurations.short },
  );
}

/** Toasts appear at the top centre, 2.6 s (3.5 s with an action). */
export const toast = {
  success: (input: ToastInput) => show("success", input),
  info: (input: ToastInput) => show("info", input),
  error: (input: ToastInput) => show("error", input),
  dismiss: sonner.dismiss,
};

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={68}
      gap={8}
      visibleToasts={3}
      toastOptions={{ unstyled: true, className: "flex justify-center w-full" }}
    />
  );
}
