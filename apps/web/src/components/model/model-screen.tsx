"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowsClockwise,
  Calendar,
  Check,
  CheckCircle,
  CircleDashed,
  ClockCounterClockwise,
  Cloud,
  Cpu,
  Cube,
  Function as FunctionIcon,
  Hammer,
  Key,
  PencilSimple,
  Sparkle,
  Star,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  EmptyState,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  ScreenSkeleton,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { HatchGlyph, Spinner } from "@/components/ui/spinner";
import { StatusBadge, type StatusKind } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatAgo, plural } from "@/lib/format";
import {
  SCD_DESCRIPTIONS,
  additivity,
  aggregationLabel,
  goldStepIndex,
  GOLD_STEPS,
  issueTarget,
  issueTitle,
  originView,
  relationConfidence,
  relationTitle,
  scdView,
  starLayout,
  type Dimension,
} from "@/lib/model/view";
import {
  useGoldIssues,
  useGoldPlan,
  useRelations,
  useTables,
  type GoldPlan,
  type Relation,
  type ValidationIssue,
  type WarehouseTable,
} from "@/lib/project/queries";
import type { Job } from "@/lib/project/use-runs";
import { springs } from "@/lib/motion";
import { ModelEditSheet, type EditFocus } from "./model-edit";
import { ModelRelations } from "./model-relations";
import { ModelVersions } from "./model-versions";
import { useModelMutations, useModelRun, useStartRun } from "./use-model";

type View = "schema" | "relations" | "versions";
type Selection =
  { kind: "fact"; name: string } | { kind: "dimension"; name: string } | { kind: "date" };

const CARD = { width: 192, height: 146 };
const FACT_WIDTH = 256;

