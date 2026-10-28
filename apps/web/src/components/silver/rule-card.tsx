"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HatchGlyph } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { springs } from "@/lib/motion";
import type { ReviewRule } from "@/lib/project/queries";
import {
  CONFIDENCE,
  type BeforeAfter,
  type Decision,
  type ParamKind,
  type RuleParam,
} from "@/lib/silver/review";
import type { StatusKind } from "@/components/ui/status-badge";

/** Three bars of rising height, filled up to the confidence level (C3). */
function ConfidenceMeter({ level }: { level: ReviewRule["confidence"] }) {
  const { label, bars } = CONFIDENCE[level];
  const strong = bars === 3;
  return (
    <span
      className={cn(
        "ml-auto flex items-center gap-[7px] text-[12.5px]",
        strong ? "text-tx2" : "text-prop-fg",
      )}
    >
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px]",
              i <= bars ? (strong ? "bg-tx2" : "bg-prop-fg") : "bg-hair",
            )}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export type RuleCardProps = {
  rule: ReviewRule;
  label: string;
  badge: { kind: StatusKind; label: string };
  examples: BeforeAfter[];
  summary: string | null;
  examplesLoading: boolean;
  params: RuleParam[];
  /** The plan is a draft: decisions can be taken. */
  decidable: boolean;
  /** Delay of the decision animation (« Valider les règles à confiance élevée »). */
  delay: number;
  busy: boolean;
  onDecide: (decision: Decision | null) => void;
  onEdit: (values: Partial<Record<ParamKind, string>>) => Promise<void>;
};

/**
 * RuleCard: badge, id, confidence; title and columns; the French explanation; before and
 * after values; the settings when edited; Rejeter, Modifier, Valider. A proposed rule
 * has a dashed outline that closes when it is validated.
 */
