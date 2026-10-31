"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Broom, CheckCircle, Play, ShieldWarning } from "@phosphor-icons/react";
import { DataTable } from "@/components/screens/data-table";
import {
  Card,
  EmptyState,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  ScreenSkeleton,
  SectionTitle,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HatchGlyph, Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatDecimal, formatInteger, formatWhen, plural } from "@/lib/format";
import { springs } from "@/lib/motion";
import {
  keys,
  usePlan,
  usePlanReview,
  usePlanSamples,
  usePlans,
  useProfile,
  useRejects,
  useSource,
  type PlanReview,
  type ProfileReport,
  type TransformationPlan,
} from "@/lib/project/queries";
import { isActive, runKeys, RUN_DEFAULTS, RUN_POLL_MS, type Job } from "@/lib/project/use-runs";
import {
  PLAN_STATUS,
  countRules,
  diffPlans,
  highConfidencePending,
  matchesRuleFilter,
  paramsPatch,
  ruleBadge,
  ruleExamples,
  ruleLabel,
  ruleParams,
  ruleSummary,
  withDecisions,
  type Decision,
  type ParamKind,
  type RuleFilter,
} from "@/lib/silver/review";
import { fillRate, personalColumns, qualityComponents } from "@/lib/sources/view";
import { RuleCard } from "./rule-card";
import { useLiveEvents } from "@/lib/events/live";

type View = "rules" | "versions" | "quarantine";

/** Stagger of « Valider les règles à confiance élevée », per card. */
const BULK_STAGGER_MS = 40;

