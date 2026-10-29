"use client";

import { useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarBlank, CheckCircle, Info, WarningCircle } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  interpretSchedule,
  type ConnectionTest,
  type ScheduleInterpretation,
} from "@/lib/connections/queries";
import { SCHEDULE_PRESETS, formatNext } from "@/lib/connections/view";
import { useDebounced } from "@/lib/use-debounced";

/** « 1 Connexion — 2 Test — 3 Tables… »: where the wizard stands. */
export function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol
      aria-label="Étapes"
      className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1 p-0 text-meta"
    >
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "next";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-1.5"
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[11.5px] font-semibold tabular-nums",
                state === "current" && "bg-acc text-on-acc",
                state === "done" && "bg-val-bg text-val-fg",
                state === "next" && "bg-sunk text-tx3",
              )}
            >
              {index + 1}
            </span>
            <span className={cn(state === "current" ? "font-semibold text-tx" : "text-tx3")}>
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden className="mx-0.5 h-px w-4 bg-edge" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Outcome of a connection test, in a tinted block. */
export function TestOutcome({
  result,
  pending,
  error,
}: {
  result: ConnectionTest | null;
  pending: boolean;
  error: unknown;
}) {
  if (pending) {
    return (
      <p role="status" className="m-0 flex items-center gap-2 text-ui text-tx2">
        <Spinner size={13} /> Connexion en cours…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="m-0 rounded-xl bg-err-bg px-4 py-3 text-ui text-err-fg">
        {error instanceof ApiError ? error.message : "Le test n’a pas pu être lancé."}
      </p>
    );
  }
  if (!result) return null;
  return (
    <div
      role={result.ok ? "status" : "alert"}
      data-testid="connection-test"
      className={cn(
        "flex flex-col gap-1 rounded-xl px-4 py-3",
        result.ok ? "bg-val-bg text-val-fg" : "bg-err-bg text-err-fg",
      )}
    >
      <span className="flex items-center gap-2 text-ui font-semibold">
        {result.ok ? <CheckCircle size={17} weight="fill" /> : <WarningCircle size={17} />}
        {result.ok ? "Connexion réussie" : "Connexion impossible"}
        <span className="font-normal text-tx3 tabular-nums">{result.duration_ms} ms</span>
      </span>
      <span className="text-meta text-tx2">{result.server_version ?? result.message}</span>
      {result.ok && result.read_only === false ? (
        <span className="text-meta font-medium text-prop-fg">
          Ce compte peut écrire dans la base. Forja ne fait que lire, mais un compte en lecture
          seule est recommandé.
        </span>
      ) : null}
      {result.ok && result.read_only ? (
        <span className="text-meta text-tx2">Compte en lecture seule.</span>
      ) : null}
    </div>
  );
}

/** Advice shown with the credentials of a database. */
export function ReadOnlyAdvice() {
  return (
    <p className="m-0 flex items-start gap-2 rounded-xl bg-sunk px-3.5 py-2.5 text-meta text-tx2">
      <Info size={16} className="mt-px flex-none text-tx3" />
      <span>
        Utilisez un compte en <strong className="font-semibold text-tx">lecture seule</strong>,
        limité aux tables à charger. Les identifiants sont chiffrés sur ce poste et ne sont jamais
        réaffichés.
      </span>
    </p>
  );
}

/**
 * When loads run, typed in plain French (« tous les jours à 6 h ») or picked from the
 * presets; the interpretation and the next runs show as the phrase is typed.
 */
export function ScheduleField({
  projectId,
  value,
  onChange,
  onInterpretation,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  onInterpretation?: (interpretation: ScheduleInterpretation | null) => void;
}) {
  const text = useDebounced(value.trim(), 300);
  const interpretation = useQuery({
    queryKey: ["schedule-interpretation", projectId, text],
    enabled: text.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: () => interpretSchedule(projectId, text),
  });
  const inputId = useId();
  const current = text.length ? (interpretation.data ?? null) : null;
  useEffect(() => onInterpretation?.(current), [current, onInterpretation]);

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={inputId} className="text-meta font-semibold text-tx2">
        Quand charger ?
      </label>
      <Input
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="tous les jours à 6 h"
        data-testid="schedule-input"
        aria-describedby={`${inputId}-result`}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choix rapides">
        {SCHEDULE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value.trim().toLowerCase() === preset.toLowerCase()}
            className="h-7 rounded-lg bg-sunk px-2.5 text-meta text-tx2 transition-colors hover:text-tx aria-pressed:bg-acc-soft aria-pressed:text-acc-tx"
          >
            {preset}
          </button>
        ))}
      </div>
      <div id={`${inputId}-result`} aria-live="polite" className="min-h-[44px]">
        {interpretation.isFetching && !current ? (
          <span className="flex items-center gap-2 text-meta text-tx3">
            <Spinner size={11} /> Interprétation…
          </span>
        ) : interpretation.isError && text.length ? (
          <span role="alert" className="text-meta font-medium text-err-fg">
            {interpretation.error instanceof ApiError
              ? interpretation.error.message
              : "Planification non comprise."}
          </span>
        ) : current ? (
          <div className="flex flex-col gap-1" data-testid="schedule-interpretation">
            <span className="flex items-center gap-2 text-ui font-semibold">
              <CalendarBlank size={16} className="text-acc-tx" />
              {current.description}
              {current.cron ? (
                <span className="font-mono text-mono font-normal text-tx3">{current.cron}</span>
              ) : null}
            </span>
            {current.next_runs.length ? (
              <span className="text-meta text-tx2">
                Prochains chargements : {current.next_runs.map((r) => formatNext(r)).join(" · ")} (
                {current.timezone})
              </span>
            ) : (
              <span className="text-meta text-tx2">Chargements lancés à la main.</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
