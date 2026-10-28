"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowClockwise,
  CaretRight,
  CheckCircle,
  CircleDashed,
  ClockCounterClockwise,
  Check,
  Minus,
  Play,
  Stop,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  Card,
  EmptyState,
  Figure,
  ListHead,
  ListSkeleton,
  ScreenBody,
  ScreenError,
  ScreenHeader,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatWhen, plural } from "@/lib/format";
import { springs } from "@/lib/motion";
import { keys, useSources } from "@/lib/project/queries";
import {
  RUN_POLL_MS,
  isActive,
  runKeys,
  useCancelRun,
  useProjectRuns,
  type Job,
} from "@/lib/project/use-runs";
import {
  RUN_STATUS,
  logLines,
  matchesRunFilter,
  runCode,
  runDurationClock,
  runFigures,
  runSteps,
  runTests,
  runTitle,
  runTrigger,
  type RunFilter,
  type StepState,
} from "@/lib/runs/view";

const GRID = "120px minmax(0,1fr) 104px 104px 60px";

/** /projects/[id]/runs and /runs/[runId]: the run list and the detail of one (v2 V7). */
export function RunsScreen({ runId }: { runId?: string }) {
  const { project, me } = useShell();
  const router = useRouter();
  const queryClient = useQueryClient();
  const runs = useProjectRuns(project.id);
  const sources = useSources(project.id);
  const [filter, setFilter] = useState<RunFilter>("all");
  const names = useMemo(
    () => new Map((sources.data ?? []).map((s) => [s.id, s.name])),
    [sources.data],
  );
  const launch = useMutation({
    mutationFn: async (body: Job["params"]) =>
      unwrap(
        await api.POST("/projects/{project_id}/runs", {
          params: { path: { project_id: project.id } },
          body,
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: runKeys.list(project.id) });
      router.push(`/projects/${project.id}/runs/${job.id}`, { scroll: false });
    },
    onError: (error) =>
      toast.error({
        title: "Run non lancé",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });

  const list = runs.data ?? [];
  const visible = list.filter((run) => matchesRunFilter(filter, run));
  const selectedId = runId ?? list[0]?.id ?? null;
  const active = list.filter((run) => isActive(run.status)).length;

  return (
    <ScreenBody
      testId="runs-screen"
      asideWidth={452}
      aside={
        selectedId ? (
          <RunDetail
            key={selectedId}
            runId={selectedId}
            names={names}
            meId={me.user.id}
            onRelaunch={(run) =>
              launch.mutate({ ...run.params, mart_request_id: run.params.mart_request_id ?? null })
            }
            relaunching={launch.isPending}
          />
        ) : undefined
      }
    >
      <ScreenHeader
        title="Runs"
        subtitle={
          runs.data
            ? `${plural(list.length, "run", "runs")}${active ? ` · ${active} en cours` : ""}`
            : "Historique des exécutions"
        }
        actions={
          <>
            <Segmented<RunFilter>
              label="Filtrer les runs"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "all", label: "Tous" },
                { value: "running", label: "En cours" },
                { value: "failed", label: "Échecs" },
              ]}
            />
            <Button
              variant="primary"
              size="lg"
              loading={launch.isPending}
              onClick={() =>
                launch.mutate({ type: "build_all", full_refresh: false, use_llm: false })
              }
            >
              <Play size={14} weight="fill" />
              Lancer un run
            </Button>
          </>
        }
      />
      {runs.isPending ? (
        <ListSkeleton rows={8} />
      ) : runs.isError ? (
        <ScreenError error={runs.error} onRetry={() => void runs.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwise}
          title="Aucun run pour l’instant"
          description="Un run profile, nettoie, construit ou publie les tables du projet. Lancez le premier quand les plans sont validés."
        />
      ) : (
        <Card role="table" aria-label="Runs du projet" className="overflow-x-auto">
          <div className="min-w-[620px]">
            <ListHead
              style={{ gridTemplateColumns: GRID }}
              columns={[
                "Statut",
                "Run",
                "Déclencheur",
                "Début",
                <span key="d" className="block text-right">
                  Durée
                </span>,
              ]}
            />
            {visible.length === 0 ? (
              <p className="m-0 border-t border-sunk px-5 py-8 text-center text-ui text-tx3">
                Aucun run dans ce filtre.
              </p>
            ) : null}
            {visible.map((run) => {
              const status = RUN_STATUS[run.status];
              const title = runTitle(run, names);
              return (
                <button
                  role="row"
                  type="button"
                  key={run.id}
                  data-testid={`run-row-${run.id}`}
                  aria-current={run.id === selectedId || undefined}
                  onClick={() =>
                    router.push(`/projects/${project.id}/runs/${run.id}`, { scroll: false })
                  }
                  className={cn(
                    "grid min-h-[60px] w-full items-center gap-3 border-0 border-t border-sunk px-5 text-left font-sans text-tx transition-colors duration-150",
                    run.id === selectedId ? "bg-acc-soft" : "bg-transparent hover:bg-sunk",
                  )}
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span role="cell" className="flex">
                    <StatusBadge kind={status.kind} label={status.label} size={13} />
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-medium">{title.op}</span>
                    <span className="truncate font-mono text-mono text-tx3">
                      {runCode(run)} · {title.scope}
                    </span>
                  </span>
                  <span role="cell" className="text-[14px] whitespace-nowrap text-tx2">
                    {runTrigger(run, me.user.id)}
                  </span>
                  <span role="cell" className="text-[14px] whitespace-nowrap text-tx2 tabular-nums">
                    {formatWhen(run.started_at ?? run.created_at)}
                  </span>
                  <span role="cell" className="text-right text-[14px] text-tx2 tabular-nums">
                    {runDurationClock(run)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </ScreenBody>
  );
}

const STEP_MARK: Record<StepState, { className: string; icon: React.ReactNode }> = {
  done: { className: "bg-val-bg text-val-fg", icon: <Check size={12} weight="bold" /> },
  run: { className: "bg-run-bg text-run-fg", icon: <Spinner size={11} /> },
  err: { className: "bg-err-solid text-on-err", icon: <X size={12} weight="bold" /> },
  rej: { className: "bg-sunk text-tx3", icon: <Minus size={12} weight="bold" /> },
  idle: { className: "shadow-[inset_0_0_0_1.5px_var(--edge)]", icon: null },
};

const TEST_ICON = {
  pass: <CheckCircle size={17} weight="fill" className="flex-none text-val-fg" />,
  warn: <Warning size={17} weight="fill" className="flex-none text-prop-fg" />,
  fail: <XCircle size={17} weight="fill" className="flex-none text-err-fg" />,
  wait: <CircleDashed size={17} className="flex-none text-tx3" />,
} as const;

function RunDetail({
  runId,
  names,
  meId,
  onRelaunch,
  relaunching,
}: {
  runId: string;
  names: Map<string, string>;
  meId: string;
  onRelaunch: (run: Job) => void;
  relaunching: boolean;
}) {
  const { project } = useShell();
  const [logsOpen, setLogsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cancel = useCancelRun(project.id);
  const detail = useQuery({
    queryKey: runKeys.detail(runId),
    queryFn: async (): Promise<Job> =>
      unwrap(await api.GET("/runs/{run_id}", { params: { path: { run_id: runId } } })),
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data.status) ? false : RUN_POLL_MS,
  });
  const live = detail.data ? isActive(detail.data.status) : false;
  const logs = useQuery({
    queryKey: keys.runLogs(runId),
    enabled: logsOpen,
    queryFn: async () => {
      const result = await api.GET("/runs/{run_id}/logs", {
        params: { path: { run_id: runId } },
        parseAs: "text",
      });
      return (result.data as string | undefined) ?? "";
    },
    refetchInterval: live ? RUN_POLL_MS : false,
  });

  if (detail.isPending) {
    return (
      <div className="flex flex-col gap-3 p-[22px]" aria-busy="true">
        <div className="h-6 w-40 animate-pulse rounded bg-sunk" />
        <div className="h-40 animate-pulse rounded-xl bg-sunk" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="p-[22px]">
        <ScreenError error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    );
  }
  const run = detail.data;
  const status = RUN_STATUS[run.status];
  const title = runTitle(run, names);
  const steps = runSteps(run);
  const tests = runTests(run);
  const lines = logLines(logs.data ?? "", search);
  const trigger = runTrigger(run, meId);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto p-[22px]"
      data-testid="run-detail"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] text-tx3">{runCode(run)}</span>
          <StatusBadge kind={status.kind} label={status.label} size={13} />
          {live ? (
            <Button
              variant="tonal"
              size="md"
              className="ml-auto hover:bg-err-bg hover:text-err-fg"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(run.id)}
            >
              <Stop size={15} />
              Annuler
            </Button>
          ) : run.status === "failed" || run.status === "cancelled" ? (
            <Button
              variant="secondary"
              size="md"
              className="ml-auto"
              loading={relaunching}
              onClick={() => onRelaunch(run)}
            >
              <ArrowClockwise size={15} />
              Relancer
            </Button>
          ) : null}
        </div>
        <h2 className="m-0 text-[21px] font-semibold tracking-[-0.018em]">{title.op}</h2>
        <div className="text-ui text-tx2">
          {title.scope} · {formatWhen(run.started_at ?? run.created_at).toLowerCase()} ·{" "}
          {trigger === "Vous" ? "par vous" : trigger.toLowerCase()}
        </div>
      </div>

      {run.status === "failed" && run.error ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-err-bg p-3.5" role="alert">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-err-fg">
            <WarningCircle size={18} weight="fill" />
            Le run a échoué
          </div>
          <p className="m-0 text-ui leading-normal break-words text-tx2">{run.error}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <div className="pb-1.5 text-[15px] font-semibold">Étapes</div>
        {steps.map((step, index) => (
          <motion.div
            key={`${step.name}-${index}`}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3 py-1.5"
          >
            <span
              className={cn(
                "flex size-6 flex-none items-center justify-center rounded-full",
                STEP_MARK[step.state].className,
              )}
            >
              {STEP_MARK[step.state].icon}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-[14.5px]",
                    step.state === "idle" ? "text-tx3" : "font-medium text-tx",
                  )}
                >
                  {step.name}
                </span>
                <span className="ml-auto text-meta whitespace-nowrap text-tx3 tabular-nums">
                  {step.detail}
                </span>
              </div>
              {step.state === "run" && run.progress?.percent != null ? (
                <span className="flex h-1 overflow-hidden rounded-[2px] bg-run-bg">
                  <motion.span
                    className="rounded-[2px] bg-run-fg"
                    animate={{ width: `${run.progress.percent}%` }}
                    transition={springs.settle}
                  />
                </span>
              ) : null}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2" data-testid="run-figures">
        {runFigures(run).map((figure) => (
          <Figure key={figure.label} label={figure.label} value={figure.value} tone={figure.tone} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold">Tests dbt</span>
          <span className="text-meta text-tx3">{tests.summary}</span>
        </div>
        {tests.rows.length === 0 ? (
          <div className="flex min-h-7 items-center gap-2.5 text-ui text-tx3">
            {TEST_ICON.wait}
            {live ? "Exécutés après la construction" : "Aucun test exécuté"}
          </div>
        ) : null}
        {tests.rows.slice(0, 40).map((test) => (
          <div key={test.name} className="flex min-h-7 items-center gap-2.5">
            {TEST_ICON[test.outcome]}
            <span className="min-w-0 flex-1 truncate font-mono text-mono" title={test.name}>
              {test.name}
            </span>
            <span className="text-meta whitespace-nowrap text-tx3">{test.detail}</span>
          </div>
        ))}
        {tests.rows.length > 40 ? (
          <span className="text-meta text-tx3">et {tests.rows.length - 40} autres</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setLogsOpen((open) => !open)}
          aria-expanded={logsOpen}
          className="flex items-center gap-2 border-0 bg-transparent p-0 text-left font-sans text-[15px] font-semibold text-tx"
        >
          <CaretRight
            size={15}
            className={cn(
              "text-tx3 transition-transform duration-250 ease-soft",
              logsOpen && "rotate-90",
            )}
          />
          Journal
          {logs.data ? (
            <span className="text-meta font-normal text-tx3">
              {plural(logLines(logs.data, "").length, "ligne", "lignes")}
            </span>
          ) : null}
        </button>
        {logsOpen ? (
          <>
            <Input
              variant="sunk"
              placeholder="Rechercher dans le journal"
              aria-label="Rechercher dans le journal"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <pre
              data-testid="run-logs"
              className="m-0 max-h-[420px] overflow-auto rounded-[14px] bg-sunk p-3.5 font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap text-tx2"
            >
              {logs.isPending
                ? "Chargement du journal…"
                : lines.length
                  ? lines.map((line, index) => (
                      <span
                        key={index}
                        className={cn(
                          "block",
                          line.level === "error" && "text-err-fg",
                          line.level === "warn" && "text-prop-fg",
                        )}
                      >
                        {line.text}
                      </span>
                    ))
                  : search
                    ? `Aucune ligne ne contient « ${search} ».`
                    : "Journal vide."}
            </pre>
          </>
        ) : null}
      </div>
    </div>
  );
}