export function RuleCard({
  rule,
  label,
  badge,
  examples,
  summary,
  examplesLoading,
  params,
  decidable,
  delay,
  busy,
  onDecide,
  onEdit,
}: RuleCardProps) {
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Partial<Record<ParamKind, string>>>({});
  const [saving, setSaving] = useState(false);
  const proposed = decidable && !rule.decision;
  const rejected = rule.decision === "rejected";
  const changed = params.some((p) => values[p.kind] !== undefined && values[p.kind] !== p.value);

  const save = async () => {
    setSaving(true);
    try {
      await onEdit(values);
      setEditing(false);
      setValues({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.article
      layout="position"
      data-testid={`rule-${rule.id}`}
      data-decision={rule.decision ?? "pending"}
      aria-label={`${label} ${rule.title}`}
      initial={false}
      animate={{
        opacity: rejected ? 0.62 : 1,
        scale: rule.decision === "validated" && !reduce ? 0.995 : 1,
      }}
      transition={{ ...springs.settle, delay: delay / 1000 }}
      className={cn(
        "flex flex-col gap-3.5 rounded-xl bg-node px-5 py-[18px] shadow-sm",
        "outline-offset-[-1.5px] transition-[outline-color] duration-200",
        proposed
          ? "outline-[1.5px] outline-prop-bd outline-dashed"
          : "outline-0 outline-transparent",
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <header className="flex items-center gap-2.5">
        <motion.span
          key={badge.label}
          initial={reduce ? false : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...springs.pop, delay: delay / 1000 }}
          className="flex"
        >
          <StatusBadge kind={badge.kind} label={badge.label} size={12.5} />
        </motion.span>
        <span className="font-mono text-[12.5px] text-tx3">{label}</span>
        <ConfidenceMeter level={rule.confidence} />
      </header>

      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[17px] leading-tight font-semibold tracking-[-0.012em]">
          {rule.title}
        </h3>
        {rule.columns.length ? (
          <div className="flex flex-wrap gap-1">
            {rule.columns.map((column) => (
              <span
                key={column}
                className="rounded-xs bg-sunk px-[7px] py-0.5 font-mono text-[12.5px] text-tx2"
              >
                {column}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="m-0 text-[14px] leading-[1.55] text-pretty text-tx2">{rule.explanation}</p>

      {examples.length ? (
        <div
          className="flex flex-col overflow-hidden rounded-lg bg-sunk"
          data-testid="before-after"
        >
          <div className="grid grid-cols-[1fr_20px_1fr] gap-2 px-3 pt-2 pb-1 text-[12px] font-semibold text-tx3">
            <span>Avant</span>
            <span />
            <span>Après</span>
          </div>
          {examples.map((example, index) => (
            <div
              key={`${example.column}-${index}`}
              className="grid min-h-[34px] grid-cols-[1fr_20px_1fr] items-center gap-2 border-t border-hair px-3 font-mono text-[12.5px]"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-tx2">
                {example.personal ? <HatchGlyph size={10} className="text-pii-fg" /> : null}
                <span className="truncate" title={example.before}>
                  {example.before}
                </span>
              </span>
              <ArrowRight size={13} className="text-tx3" aria-label="devient" />
              <span
                title={example.after}
                className={cn(
                  "truncate font-medium",
                  example.invalid ? "text-err-fg" : example.personal ? "text-pii-fg" : "text-tx",
                )}
              >
                {example.after}
              </span>
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="rounded-lg bg-sunk px-3 py-2.5 font-mono text-[12.5px] text-tx2">
          {summary}
        </div>
      ) : examplesLoading && rule.columns.length && rule.kind !== "primary_key" ? (
        <div className="h-[76px] animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--sunk)_0%,var(--hair)_50%,var(--sunk)_100%)] bg-[length:840px_100%]" />
      ) : null}

      {editing ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={springs.sheet}
          className="grid gap-3 sm:grid-cols-2"
          data-testid="rule-params"
        >
          {params.map((param) => (
            <label
              key={param.kind}
              className="flex flex-col gap-1.5 text-meta font-semibold text-tx2"
            >
              {param.label}
              <Select
                value={values[param.kind] ?? param.value}
                onValueChange={(value) => setValues((v) => ({ ...v, [param.kind]: value }))}
              >
                <SelectTrigger aria-label={param.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {param.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          {params.length === 0 ? (
            <p className="m-0 text-ui text-tx3 sm:col-span-2">
              Cette règle n’a pas de réglage : validez-la ou rejetez-la.
            </p>
          ) : null}
        </motion.div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[13px] text-tx3">
          {rule.decision === "validated"
            ? "Validée, appliquée à l’approbation du plan"
            : rule.decision === "rejected"
              ? "Rejetée : la règle sera retirée à l’approbation"
              : rule.rejectable
                ? rule.affected
                  ? `${rule.affected} valeur${rule.affected > 1 ? "s" : ""} concernée${rule.affected > 1 ? "s" : ""}`
                  : ""
                : "Obligatoire avant diffusion : modifiable, pas rejetable"}
        </span>
        {editing ? (
          <>
            <Button variant="quiet" size="md" onClick={() => setEditing(false)}>
              Fermer
            </Button>
            <Button variant="primary" size="md" disabled={!changed} loading={saving} onClick={save}>
              Appliquer la modification
            </Button>
          </>
        ) : rule.decision && decidable ? (
          <Button variant="link" size="md" disabled={busy} onClick={() => onDecide(null)}>
            Annuler la décision
          </Button>
        ) : (
          <>
            {decidable ? (
              rule.rejectable ? (
                <Button
                  variant="quiet"
                  size="md"
                  disabled={busy}
                  onClick={() => onDecide("rejected")}
                >
                  Rejeter
                </Button>
              ) : (
                <Tooltip content="Une donnée personnelle doit avoir un traitement.">
                  <span>
                    <Button variant="quiet" size="md" disabled>
                      Rejeter
                    </Button>
                  </span>
                </Tooltip>
              )
            ) : null}
            {params.length ? (
              <Button variant="tonal" size="md" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            ) : null}
            {decidable ? (
              <Button
                variant="primary"
                size="md"
                disabled={busy}
                onClick={() => onDecide("validated")}
              >
                Valider
              </Button>
            ) : null}
          </>
        )}
      </footer>
    </motion.article>
  );
}
