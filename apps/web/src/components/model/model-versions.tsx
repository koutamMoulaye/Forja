"use client";

import { useMemo, useState } from "react";
import { Card, ListSkeleton, ScreenError, SectionTitle } from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatWhen } from "@/lib/format";
import { diffGold, originView } from "@/lib/model/view";
import { useGoldPlans, type GoldPlan } from "@/lib/project/queries";
import { PLAN_STATUS } from "@/lib/silver/review";

/** Versions of the Gold plan and what changed between two of them. */
export function ModelVersions({ current }: { current: GoldPlan }) {
  const { project } = useShell();
  const plans = useGoldPlans(project.id);
  const ordered = useMemo(
    () => [...(plans.data ?? [])].sort((a, b) => b.version - a.version),
    [plans.data],
  );
  const [pair, setPair] = useState<{ from: number; to: number } | null>(null);
  if (plans.isPending) return <ListSkeleton rows={4} />;
  if (plans.isError)
    return <ScreenError error={plans.error} onRetry={() => void plans.refetch()} />;
  const to = pair?.to ?? current.version;
  const from = pair?.from ?? ordered.find((p) => p.version < to)?.version ?? to;
  const before = ordered.find((p) => p.version === from);
  const after = ordered.find((p) => p.version === to);
  const changes = before && after && before !== after ? diffGold(before, after) : [];
  const options = ordered.map((p) => ({ value: String(p.version), label: `Version ${p.version}` }));
  return (
    <div className="flex flex-col gap-4" data-testid="model-versions">
      <Card className="flex flex-col">
        {ordered.map((plan, index) => (
          <div
            key={plan.id}
            className={cn(
              "flex items-center gap-3 px-5 py-3.5",
              index > 0 && "border-t border-sunk",
            )}
          >
            <span className="w-10 font-mono text-[13px] text-tx3">v{plan.version}</span>
            <StatusBadge
              kind={PLAN_STATUS[plan.status].kind}
              label={PLAN_STATUS[plan.status].label}
              size={12.5}
            />
            <span className="text-[13.5px] text-tx2">{originView(plan.origin).title}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-tx3">
              {(plan.issues ?? []).filter((i) => i.severity === "error").length
                ? `${(plan.issues ?? []).filter((i) => i.severity === "error").length} erreur(s) à sa création`
                : ""}
            </span>
            <span className="text-[13px] whitespace-nowrap text-tx3 tabular-nums">
              {formatWhen(plan.created_at)}
            </span>
          </div>
        ))}
      </Card>
      {ordered.length > 1 ? (
        <Card className="flex flex-col gap-3 px-5 py-[18px]">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle>Comparer</SectionTitle>
            {(["from", "to"] as const).map((side) => (
              <Select
                key={side}
                value={String(side === "from" ? from : to)}
                onValueChange={(v) =>
                  setPair(side === "from" ? { from: Number(v), to } : { from, to: Number(v) })
                }
              >
                <SelectTrigger
                  aria-label={side === "from" ? "Version de départ" : "Version d’arrivée"}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
          {changes.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px] text-tx2">
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ui text-tx3">Même modèle dans ces deux versions.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