/** /projects/[id]/sources/[sourceId]/plan: rule-by-rule review of the Silver plan (C3). */
export function PlanReviewScreen({ sourceId }: { sourceId: string }) {
  const { project } = useShell();
  const queryClient = useQueryClient();
  const source = useSource(sourceId);
  const plan = usePlan(sourceId);
  const review = usePlanReview(sourceId);
  const profile = useProfile(sourceId);
  const samples = usePlanSamples(sourceId, plan.data?.version);
  const [view, setView] = useState<View>("rules");
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [stagger, setStagger] = useState<Record<string, number>>({});
  const [runId, setRunId] = useState<string | null>(null);

  const refresh = () => {
    for (const key of [
      ["plan", sourceId],
      keys.plans(sourceId),
      keys.review(sourceId),
      ["samples", sourceId],
      ["rejects", sourceId],
      keys.tables(project.id),
      keys.sources(project.id),
      ["graph", project.id],
      ["counters", project.id],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // Another tab (or engineer) changed the plan since it was shown: reload it rather than
  // act on a version nobody here has seen.
  const moved = (error: unknown) => {
    if (!(error instanceof ApiError) || error.code !== "plan_version_conflict") return false;
    toast.info({
      title: "Le plan a changé entre-temps",
      description: `Il est passé en version ${String(error.details.current_version)} ailleurs ; il vient d’être rechargé.`,
    });
    refresh();
    return true;
  };

  const decide = useMutation({
    mutationFn: async (decisions: Record<string, Decision | null>) =>
      unwrap(
        await api.POST("/sources/{source_id}/plan/review", {
          params: { path: { source_id: sourceId } },
          body: { decisions, version: review.data?.plan_version },
        }),
      ),
    onMutate: async (decisions) => {
      await queryClient.cancelQueries({ queryKey: keys.review(sourceId) });
      const previous = queryClient.getQueryData<PlanReview | null>(keys.review(sourceId));
      if (previous) {
        queryClient.setQueryData(keys.review(sourceId), withDecisions(previous, decisions));
      }
      return { previous };
    },
    onError: (error, _decisions, context) => {
      if (context?.previous) queryClient.setQueryData(keys.review(sourceId), context.previous);
      if (moved(error)) return;
      toast.error({
        title: "Décision non enregistrée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(keys.review(sourceId), data);
      void queryClient.invalidateQueries({ queryKey: ["graph", project.id] });
    },
  });

  const edit = async (patch: ReturnType<typeof paramsPatch>) => {
    try {
      const updated = unwrap(
        await api.PATCH("/sources/{source_id}/plan", {
          params: { path: { source_id: sourceId } },
          body: { ...patch, base_version: plan.data?.version },
        }),
      );
      toast.success({
        title: `Plan modifié, version ${updated.version}`,
        description: "La règle repasse en revue",
      });
      refresh();
    } catch (error) {
      if (moved(error)) throw error;
      toast.error({
        title: "Modification refusée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
      throw error;
    }
  };

  const approve = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/sources/{source_id}/plan/approve", {
          params: { path: { source_id: sourceId }, query: { version: plan.data?.version } },
        }),
      ),
    onSuccess: (approved) => {
      toast.success({
        title: `Plan approuvé, version ${approved.version}`,
        description: "Lancez le nettoyage pour construire la table",
      });
      refresh();
    },
    onError: (error) => {
      if (moved(error)) return;
      toast.error({
        title: "Approbation refusée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
    },
  });

  const launch = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/projects/{project_id}/runs", {
          params: { path: { project_id: project.id } },
          body: {
            type: "build_silver",
            source_ids: [sourceId],
            ...RUN_DEFAULTS,
          },
        }),
      ),
    onSuccess: (job) => {
      setRunId(job.id);
      queryClient.setQueryData(runKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: runKeys.list(project.id) });
    },
    onError: (error) =>
      toast.error({
        title: "Nettoyage non lancé",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });

  const stream = useLiveEvents();
  const run = useQuery({
    queryKey: runKeys.detail(runId ?? "none"),
    enabled: runId !== null,
    queryFn: async (): Promise<Job> =>
      unwrap(await api.GET("/runs/{run_id}", { params: { path: { run_id: runId! } } })),
    refetchInterval: (query) =>
      stream || (query.state.data && !isActive(query.state.data.status)) ? false : RUN_POLL_MS,
  });
  const runStatus = run.data?.status;
  const finished = runId !== null && runStatus !== undefined && !isActive(runStatus);
  // Derived during render: a cleaning that just succeeded opens its quarantine once.
  const [shownRun, setShownRun] = useState<string | null>(null);
  if (finished && runStatus === "succeeded" && shownRun !== runId) {
    setShownRun(runId);
    setView("quarantine");
  }
  useEffect(() => {
    if (finished) refresh();
    // refresh is stable enough: it only reads ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, runId]);

  if (review.isPending || source.isPending || plan.isPending) return <ScreenSkeleton />;
  const failure = review.error ?? source.error ?? plan.error;
  if (failure || !source.data) {
    return (
      <ScreenBody>
        <ScreenError error={failure} onRetry={() => void review.refetch()} />
      </ScreenBody>
    );
  }
  if (!review.data || !plan.data) {
    return (
      <ScreenBody>
        <ScreenHeader title={`Plan de nettoyage de ${source.data.name}`} />
        <EmptyState
          icon={Broom}
          title="Plan en préparation"
          description="Forja propose un plan dès que le profilage du fichier est terminé."
        />
      </ScreenBody>
    );
  }

  const data = review.data;
  const currentPlan = plan.data;
  const counts = countRules(data.rules);
  const draft = data.status === "draft";
  const high = highConfidencePending(data.rules);
  const visible = data.rules
    .map((rule, index) => ({ rule, label: ruleLabel(index) }))
    .filter(({ rule }) => matchesRuleFilter(filter, rule));

  const validateHigh = () => {
    const order = Object.fromEntries(high.map((rule, i) => [rule.id, i * BULK_STAGGER_MS]));
    setStagger(order);
    decide.mutate(Object.fromEntries(high.map((rule) => [rule.id, "validated" as const])));
    window.setTimeout(() => setStagger({}), high.length * BULK_STAGGER_MS + 600);
  };

  return (
    <ScreenBody testId="plan-review" className="pb-28">
      <div className="flex flex-wrap items-end gap-6">
        <ScreenHeader
          eyebrow={`Nettoyage · ${source.data.original_filename}`}
          title={`Plan de nettoyage de ${source.data.name}`}
          subtitle={`Forja a analysé ${plural(source.data.row_count, "ligne", "lignes")} et propose ${plural(
            counts.all,
            "règle",
            "règles",
          )}. Rien n’est appliqué avant votre validation.`}
        />
        <DecisionMeter review={data} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <SourceProfile profile={profile.data ?? null} loading={profile.isPending} />

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<View>
              label="Vue du plan"
              value={view}
              onValueChange={setView}
              options={[
                { value: "rules", label: "Règles" },
                { value: "versions", label: "Versions" },
                { value: "quarantine", label: "Quarantaine" },
              ]}
            />
            {view === "rules" ? (
              <Segmented<RuleFilter>
                label="Filtrer les règles"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: "all", label: `Toutes ${counts.all}` },
                  { value: "pending", label: `À revoir ${counts.pending}` },
                  { value: "validated", label: `Validées ${counts.validated}` },
                  { value: "rejected", label: `Rejetées ${counts.rejected}` },
                ]}
              />
            ) : null}
            <span className="ml-auto flex items-center gap-2 text-ui text-tx3">
              Version {data.plan_version}
              <StatusBadge
                kind={PLAN_STATUS[data.status as TransformationPlan["status"]].kind}
                label={PLAN_STATUS[data.status as TransformationPlan["status"]].label}
                size={12.5}
              />
            </span>
          </div>

          {view === "rules" ? (
            <>
              {draft ? (
                <BulkBanner
                  pending={counts.pending}
                  high={high.map((r) => r.title.toLowerCase())}
                  busy={decide.isPending}
                  onValidate={validateHigh}
                />
              ) : null}
              <div className="flex flex-col gap-3" data-testid="rule-list">
                <AnimatePresence initial={false}>
                  {visible.map(({ rule, label }) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      label={label}
                      badge={ruleBadge(rule, currentPlan.status)}
                      examples={ruleExamples(rule, samples.data)}
                      summary={ruleSummary(rule, samples.data)}
                      examplesLoading={samples.isPending}
                      params={ruleParams(rule, currentPlan)}
                      decidable={draft}
                      delay={stagger[rule.id] ?? 0}
                      busy={decide.isPending}
                      onDecide={(decision) => decide.mutate({ [rule.id]: decision })}
                      onEdit={(values: Partial<Record<ParamKind, string>>) =>
                        edit(paramsPatch(rule, values))
                      }
                    />
                  ))}
                </AnimatePresence>
                {visible.length === 0 ? (
                  <p className="m-0 rounded-xl bg-node px-5 py-8 text-center text-ui text-tx3 shadow-sm">
                    Aucune règle dans ce filtre.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          {view === "versions" ? <PlanVersions sourceId={sourceId} /> : null}
          {view === "quarantine" ? (
            <QuarantineView
              sourceId={sourceId}
              plan={currentPlan}
              runId={run.data?.status === "succeeded" ? runId : null}
            />
          ) : null}
          <ActionBar
            review={data}
            approving={approve.isPending}
            launching={launch.isPending}
            run={run.data ?? null}
            projectId={project.id}
            onApprove={() => approve.mutate()}
            onLaunch={() => launch.mutate()}
            onQuarantine={() => setView("quarantine")}
          />
        </div>
      </div>
    </ScreenBody>
  );
}

/** « 4 sur 7 décidées » and one segment per rule (C3). */
function DecisionMeter({ review }: { review: PlanReview }) {
  const decided = review.validated + review.rejected;
  return (
    <div className="ml-auto flex flex-col items-end gap-2 pb-1" data-testid="decision-meter">
      <span className="text-ui text-tx2 tabular-nums">
        <span className="font-semibold text-tx">{decided}</span> sur {review.rules.length} décidées
      </span>
      <div className="flex flex-wrap justify-end gap-1">
        {review.rules.map((rule) => (
          <span
            key={rule.id}
            className={cn(
              "h-1.5 w-[22px] rounded-[3px] transition-[background-color,box-shadow] duration-300",
              rule.decision === "validated" && "bg-val-fg",
              rule.decision === "rejected" && "bg-edge",
              !rule.decision && "shadow-[inset_0_0_0_1px_var(--prop-bd)]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function BulkBanner({
  pending,
  high,
  busy,
  onValidate,
}: {
  pending: number;
  high: string[];
  busy: boolean;
  onValidate: () => void;
}) {
  const can = high.length > 0;
  return (
    <motion.div
      layout
      transition={springs.settle}
      data-testid="bulk-banner"
      className={cn(
        "flex items-center gap-3.5 rounded-xl py-3.5 pr-3.5 pl-[18px] transition-colors duration-300",
        can ? "bg-acc-soft" : "bg-val-bg",
      )}
    >
      <span
        className={cn(
          "flex size-8 flex-none items-center justify-center rounded-md bg-node text-[14px] font-bold shadow-sm",
          can ? "text-acc" : "text-val-fg",
        )}
      >
        {can ? high.length : <CheckCircle size={18} weight="fill" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold">
          {can
            ? `${plural(high.length, "règle", "règles")} à confiance élevée ${high.length > 1 ? "peuvent" : "peut"} être validée${high.length > 1 ? "s" : ""} ensemble`
            : "Règles à confiance élevée validées"}
        </span>
        <span className="truncate text-meta text-tx2">
          {can
            ? high.join(" · ")
            : pending
              ? `Il reste ${plural(pending, "règle", "règles")} à relire une par une.`
              : "Toutes les règles sont décidées."}
        </span>
      </div>
      {can ? (
        <Button variant="primary" size="md" loading={busy} onClick={onValidate}>
          Valider les règles à confiance élevée
        </Button>
      ) : null}
    </motion.div>
  );
}

/** Floating action bar: what remains, « Approuver le plan », then « Lancer le nettoyage ». */
function ActionBar({
  review,
  approving,
  launching,
  run,
  projectId,
  onApprove,
  onLaunch,
  onQuarantine,
}: {
  review: PlanReview;
  approving: boolean;
  launching: boolean;
  run: Job | null;
  projectId: string;
  onApprove: () => void;
  onLaunch: () => void;
  onQuarantine: () => void;
}) {
  const running = run !== null && isActive(run.status);
  const failed = run?.status === "failed";
  let message: React.ReactNode;
  let action: React.ReactNode = null;
  if (running) {
    message = (
      <span className="flex items-center gap-2">
        <Spinner size={13} className="text-run-fg" />
        Nettoyage en cours
        {run.progress?.percent != null ? ` · ${run.progress.percent} %` : ""}
      </span>
    );
    action = (
      <Button asChild variant="tonal" size="lg">
        <Link
          href={`/projects/${projectId}/runs/${run.id}`}
          className="no-underline hover:no-underline"
        >
          Suivre le run
        </Link>
      </Button>
    );
  } else if (review.status === "draft") {
    const ready = review.pending === 0;
    message = ready
      ? `${plural(review.validated, "règle validée", "règles validées")}, ${plural(review.rejected, "rejetée", "rejetées")}. Prêt à approuver.`
      : `${plural(review.pending, "règle en attente", "règles en attente")} · rien n’est appliqué avant`;
    action = (
      <Button variant="primary" size="lg" disabled={!ready} loading={approving} onClick={onApprove}>
        Approuver le plan
      </Button>
    );
  } else if (review.status === "approved") {
    message = failed
      ? "Le nettoyage a échoué : consultez le journal du run."
      : `Plan approuvé, version ${review.plan_version}. La table nettoyée reste à construire.`;
    action = (
      <Button variant="primary" size="lg" loading={launching} onClick={onLaunch}>
        <Play size={14} weight="fill" />
        Lancer le nettoyage
      </Button>
    );
  } else {
    message =
      run?.status === "succeeded"
        ? `Nettoyage terminé : ${plural(run.metrics?.rows_valid ?? 0, "ligne valide", "lignes valides")}, ${plural(run.metrics?.rows_rejected ?? 0, "en quarantaine", "en quarantaine")}.`
        : `Plan appliqué, version ${review.plan_version}. Modifiez une règle pour proposer une nouvelle version.`;
    action = (
      <>
        <Button variant="tonal" size="lg" onClick={onQuarantine}>
          <ShieldWarning size={17} />
          Quarantaine
        </Button>
        <Button variant="secondary" size="lg" loading={launching} onClick={onLaunch}>
          <Play size={14} weight="fill" />
          Relancer le nettoyage
        </Button>
      </>
    );
  }
  return (
    <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-center">
      <motion.div
        layout
        transition={springs.sheet}
        role="region"
        aria-label="Décision sur le plan"
        data-testid="action-bar"
        className="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl py-2.5 pr-2.5 pl-5 shadow-float material-glass"
      >
        <span className="text-ui text-tx2 tabular-nums">{message}</span>
        <span className="flex flex-none gap-2">{action}</span>
      </motion.div>
    </div>
  );
}

/** Left column of C3: quality, fill rate of each column, personal data. */
function SourceProfile({ profile, loading }: { profile: ProfileReport | null; loading: boolean }) {
  if (loading) return <Card className="h-[520px] animate-pulse" />;
  if (!profile) return null;
  const personal = new Set(personalColumns(profile));
  return (
    <div className="flex flex-col gap-4 xl:sticky xl:top-2">
      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <div className="text-[13px] font-semibold text-tx3">Qualité de la source</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[36px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
            {formatDecimal(profile.quality.score)}
          </span>
          <span className="text-tx3">/100</span>
        </div>
        {qualityComponents(profile).map((component) => (
          <div
            key={component.name}
            title={component.details}
            className="grid grid-cols-[86px_1fr_30px] items-center gap-2 text-[13px]"
          >
            <span className="text-tx2">{component.label}</span>
            <span className="flex h-1.5 overflow-hidden rounded-[3px] bg-sunk">
              <span
                className={cn("rounded-[3px]", component.value >= 85 ? "bg-val-fg" : "bg-prop-fg")}
                style={{ width: `${component.value}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{component.value}</span>
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2 px-5 py-[18px]">
        <div className="text-[13px] font-semibold text-tx3">
          {plural(profile.column_count, "colonne", "colonnes")} · taux de remplissage
        </div>
        {profile.columns.map((column) => {
          const fill = fillRate(column);
          return (
            <div key={column.name} className="grid grid-cols-[1fr_64px_44px] items-center gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[12.5px]">{column.name}</span>
                {personal.has(column.name) ? (
                  <span className="text-pii-fg" title="Donnée personnelle">
                    <HatchGlyph size={10} />
                  </span>
                ) : null}
              </span>
              <span className="flex h-1 overflow-hidden rounded-sm bg-sunk">
                <span
                  className={cn("rounded-sm", fill < 50 ? "bg-prop-fg" : "bg-tx2")}
                  style={{ width: `${fill}%` }}
                />
              </span>
              <span className="text-right text-[12.5px] text-tx2 tabular-nums">
                {formatDecimal(fill)} %
              </span>
            </div>
          );
        })}
      </Card>
      {personal.size ? (
        <div className="rounded-2xl p-1.5 hatch-pii">
          <div className="flex flex-col gap-2 rounded-xl bg-node px-4 py-3.5">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-pii-fg">
              <HatchGlyph size={12} />
              Données personnelles
            </div>
            <div className="flex flex-wrap gap-1">
              {[...personal].map((name) => (
                <span key={name} className="rounded-xs bg-sunk px-1.5 py-0.5 font-mono text-[12px]">
                  {name}
                </span>
              ))}
            </div>
            <p className="m-0 text-[12.5px] leading-normal text-tx2">
              Pseudonymisées avant toute diffusion. Les valeurs d’origine ne quittent pas ce poste.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Plan history and the comparison of two versions. */
function PlanVersions({ sourceId }: { sourceId: string }) {
  const plans = usePlans(sourceId);
  const ordered = useMemo(
    () => [...(plans.data ?? [])].sort((a, b) => b.version - a.version),
    [plans.data],
  );
  const [pair, setPair] = useState<{ from: number; to: number } | null>(null);
  if (plans.isPending) return <Card className="h-60 animate-pulse" />;
  if (plans.isError)
    return <ScreenError error={plans.error} onRetry={() => void plans.refetch()} />;
  const latest = ordered[0];
  const from = pair?.from ?? ordered[1]?.version ?? latest?.version ?? 1;
  const to = pair?.to ?? latest?.version ?? 1;
  const before = ordered.find((p) => p.version === from);
  const after = ordered.find((p) => p.version === to);
  const changes = before && after ? diffPlans(before, after) : [];
  const options = ordered.map((p) => ({ value: String(p.version), label: `Version ${p.version}` }));
  return (
    <div className="flex flex-col gap-4" data-testid="plan-versions">
      <Card className="flex flex-col">
        {ordered.map((version, index) => (
          <div
            key={version.id}
            className={cn(
              "flex items-center gap-3 px-5 py-3.5",
              index > 0 && "border-t border-sunk",
            )}
          >
            <span className="w-10 font-mono text-[13px] text-tx3">v{version.version}</span>
            <StatusBadge
              kind={PLAN_STATUS[version.status].kind}
              label={PLAN_STATUS[version.status].label}
              size={12.5}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-tx2">
              {version.summary}
            </span>
            <span className="text-[13px] whitespace-nowrap text-tx3 tabular-nums">
              {formatWhen(version.updated_at)}
            </span>
          </div>
        ))}
      </Card>
      {ordered.length > 1 ? (
        <Card className="flex flex-col gap-3 px-5 py-[18px]">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle>Comparer</SectionTitle>
            <Select value={String(from)} onValueChange={(v) => setPair({ from: Number(v), to })}>
              <SelectTrigger aria-label="Version de départ">
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
            <span className="text-tx3">→</span>
            <Select value={String(to)} onValueChange={(v) => setPair({ from, to: Number(v) })}>
              <SelectTrigger aria-label="Version d’arrivée">
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
          </div>
          {changes.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="plan-diff">
              {changes.map((change, index) => (
                <li key={index} className="flex items-baseline gap-2 text-[13.5px]">
                  {change.column ? (
                    <span className="rounded-xs bg-sunk px-1.5 py-0.5 font-mono text-[12.5px]">
                      {change.column}
                    </span>
                  ) : null}
                  <span className="text-tx2">{change.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ui text-tx3">Aucune différence de règle entre ces versions.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

/** Rows rejected by the build, by reason, then the rows themselves. */
function QuarantineView({
  sourceId,
  plan,
  runId,
}: {
  sourceId: string;
  plan: TransformationPlan;
  runId: string | null;
}) {
  const [chosen, setChosen] = useState<string | null>(runId);
  const current = chosen ?? runId;
  const rejects = useRejects(sourceId, current);
  if (rejects.isPending) return <Card className="h-60 animate-pulse" />;
  if (rejects.isError) {
    return <ScreenError error={rejects.error} onRetry={() => void rejects.refetch()} />;
  }
  const data = rejects.data;
  if (data.total_rows === 0 && data.runs.length === 0) {
    return (
      <EmptyState
        icon={ShieldWarning}
        title="Aucune ligne en quarantaine"
        description="Après un nettoyage, les lignes qui échouent une règle de validité apparaissent ici avec leur motif."
      />
    );
  }
  const max = Math.max(1, ...data.reasons.map((r) => r.rows));
  const personal = plan.columns
    .filter((c) => c.pii_type && c.pii_treatment !== "none")
    .map((c) => c.target_column);
  return (
    <div className="flex flex-col gap-4" data-testid="quarantine">
      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <div className="flex flex-wrap items-center gap-2">
          <SectionTitle count={formatInteger(data.total_rows)}>Lignes en quarantaine</SectionTitle>
          {data.runs.length > 1 ? (
            <div className="ml-auto">
              <Select
                value={current ?? "all"}
                onValueChange={(v) => setChosen(v === "all" ? null : v)}
              >
                <SelectTrigger aria-label="Run">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les runs</SelectItem>
                  {data.runs.map((r) => (
                    <SelectItem key={r.run_id} value={r.run_id}>
                      {`${r.run_id.slice(0, 8)} · ${plural(r.rows, "ligne", "lignes")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {data.reasons.map((reason) => (
            <div
              key={reason.reason}
              className="grid grid-cols-[minmax(0,1fr)_160px_44px] items-center gap-3 text-[13.5px]"
            >
              <span className="truncate text-tx">{reason.reason}</span>
              <span className="flex h-1.5 overflow-hidden rounded-[3px] bg-sunk">
                <span
                  className="rounded-[3px] bg-prop-fg"
                  style={{ width: `${(reason.rows / max) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{formatInteger(reason.rows)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        <div className="px-5 pt-[18px] pb-2 text-meta text-tx3">
          {plural(data.rows.length, "ligne affichée", "lignes affichées")}, valeurs brutes, données
          personnelles traitées comme dans les exports.
        </div>
        <DataTable
          label="Lignes en quarantaine"
          columns={data.columns.filter((c) => c !== "_run_id")}
          rows={data.rows}
          personal={personal}
          maxHeight={480}
        />
      </Card>
    </div>
  );
}