/** /projects/[id]/model: the star schema under review (v2 V6). */
export function ModelScreen() {
  const { project } = useShell();
  const plan = useGoldPlan(project.id);
  const relations = useRelations(project.id);
  const tables = useTables(project.id);
  const issues = useGoldIssues(project.id, Boolean(plan.data));
  const mutations = useModelMutations(project.id);
  const starts = useStartRun(project.id);
  const proposal = useModelRun(project.id, "gold_proposal");
  const build = useModelRun(project.id, "build_gold");
  const [view, setView] = useState<View>("schema");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditFocus | null>(null);

  // A proposal that ends brings its new version.
  const proposalDone = proposal.run && !proposal.active ? proposal.run.id : null;
  const buildDone = build.run && !build.active ? build.run.id : null;
  const { refresh } = mutations;
  useEffect(() => {
    if (proposalDone || buildDone) refresh();
    // refresh only reads the project id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalDone, buildDone]);

  if (plan.isPending) return <ScreenSkeleton aside />;
  if (plan.isError) {
    return (
      <ScreenBody>
        <ScreenError error={plan.error} onRetry={() => void plan.refetch()} />
      </ScreenBody>
    );
  }

  const proposeButton = (
    <Button
      variant={plan.data ? "secondary" : "primary"}
      size="lg"
      loading={starts.propose.isPending}
      disabled={proposal.active}
      onClick={() => starts.propose.mutate(true)}
    >
      <Sparkle size={17} />
      Proposer un modèle
    </Button>
  );

  if (!plan.data) {
    return (
      <ScreenBody testId="model-screen">
        <ScreenHeader title="Modèle en étoile" subtitle="Faits, dimensions et historisation" />
        {proposal.active && proposal.run ? (
          <ProposalProgress run={proposal.run} onCancel={(id) => starts.cancel.mutate(id)} />
        ) : (
          <EmptyState
            icon={Cube}
            title="Aucun modèle proposé"
            description="Forja propose un modèle en étoile à partir des tables nettoyées et des relations confirmées : grain, clés, mesures et historisation."
            action={proposeButton}
          />
        )}
      </ScreenBody>
    );
  }

  const data = plan.data;
  const live = issues.data ?? data.issues ?? [];
  const errors = live.filter((i) => i.severity === "error");
  const draft = data.status === "draft";
  const ready = draft && errors.length === 0 && !issues.isFetching;
  const fact = data.facts?.[0] ?? null;
  const dimensions = data.dimensions ?? [];
  const selected: Selection =
    selection ?? (fact ? { kind: "fact", name: fact.name } : { kind: "date" });
  const relationList = relations.data ?? [];
  const tableByName = new Map((tables.data ?? []).map((t) => [t.name, t]));

  const primary =
    data.status === "draft" ? (
      <Button
        variant="primary"
        size="lg"
        disabled={!ready}
        loading={mutations.approve.isPending}
        onClick={() => mutations.approve.mutate()}
        data-testid="validate-model"
      >
        <Check size={15} weight="bold" />
        Valider le modèle
      </Button>
    ) : (
      <Button
        variant={data.status === "approved" ? "primary" : "secondary"}
        size="lg"
        loading={starts.build.isPending || build.active}
        onClick={() => starts.build.mutate()}
        data-testid="build-model"
      >
        <Hammer size={17} />
        {build.active ? "Construction en cours" : "Construire"}
      </Button>
    );

  return (
    <ScreenBody
      testId="model-screen"
      asideWidth={372}
      aside={
        <ModelAside
          plan={data}
          issues={live}
          loadingIssues={issues.isPending}
          relations={relationList}
          selected={selected}
          highlight={highlight}
          proposal={proposal.active ? proposal.run : null}
          onHighlight={setHighlight}
          onConfirm={(id) => mutations.relation.mutate({ id, action: "confirm" })}
          onReject={(id) => mutations.relation.mutate({ id, action: "reject" })}
          onRemoveDimension={(name) =>
            mutations.patch.mutate({ dimensions: dimensions.filter((d) => d.name !== name) })
          }
          onRemoveMeasure={(factName, measure) =>
            mutations.patch.mutate({ remove_measures: { [factName]: [measure] } })
          }
          onEdit={setEditing}
          onScd={(name, scd) => mutations.patch.mutate({ dimension_scd: { [name]: scd } })}
          busy={mutations.relation.isPending || mutations.patch.isPending}
          onCancelProposal={(id) => starts.cancel.mutate(id)}
        />
      }
    >
      <ScreenHeader
        title="Modèle en étoile"
        subtitle={`Proposé ${formatAgo(data.created_at)} · ${plural(data.facts?.length ?? 0, "fait", "faits")}, ${plural(
          dimensions.length + (data.date_dimension?.enabled === false ? 0 : 1),
          "dimension",
          "dimensions",
        )} · version ${data.version}`}
        actions={
          <>
            {proposeButton}
            <Button variant="secondary" size="lg" onClick={() => setEditing({ tab: "measures" })}>
              <PencilSimple size={17} />
              Modifier
            </Button>
            {primary}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<View>
          label="Vue du modèle"
          value={view}
          onValueChange={setView}
          options={[
            { value: "schema", label: "Schéma" },
            { value: "relations", label: "Relations" },
            { value: "versions", label: "Versions" },
          ]}
        />
        <span className="ml-auto flex items-center gap-2 text-ui text-tx3">
          <StatusBadge
            kind={
              data.status === "draft"
                ? errors.length
                  ? "prop"
                  : "val"
                : data.status === "approved"
                  ? "val"
                  : "app"
            }
            label={
              data.status === "draft"
                ? errors.length
                  ? plural(errors.length, "point à résoudre", "points à résoudre")
                  : "Prêt à valider"
                : data.status === "approved"
                  ? "Validé, à construire"
                  : "Construit"
            }
            size={12.5}
          />
        </span>
      </div>
      {view === "schema" ? (
        fact ? (
          <StarSchema
            plan={data}
            issues={live}
            tables={tableByName}
            selected={selected}
            highlight={highlight}
            onSelect={setSelection}
          />
        ) : (
          <EmptyState
            icon={Star}
            title="Aucun fait dans ce modèle"
            description="Une table de faits porte les mesures. Proposez un nouveau modèle ou modifiez celui-ci."
          />
        )
      ) : null}
      {view === "relations" ? (
        <ModelRelations
          relations={relationList}
          loading={relations.isPending}
          busy={mutations.relation.isPending || mutations.declare.isPending}
          onConfirm={(id) => mutations.relation.mutate({ id, action: "confirm" })}
          onReject={(id) => mutations.relation.mutate({ id, action: "reject" })}
          onDeclare={(body) => mutations.declare.mutateAsync(body)}
        />
      ) : null}
      {view === "versions" ? <ModelVersions current={data} /> : null}
      <ModelEditSheet
        plan={data}
        focus={editing}
        onClose={() => setEditing(null)}
        saving={mutations.patch.isPending}
        onSave={async (body) => {
          await mutations.patch.mutateAsync(body);
          setEditing(null);
        }}
      />
    </ScreenBody>
  );
}

function edgeState(
  dimension: string,
  plan: GoldPlan,
  issues: ValidationIssue[],
): "app" | "prop" | "err" {
  const fact = plan.facts?.[0];
  const key = fact?.foreign_keys?.find((k) => k.dimension === dimension);
  if (!key || !fact) return "app";
  const location = `facts.${fact.name}.foreign_keys.${key.name}`;
  const issue = issues.find((i) => i.location === location);
  if (!issue) return "app";
  return issue.code === "unconfirmed_relation" ? "prop" : "err";
}

/** The star: fact at the centre, dimensions around it, links coloured by their state. */
function StarSchema({
  plan,
  issues,
  tables,
  selected,
  highlight,
  onSelect,
}: {
  plan: GoldPlan;
  issues: ValidationIssue[];
  tables: Map<string, WarehouseTable>;
  selected: Selection;
  highlight: string | null;
  onSelect: (selection: Selection) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const factCard = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(780);
  const [factHeight, setFactHeight] = useState(420);
  useLayoutEffect(() => {
    const element = box.current;
    const card = factCard.current;
    if (!element || !card) return;
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      setFactHeight(card.offsetHeight);
    });
    observer.observe(element);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);
  const fact = plan.facts![0]!;
  const withDate = plan.date_dimension?.enabled !== false;
  const nodes = [
    ...(plan.dimensions ?? []).map((d) => ({ kind: "dimension" as const, name: d.name, dim: d })),
    ...(withDate ? [{ kind: "date" as const, name: "dim_date", dim: null }] : []),
  ];
  const geometry = starLayout(nodes.length, width, { width: FACT_WIDTH, height: factHeight }, CARD);
  const positions = geometry.dimensions;
  const fx = geometry.fact.x;
  const fy = geometry.fact.y;
  const center = { x: fx + FACT_WIDTH / 2, y: fy + factHeight / 2 };
  const factRows = tables.get(fact.name)?.row_count;
  const factIssues = issues.filter((i) => i.location?.startsWith(`facts.${fact.name}`));
  const factBadge: { kind: StatusKind; label: string } =
    plan.status !== "draft"
      ? { kind: "val", label: "Validé" }
      : factIssues.some((i) => i.severity === "error")
        ? { kind: "prop", label: "À revoir" }
        : { kind: "val", label: "Prêt" };

  return (
    <div
      ref={box}
      data-testid="star-schema"
      className="relative overflow-x-auto overflow-y-hidden rounded-3xl bg-lane"
      style={{ height: geometry.height }}
    >
      <div className="relative h-full" style={{ width: geometry.width }}>
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          {nodes.map((node, index) => {
            const p = positions[index]!;
            const end = { x: p.x + CARD.width / 2, y: p.y + CARD.height / 2 };
            const state = node.kind === "date" ? "app" : edgeState(node.name, plan, issues);
            const lit = highlight === node.name;
            const dx = (end.x - center.x) * 0.5;
            return (
              <path
                key={node.name}
                d={`M${center.x},${center.y} C${center.x + dx},${center.y} ${end.x - dx},${end.y} ${end.x},${end.y}`}
                fill="none"
                style={{
                  stroke:
                    state === "prop"
                      ? "var(--prop-fg)"
                      : state === "err"
                        ? "var(--err-solid)"
                        : "var(--edge)",
                  strokeWidth: lit ? 3 : 1.8,
                  strokeDasharray: state === "prop" ? "6 6" : state === "err" ? "2 5" : "none",
                  strokeLinecap: "round",
                  transition: "stroke-width .2s",
                }}
              />
            );
          })}
        </svg>
        {nodes.map((node, index) => {
          const p = positions[index]!;
          // Halfway along the visible part of the link, between the two cards.
          const onLeft = p.x < fx;
          const mid = {
            x: onLeft ? (p.x + CARD.width + fx) / 2 : (fx + FACT_WIDTH + p.x) / 2,
            y: p.y + CARD.height / 2 - 12,
          };
          const state = node.kind === "date" ? "app" : edgeState(node.name, plan, issues);
          return (
            <span
              key={`card-${node.name}`}
              className={cn(
                "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[12.5px] font-semibold",
                state === "app" ? "text-tx3" : state === "prop" ? "text-prop-fg" : "text-err-fg",
              )}
              style={{ left: mid.x, top: mid.y }}
            >
              N:1
            </span>
          );
        })}
        {nodes.map((node, index) => {
          const p = positions[index]!;
          const isSelected =
            node.kind === "date"
              ? selected.kind === "date"
              : selected.kind === "dimension" && selected.name === node.name;
          const table = tables.get(node.name);
          return (
            <motion.button
              key={node.name}
              type="button"
              layout
              transition={springs.settle}
              onClick={() =>
                onSelect(
                  node.kind === "date" ? { kind: "date" } : { kind: "dimension", name: node.name },
                )
              }
              data-testid={`star-${node.name}`}
              className={cn(
                "absolute flex flex-col gap-2.5 rounded-xl border-0 bg-node px-4 py-3.5 text-left text-tx",
                "transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-hover",
                isSelected ? "shadow-[0_0_0_2px_var(--acc),var(--sh-node)]" : "shadow-node",
              )}
              style={{ left: p.x, top: p.y, width: CARD.width }}
            >
              <span className="flex items-center gap-2.5">
                <span className="flex size-[34px] flex-none items-center justify-center rounded-md bg-sunk text-tx2">
                  {node.kind === "date" ? (
                    <Calendar size={19} weight="duotone" />
                  ) : (
                    <Cube size={19} weight="duotone" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[14.5px] font-medium">
                  {node.name}
                </span>
                {node.dim?.attributes?.some(
                  (a) => a.pii_treatment && a.pii_treatment !== "none",
                ) ? (
                  <span className="text-pii-fg" title="Colonnes pseudonymisées">
                    <HatchGlyph size={13} />
                  </span>
                ) : null}
              </span>
              <span className="flex h-6 items-center gap-1.5 self-start rounded-full bg-sunk px-2.5 text-[12.5px] font-medium text-tx2">
                {node.kind === "date" ? (
                  <>
                    <Calendar size={14} />
                    Générée
                  </>
                ) : node.dim!.scd === "scd2" ? (
                  <>
                    <ClockCounterClockwise size={14} />
                    SCD2, historisée
                  </>
                ) : (
                  <>
                    <ArrowsClockwise size={14} />
                    SCD1, écrasée
                  </>
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="truncate font-mono text-[12.5px] text-tx2">
                  {node.kind === "date"
                    ? "date_key ← AAAAMMJJ"
                    : `${node.dim!.surrogate_key} ← ${node.dim!.natural_key.join(", ")}`}
                </span>
                <span className="text-meta text-tx3 tabular-nums">
                  {table
                    ? `${plural(table.row_count, node.kind === "date" ? "jour" : "ligne", node.kind === "date" ? "jours" : "lignes")} · ${plural(
                        table.columns.filter((c) => !c.name.startsWith("_")).length,
                        "colonne",
                        "colonnes",
                      )}`
                    : "À construire"}
                </span>
              </span>
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          layout
          transition={springs.settle}
          onClick={() => onSelect({ kind: "fact", name: fact.name })}
          data-testid={`star-${fact.name}`}
          className={cn(
            "absolute flex flex-col gap-3.5 rounded-xl border-0 bg-node px-4 py-3.5 text-left text-tx",
            "transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-hover",
            selected.kind === "fact"
              ? "shadow-[0_0_0_2px_var(--acc),var(--sh-node)]"
              : "shadow-node",
          )}
          ref={factCard}
          style={{ left: fx, top: fy, width: FACT_WIDTH }}
        >
          <span className="flex items-center gap-2.5">
            <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-acc-soft text-acc-tx">
              <Star size={21} weight="duotone" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-[15.5px] font-medium">{fact.name}</span>
              <span className="text-meta text-tx3 tabular-nums">
                {factRows != null ? plural(factRows, "ligne", "lignes") : "À construire"}
              </span>
            </span>
            <StatusBadge kind={factBadge.kind} label={factBadge.label} size={12.5} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12.5px] font-semibold text-tx3">Grain</span>
            <span className="text-[14px]">
              {fact.grain_description || `Une ligne par ${fact.grain.join(", ")}`}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-tx3">Clés</span>
            {(fact.foreign_keys ?? []).map((key) => {
              const state = edgeState(key.dimension, plan, issues);
              return (
                <span key={key.name} className="flex items-center gap-2 text-[13px]">
                  {state === "app" ? (
                    <CheckCircle size={16} className="flex-none text-tx3" />
                  ) : state === "prop" ? (
                    <CircleDashed size={16} className="flex-none text-prop-fg" />
                  ) : (
                    <WarningCircle size={16} weight="fill" className="flex-none text-err-fg" />
                  )}
                  <span className="font-mono">{key.name}</span>
                  <span className="ml-auto font-mono text-[12.5px] text-tx3">{key.dimension}</span>
                </span>
              );
            })}
            {(fact.date_keys ?? []).map((key) => (
              <span key={key.name} className="flex items-center gap-2 text-[13px]">
                <CheckCircle size={16} className="flex-none text-tx3" />
                <span className="font-mono">{key.name}</span>
                <span className="ml-auto font-mono text-[12.5px] text-tx3">dim_date</span>
              </span>
            ))}
            {(fact.degenerate_dimensions ?? []).map((key) => (
              <span key={key.name} className="flex items-center gap-2 text-[13px]">
                <Key size={16} className="flex-none text-tx3" />
                <span className="font-mono">{key.name}</span>
                <span className="ml-auto font-mono text-[12.5px] text-tx3">dégénérée</span>
              </span>
            ))}
            <span className="pt-0.5 text-[12px] text-tx3">
              Sans correspondance : membre inconnu (clé -1)
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-tx3">Mesures</span>
            {(fact.measures ?? []).map((measure) => (
              <span key={measure.name} className="flex items-baseline gap-2 text-[14px]">
                <span className="font-medium">{measure.name}</span>
                <span className="ml-auto text-[13px] whitespace-nowrap text-tx3">
                  {aggregationLabel(measure.aggregation)}
                </span>
              </span>
            ))}
          </span>
        </motion.button>
      </div>
    </div>
  );
}

function ProposalProgress({ run, onCancel }: { run: Job; onCancel: (id: string) => void }) {
  const current = goldStepIndex(run.progress?.step);
  return (
    <div
      data-testid="proposal-progress"
      className="flex flex-col gap-3 rounded-2xl bg-node px-4 py-3.5 shadow-node"
    >
      <div className="flex items-center gap-2">
        <Spinner size={13} className="text-run-fg" />
        <span className="text-[14.5px] font-semibold">Proposition du modèle</span>
        <span className="ml-auto text-meta text-tx3 tabular-nums">
          {run.progress?.percent ?? 0} %
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {GOLD_STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={step.step}
              className={cn(
                "flex items-center gap-2.5 text-[13.5px]",
                !done && !active && "text-tx3",
              )}
            >
              <span
                className={cn(
                  "flex size-[22px] flex-none items-center justify-center rounded-full",
                  done && "bg-val-bg text-val-fg",
                  active && "bg-run-bg text-run-fg",
                  !done && !active && "shadow-[inset_0_0_0_1.5px_var(--edge)]",
                )}
              >
                {done ? <Check size={11} weight="bold" /> : active ? <Spinner size={10} /> : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      {run.progress?.message ? (
        <p className="m-0 text-meta text-tx3">{run.progress.message}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="text-meta text-tx3">
          Vous pouvez quitter cet écran : une notification arrive à la fin.
        </span>
        <Button variant="quiet" size="sm" className="ml-auto" onClick={() => onCancel(run.id)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function ModelAside({
  plan,
  issues,
  loadingIssues,
  relations,
  selected,
  highlight,
  proposal,
  busy,
  onHighlight,
  onConfirm,
  onReject,
  onRemoveDimension,
  onRemoveMeasure,
  onEdit,
  onScd,
  onCancelProposal,
}: {
  plan: GoldPlan;
  issues: ValidationIssue[];
  loadingIssues: boolean;
  relations: Relation[];
  selected: Selection;
  highlight: string | null;
  proposal: Job | null;
  busy: boolean;
  onHighlight: (name: string | null) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onRemoveDimension: (name: string) => void;
  onRemoveMeasure: (fact: string, measure: string) => void;
  onEdit: (focus: EditFocus) => void;
  onScd: (dimension: string, scd: "scd1" | "scd2") => void;
  onCancelProposal: (id: string) => void;
}) {
  const open = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const linked = new Set<string>();
  const items = [...open, ...warnings].map((issue) => {
    const target = issueTarget(issue, plan, relations);
    if (target?.kind === "relation") linked.add(target.relation.id);
    return { issue, target };
  });
  const suggested = relations.filter((r) => r.status === "suggested" && !linked.has(r.id));
  const origin = originView(plan.origin);
  const fact =
    plan.facts?.find((f) => selected.kind === "fact" && f.name === selected.name) ?? null;
  const dimension =
    selected.kind === "dimension"
      ? (plan.dimensions?.find((d) => d.name === selected.name) ?? null)
      : null;

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-5"
        data-testid="model-aside"
      >
        {proposal ? <ProposalProgress run={proposal} onCancel={onCancelProposal} /> : null}
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 text-section font-semibold">À résoudre</h2>
          <span className="text-[14px] text-tx3 tabular-nums">
            {open.length + suggested.length}
          </span>
        </div>
        {loadingIssues ? <div className="h-24 animate-pulse rounded-xl bg-sunk" /> : null}
        {!loadingIssues && items.length === 0 && suggested.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-val-bg px-4 py-3 text-[13.5px] text-val-fg">
            <CheckCircle size={18} weight="fill" />
            Rien à résoudre : le modèle peut être validé.
          </div>
        ) : null}
        {items.map(({ issue, target }, index) => {
          const relation = target?.kind === "relation" ? target.relation : null;
          const dimensionName =
            target?.kind === "dimension"
              ? target.dimension
              : relation
                ? (plan.dimensions?.find((d) => d.source === relation.to_source)?.name ?? null)
                : null;
          return (
            <div
              key={`${issue.code}-${issue.location}-${index}`}
              data-testid={`issue-${issue.code}`}
              onMouseEnter={() => onHighlight(dimensionName)}
              onMouseLeave={() => onHighlight(null)}
              className={cn(
                "flex flex-col gap-2 rounded-xl bg-node px-4 py-3.5 transition-shadow duration-200",
                highlight && highlight === dimensionName
                  ? issue.code === "unconfirmed_relation"
                    ? "shadow-[0_0_0_1.5px_var(--prop-fg),var(--sh-node)]"
                    : "shadow-[0_0_0_1.5px_var(--err-solid),var(--sh-node)]"
                  : "shadow-node",
              )}
            >
              <div className="flex items-center gap-2">
                <StatusBadge
                  kind={
                    issue.severity === "error"
                      ? issue.code === "unconfirmed_relation"
                        ? "warn"
                        : "err"
                      : "warn"
                  }
                  label={issueTitle(issue)}
                  size={12.5}
                />
                <span className="ml-auto text-[12.5px] text-tx3">
                  {relation
                    ? `Heuristique · ${relationConfidence(relation)}`
                    : "Contrôle automatique"}
                </span>
              </div>
              {relation ? (
                <div className="text-[14.5px] leading-snug font-semibold">
                  Relation {relationTitle(relation)}
                </div>
              ) : null}
              <p className="m-0 text-[13.5px] leading-[1.55] text-pretty text-tx2">
                {relation ? relation.explanation : issue.message}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {relation && relation.status !== "confirmed" ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      disabled={busy}
                      onClick={() => onConfirm(relation.id)}
                    >
                      Confirmer la relation
                    </Button>
                    <Button
                      variant="tonal"
                      size="md"
                      disabled={busy}
                      onClick={() => onReject(relation.id)}
                    >
                      Rejeter
                    </Button>
                  </>
                ) : target?.kind === "measure" ? (
                  <>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => onEdit({ tab: "measures", measure: target.measure })}
                    >
                      Modifier la mesure
                    </Button>
                    <Button
                      variant="tonal"
                      size="md"
                      disabled={busy}
                      onClick={() => onRemoveMeasure(target.fact, target.measure)}
                    >
                      Retirer la mesure
                    </Button>
                  </>
                ) : target?.kind === "dimension" && issue.code === "orphan_dimension" ? (
                  <Button
                    variant="primary"
                    size="md"
                    disabled={busy}
                    onClick={() => onRemoveDimension(target.dimension)}
                  >
                    Retirer la dimension
                  </Button>
                ) : (
                  <Button variant="tonal" size="md" onClick={() => onEdit({ tab: "measures" })}>
                    Modifier le modèle
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {suggested.map((relation) => (
          <div
            key={relation.id}
            className="flex flex-col gap-2 rounded-xl bg-node px-4 py-3.5 shadow-node"
            data-testid="suggested-relation"
          >
            <div className="flex items-center gap-2">
              <StatusBadge kind="warn" label="À confirmer" size={12.5} />
              <span className="ml-auto text-[12.5px] text-tx3">
                Heuristique · {relationConfidence(relation)}
              </span>
            </div>
            <div className="text-[14.5px] leading-snug font-semibold">
              Relation {relationTitle(relation)}
            </div>
            <p className="m-0 text-[13.5px] leading-[1.55] text-tx2">{relation.explanation}</p>
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                size="md"
                disabled={busy}
                onClick={() => onConfirm(relation.id)}
              >
                Confirmer la relation
              </Button>
              <Button
                variant="tonal"
                size="md"
                disabled={busy}
                onClick={() => onReject(relation.id)}
              >
                Rejeter
              </Button>
            </div>
          </div>
        ))}

        <div className="h-1.5" />
        {fact ? (
          <>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-section font-semibold">Mesures de {fact.name}</h2>
              <Button
                variant="link"
                size="md"
                className="ml-auto"
                onClick={() => onEdit({ tab: "measures" })}
              >
                Modifier
              </Button>
            </div>
            {(fact.measures ?? []).map((measure) => (
              <div
                key={measure.name}
                className="flex flex-col gap-0.5 rounded-lg bg-sunk px-3 py-2.5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-medium">{measure.name}</span>
                  <span className="ml-auto text-[13px] text-tx2">
                    {aggregationLabel(measure.aggregation)} · {additivity(measure.aggregation)}
                  </span>
                </div>
                <span className="font-mono text-[12.5px] text-tx3">{measure.expression}</span>
              </div>
            ))}
          </>
        ) : null}
        {dimension ? (
          <DimensionDetail dimension={dimension} onScd={onScd} onEdit={onEdit} busy={busy} />
        ) : null}
        {selected.kind === "date" ? (
          <>
            <h2 className="m-0 text-section font-semibold">dim_date</h2>
            <p className="m-0 text-[13.5px] leading-[1.55] text-tx2">
              Générée par Forja à partir des dates des faits : jour, semaine, mois, trimestre et
              année, jours fériés français inclus.
            </p>
          </>
        ) : null}

        <div className="h-1.5" />
        <h2 className="m-0 text-section font-semibold">Origine de la proposition</h2>
        <div className="flex items-start gap-3" data-testid="model-origin">
          <span className="flex size-[34px] flex-none items-center justify-center rounded-md bg-sunk text-tx2">
            {origin.kind === "local" ? (
              <Cpu size={18} />
            ) : origin.kind === "cloud" ? (
              <Cloud size={18} />
            ) : (
              <FunctionIcon size={18} />
            )}
          </span>
          <span className="flex flex-col gap-px">
            <span className="text-[14px] font-medium">{origin.title}</span>
            <span className="text-meta leading-[1.45] text-tx3">{origin.detail}</span>
          </span>
        </div>
        {origin.kind !== "heuristic" ? (
          <div className="flex items-start gap-3">
            <span className="flex size-[34px] flex-none items-center justify-center rounded-md bg-sunk text-tx2">
              <FunctionIcon size={18} />
            </span>
            <span className="flex flex-col gap-px">
              <span className="text-[14px] font-medium">Heuristique</span>
              <span className="text-meta leading-[1.45] text-tx3">
                Clés et relations. Noms de colonnes et taux d’inclusion des valeurs.
              </span>
            </span>
          </div>
        ) : null}
        {plan.warnings?.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-tx2">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="bg-sunk px-5 py-3.5 text-ui text-tx2" data-testid="model-footer">
        {plan.status === "approved"
          ? "Modèle validé. La construction démarre avec « Construire »."
          : plan.status === "applied"
            ? "Modèle construit. Toute modification crée une nouvelle version à valider."
            : open.length + suggested.length
              ? `${plural(open.length + suggested.length, "point", "points")} à résoudre avant validation.`
              : "Prêt. La construction démarre après validation."}
      </div>
    </>
  );
}

function DimensionDetail({
  dimension,
  onScd,
  onEdit,
  busy,
}: {
  dimension: Dimension;
  onScd: (dimension: string, scd: "scd1" | "scd2") => void;
  onEdit: (focus: EditFocus) => void;
  busy: boolean;
}) {
  const scd = (dimension.scd ?? "scd1") as "scd1" | "scd2";
  const attributes = dimension.attributes ?? [];
  return (
    <>
      <h2 className="m-0 text-section font-semibold">Historisation de {dimension.name}</h2>
      <Segmented<"scd1" | "scd2">
        label={`Historisation de ${dimension.name}`}
        value={scd}
        onValueChange={(value) => !busy && value !== scd && onScd(dimension.name, value)}
        options={[
          { value: "scd1", label: scdView("scd1").label },
          { value: "scd2", label: scdView("scd2").label },
        ]}
      />
      <p className="m-0 text-[13.5px] leading-[1.55] text-tx2">{SCD_DESCRIPTIONS[scd]}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-meta text-tx3">
          {scd === "scd2" ? "Colonnes suivies" : "Attributs"}
        </span>
        {attributes.map((attribute) => (
          <span
            key={attribute.name}
            className="rounded-xs bg-sunk px-[7px] py-0.5 font-mono text-[12.5px]"
          >
            {attribute.name}
          </span>
        ))}
        <Button
          variant="link"
          size="md"
          onClick={() => onEdit({ tab: "attributes", dimension: dimension.name })}
        >
          Modifier
        </Button>
      </div>
      <p className="m-0 text-meta text-tx3">
        Membre inconnu : une ligne de clé -1, « Inconnu », reçoit les faits sans correspondance.
      </p>
    </>
  );
}
