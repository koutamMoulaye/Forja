"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Key } from "@phosphor-icons/react";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  modelTests,
  nodeRuns,
  planColumns,
  planRules,
  profileColumns,
  runBadge,
  tableColumns,
  type ColumnView,
  type RuleView,
} from "@/lib/pipeline/inspector-data";
import {
  TYPE_LABELS,
  nodeInfo,
  nodeLook,
  type GraphEdge,
  type GraphNode,
} from "@/lib/pipeline/model";
import { JOB_TEXT, runDuration, useProjectRuns } from "@/lib/project/use-runs";
import { NodeIcon } from "./node-icon";

export type InspectorTab = "overview" | "columns" | "rules" | "quality" | "history";

export const INSPECTOR_TABS: { id: InspectorTab; label: string }[] = [
  { id: "overview", label: "Aperçu" },
  { id: "columns", label: "Colonnes" },
  { id: "rules", label: "Règles" },
  { id: "quality", label: "Qualité" },
  { id: "history", label: "Historique" },
];

export function isInspectorTab(value: string | null): value is InspectorTab {
  return INSPECTOR_TABS.some((tab) => tab.id === value);
}

const DESCRIPTIONS: Record<GraphNode["type"], string> = {
  source:
    "Fichier importé et profilé : types, valeurs vides, clés candidates et données personnelles.",
  silver: "Table nettoyée selon un plan relu règle par règle.",
  dimension: "Dimension du modèle en étoile : un axe d’analyse.",
  fact: "Table de faits : les mesures, au grain d’une ligne par événement.",
  date_dimension: "Dimension date générée par Forja à partir des dates des faits.",
  mart: "Construit à partir d’une question en français.",
  destination: "Destination de publication.",
};

const card = "rounded-lg bg-node shadow-sm";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="pt-1 text-meta font-semibold text-tx3">{children}</div>;
}

function Loading() {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[58px] rounded-lg" />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[13.5px] text-tx3">{children}</div>;
}

function LinkedNode({ node, onSelect }: { node: GraphNode; onSelect: (id: string) => void }) {
  const look = nodeLook(node);
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={cn(
        card,
        "flex items-center gap-2.5 border-0 px-3 py-2.5 text-left text-[14px] font-medium text-tx transition-shadow hover:shadow-hover",
      )}
    >
      <NodeIcon node={node} size={18} className="flex-none text-tx2" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <StatusBadge kind={look.kind} label={look.loud ? look.label : "Appliqué"} size={12.5} />
    </button>
  );
}

function Overview({
  node,
  graph,
  onSelect,
}: {
  node: GraphNode;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  onSelect: (id: string) => void;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const up = graph.edges.filter((e) => e.target === node.id).map((e) => byId.get(e.source));
  const down = graph.edges.filter((e) => e.source === node.id).map((e) => byId.get(e.target));
  const stats = [
    node.counts.rows != null && { k: "Lignes", v: node.counts.rows.toLocaleString("fr-FR") },
    node.counts.columns != null && { k: "Colonnes", v: String(node.counts.columns) },
    node.counts.rules != null && { k: "Règles", v: String(node.counts.rules) },
    node.counts.tables != null && { k: "Tables publiées", v: String(node.counts.tables) },
    node.quality_score != null && {
      k: "Qualité",
      v: `${String(node.quality_score).replace(".", ",")} / 100`,
    },
    { k: "Type", v: TYPE_LABELS[node.type] },
  ].filter((s): s is { k: string; v: string } => Boolean(s));
  return (
    <>
      <p className="m-0 text-[14px] leading-[1.55] text-pretty text-tx2">
        {node.message ? `${node.message}. ` : ""}
        {DESCRIPTIONS[node.type]}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {stats.slice(0, 4).map((stat) => (
          <div key={stat.k} className={cn(card, "px-3 py-2.5")}>
            <div className="text-[12.5px] text-tx3">{stat.k}</div>
            <div className="text-[15px] font-semibold tabular-nums">{stat.v}</div>
          </div>
        ))}
      </div>
      <SectionTitle>En amont</SectionTitle>
      {up.length ? (
        up.map((n) => n && <LinkedNode key={n.id} node={n} onSelect={onSelect} />)
      ) : (
        <Empty>Point d’entrée du pipeline.</Empty>
      )}
      <SectionTitle>En aval</SectionTitle>
      {down.length ? (
        down.map((n) => n && <LinkedNode key={n.id} node={n} onSelect={onSelect} />)
      ) : (
        <Empty>Fin de la lignée.</Empty>
      )}
    </>
  );
}

function ColumnList({ columns, summary }: { columns: ColumnView[]; summary?: string }) {
  const keys = columns.filter((c) => c.key).length;
  const personal = columns.filter((c) => c.pii).length;
  return (
    <>
      <div className="text-[13.5px] text-tx3">
        {summary ??
          `${columns.length} colonnes${keys ? `, dont ${keys} clé${keys > 1 ? "s" : ""}` : ""}${
            personal ? ` et ${personal} pseudonymisée${personal > 1 ? "s" : ""}` : ""
          }`}
      </div>
      {personal ? (
        <div className="rounded-lg p-1.5 hatch-pii">
          <div className="rounded-[9px] bg-node px-3 py-2.5 text-[13.5px] leading-normal text-tx2">
            <span className="font-semibold text-pii-fg">
              {personal} colonne{personal > 1 ? "s" : ""} de données personnelles
            </span>{" "}
            pseudonymisée{personal > 1 ? "s" : ""} dans la base de diffusion et les exports ; les
            valeurs d’origine restent sur ce poste.
          </div>
        </div>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {columns.map((column) => (
          <li
            key={column.name}
            className={cn("flex gap-3 rounded-lg bg-node px-3 py-[11px]")}
            style={{
              boxShadow: column.pii ? "inset 3px 0 0 var(--pii-fg), var(--sh-sm)" : "var(--sh-sm)",
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-[7px]">
                <span className="truncate font-mono text-[13px] font-medium text-tx">
                  {column.name}
                </span>
                {column.key ? (
                  <Key size={14} weight="fill" className="flex-none text-tx3" aria-label="Clé" />
                ) : null}
              </div>
              {column.description ? (
                <div className="text-meta text-tx3">{column.description}</div>
              ) : null}
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              {column.pii ? <StatusBadge kind="pii" label="Pseudonymisé" size={12} /> : null}
              <span className="text-[12.5px] text-tx3">{column.type}</span>
              {column.example ? (
                <span
                  className={cn(
                    "max-w-[120px] truncate rounded-[5px] font-mono text-[12.5px]",
                    column.pii ? "px-1.5 py-px text-pii-fg hatch-pii" : "text-tx3",
                  )}
                >
                  {column.example}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function RuleList({ intro, rules }: { intro: string; rules: RuleView[] }) {
  return (
    <>
      <p className="m-0 text-[14px] leading-[1.55] text-tx2">{intro}</p>
      {rules.length ? (
        rules.map((rule) => (
          <div key={rule.id} className={cn(card, "flex items-center gap-2.5 px-3 py-[11px]")}>
            <span className="font-mono text-[12.5px] text-tx3">{rule.id}</span>
            <span className="flex-1 text-[14px] font-medium">{rule.title}</span>
            <StatusBadge kind={rule.kind} label={rule.label} size={12.5} />
          </div>
        ))
      ) : (
        <Empty>Aucune règle.</Empty>
      )}
    </>
  );
}

function Score({ value }: { value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[40px] font-semibold tracking-[-0.035em] tabular-nums">
        {String(Math.round(value * 10) / 10).replace(".", ",")}
      </span>
      <span className="text-tx3">/100</span>
    </div>
  );
}

function Bars({ bars }: { bars: { k: string; v: number }[] }) {
  return bars.map((bar) => (
    <div key={bar.k} className="grid grid-cols-[100px_1fr_34px] items-center gap-2.5 text-[13.5px]">
      <span className="truncate text-tx2">{bar.k}</span>
      <span className="flex h-1.5 overflow-hidden rounded-[3px] bg-sunk">
        <span
          className={cn("rounded-[3px]", bar.v >= 85 ? "bg-val-fg" : "bg-prop-fg")}
          style={{ width: `${Math.max(0, Math.min(100, bar.v))}%` }}
        />
      </span>
      <span className="text-right tabular-nums">{Math.round(bar.v)}</span>
    </div>
  ));
}

function Checks({
  checks,
}: {
  checks: { kind: "val" | "warn" | "err"; label: string; text: string }[];
}) {
  if (!checks.length) return <Empty>Aucun contrôle enregistré pour l’instant.</Empty>;
  return checks.map((check, index) => (
    <div key={index} className="flex items-center gap-2.5 text-[14px]">
      <StatusBadge kind={check.kind} label={check.label} size={13} />
      <span className="min-w-0 truncate">{check.text}</span>
    </div>
  ));
}

function useNodeDetails(node: GraphNode, tab: InspectorTab, upstreamSource: string | null) {
  const sourceId = node.type === "source" || node.type === "silver" ? node.ref : upstreamSource;
  const profile = useQuery({
    queryKey: ["profile", node.ref],
    enabled: node.type === "source" && !!node.ref && tab !== "overview" && tab !== "history",
    queryFn: async () =>
      unwrap(
        await api.GET("/sources/{source_id}/profile", {
          params: { path: { source_id: node.ref! } },
        }),
      ),
  });
  const plan = useQuery({
    queryKey: ["plan", sourceId],
    enabled: !!sourceId && (tab === "rules" || (node.type === "silver" && tab !== "overview")),
    queryFn: async () =>
      unwrap(
        await api.GET("/sources/{source_id}/plan", { params: { path: { source_id: sourceId! } } }),
      ),
  });
  const gold = node.type === "dimension" || node.type === "fact" || node.type === "date_dimension";
  const table = useQuery({
    queryKey: ["table", node.ref],
    enabled: gold && !!node.ref && tab === "columns",
    queryFn: async () =>
      unwrap(await api.GET("/tables/{table_id}", { params: { path: { table_id: node.ref! } } })),
  });
  const mart = useQuery({
    queryKey: ["mart", node.ref],
    enabled: node.type === "mart" && !!node.ref && tab !== "overview",
    queryFn: async () =>
      unwrap(
        await api.GET("/mart-requests/{mart_id}", { params: { path: { mart_id: node.ref! } } }),
      ),
  });
  return { profile, plan, table, mart };
}

function TabContent({
  node,
  tab,
  graph,
  projectId,
  onSelect,
}: {
  node: GraphNode;
  tab: InspectorTab;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  projectId: string;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const upstreamSilver = graph.edges
    .filter((e) => e.target === node.id)
    .map((e) => byId.get(e.source))
    .find((n) => n?.type === "silver");
  const { profile, plan, table, mart } = useNodeDetails(node, tab, upstreamSilver?.ref ?? null);
  const runs = useProjectRuns(projectId);
  const history = nodeRuns(node, runs.data ?? []);
  const lastBuild = history.find((run) => run.status === "succeeded" || run.status === "failed");

  if (tab === "overview") return <Overview node={node} graph={graph} onSelect={onSelect} />;

  if (tab === "history") {
    if (runs.isPending) return <Loading />;
    if (!history.length) return <Empty>Aucun run n’a encore touché ce nœud.</Empty>;
    return history.slice(0, 8).map((run) => {
      const badge = runBadge(run);
      const when = new Date(run.created_at).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      });
      const duration = runDuration(run);
      return (
        <div key={run.id} className={cn(card, "flex gap-3 px-3 py-[11px]")}>
          <span className="pt-0.5 font-mono text-[12.5px] text-tx3">{run.id.slice(0, 6)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{JOB_TEXT[run.type].label}</div>
            <div className="text-meta text-tx3">
              {when}
              {duration ? ` · ${duration}` : ""}
            </div>
          </div>
          <StatusBadge kind={badge.kind} label={badge.label} size={12.5} />
        </div>
      );
    });
  }

  if (tab === "columns") {
    if (node.type === "source") {
      if (!profile.data) return profile.isError ? <Empty>Profil indisponible.</Empty> : <Loading />;
      return <ColumnList columns={profileColumns(profile.data)} />;
    }
    if (node.type === "silver") {
      if (!plan.data) return plan.isError ? <Empty>Plan indisponible.</Empty> : <Loading />;
      return <ColumnList columns={planColumns(plan.data)} />;
    }
    if (node.type === "mart") {
      if (!mart.data) return <Loading />;
      const latest = (mart.data.iterations ?? []).at(-1);
      const columns = mart.data.model_columns?.length
        ? mart.data.model_columns
        : (latest?.preview?.columns ?? []);
      return (
        <ColumnList
          columns={columns.map((c) => ({
            name: c.name,
            type: c.kind === "metric" ? "mesure" : "axe",
            description: c.label,
            example: null,
            key: false,
            pii: Boolean(c.pii),
          }))}
        />
      );
    }
    if (node.type === "destination") {
      return (
        <ColumnList
          summary={`${node.counts.tables ?? 0} tables`}
          columns={node.highlights.map((name) => ({
            name,
            type: "table",
            description: "",
            example: null,
            key: false,
            pii: false,
          }))}
        />
      );
    }
    if (!node.ref) return <Empty>Table pas encore construite.</Empty>;
    if (!table.data) return <Loading />;
    return <ColumnList columns={tableColumns(table.data.columns, node.pii_columns ?? [])} />;
  }

  if (tab === "rules") {
    if (node.type === "mart") {
      if (!mart.data) return <Loading />;
      const controls = (mart.data.iterations ?? []).at(-1)?.preview?.controls ?? [];
      return (
        <RuleList
          intro="Contrôles de réconciliation de l’aperçu de vérification."
          rules={controls.map((c, index) => ({
            id: `C-${String(index + 1).padStart(2, "0")}`,
            title: c.message,
            kind: c.status === "error" ? "err" : c.status === "warning" ? "warn" : "val",
            label:
              c.status === "error" ? "Échec" : c.status === "warning" ? "À surveiller" : "Réussi",
          }))}
        />
      );
    }
    if (node.type === "destination") {
      return <Empty>Les données personnelles y sont pseudonymisées (HMAC-SHA256).</Empty>;
    }
    if (!plan.data) {
      return plan.isError ||
        !(node.type === "source" || node.type === "silver" || upstreamSilver) ? (
        <Empty>Aucun plan de nettoyage pour ce nœud.</Empty>
      ) : (
        <Loading />
      );
    }
    const source =
      node.type === "source" || node.type === "silver" ? node.name : upstreamSilver!.name;
    const status =
      plan.data.status === "draft"
        ? "en attente de revue"
        : plan.data.status === "approved"
          ? "validée, à construire"
          : "appliquée";
    return (
      <RuleList
        intro={`${node.type === "silver" ? "Plan" : `Hérite du plan`} de nettoyage de ${source}, version ${plan.data.version} ${status}.`}
        rules={planRules(plan.data)}
      />
    );
  }

  // Quality
  if (node.type === "source") {
    if (!profile.data) return <Loading />;
    const quality = profile.data.quality;
    return (
      <>
        <Score value={quality.score} />
        <Bars bars={quality.components.map((c) => ({ k: c.name, v: c.score }))} />
        <Checks
          checks={(quality.issues ?? []).map((issue) => ({
            kind: "warn",
            label: "À surveiller",
            text: issue,
          }))}
        />
      </>
    );
  }
  if (node.type === "mart") {
    if (!mart.data) return <Loading />;
    const controls = (mart.data.iterations ?? []).at(-1)?.preview?.controls ?? [];
    return (
      <Checks
        checks={controls.map((c) => ({
          kind: c.status === "error" ? "err" : c.status === "warning" ? "warn" : "val",
          label:
            c.status === "error" ? "Échec" : c.status === "warning" ? "À surveiller" : "Réussi",
          text: c.message,
        }))}
      />
    );
  }
  const tests = modelTests(lastBuild, node.id);
  const passed = tests.filter((t) => t.status === "pass").length;
  return (
    <>
      {tests.length ? <Score value={(100 * passed) / tests.length} /> : null}
      <Checks
        checks={tests.map((test) => ({
          kind: test.status === "pass" ? "val" : test.status === "warn" ? "warn" : "err",
          label:
            test.status === "pass" ? "Réussi" : test.status === "warn" ? "À surveiller" : "Échec",
          text: test.name,
        }))}
      />
    </>
  );
}

export function Inspector({
  node,
  tab,
  graph,
  projectId,
  onTab,
  onClose,
  onSelect,
  onOpen,
}: {
  node: GraphNode | null;
  tab: InspectorTab;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  projectId: string;
  onTab: (tab: InspectorTab) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onOpen: (node: GraphNode) => void;
}) {
  const look = node ? nodeLook(node) : null;
  const review = node?.state === "review" || node?.state === "proposed";
  // Closed, the inspector hands the focus back to its node on the canvas.
  const lastNode = useRef<string | null>(null);
  useEffect(() => {
    if (node) lastNode.current = node.id;
  }, [node]);
  return (
    <Sheet open={node !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        inline
        aria-describedby={undefined}
        data-testid="inspector"
        className="top-[68px] right-3 bottom-3 rounded-[20px] material-glass"
        onEscapeKeyDown={onClose}
        // Opened from the canvas, the focus stays on the node: the arrows keep walking.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const id = lastNode.current;
          if (id) {
            document
              .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
              ?.focus();
          }
        }}
      >
        {node && look ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <span className="flex size-[42px] flex-none items-center justify-center rounded-lg bg-acc-soft text-acc-tx">
                  <NodeIcon node={node} size={22} weight="duotone" />
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-[18px] tracking-[-0.015em]">{node.name}</SheetTitle>
                  <SheetDescription>
                    {TYPE_LABELS[node.type]}
                    {nodeInfo(node) ? ` · ${nodeInfo(node)}` : ""}
                  </SheetDescription>
                </div>
                <SheetCloseButton />
              </div>
              <div className="flex min-h-8 flex-wrap items-center gap-2">
                <StatusBadge
                  kind={look.kind}
                  label={look.loud ? look.label : "Appliqué"}
                  size={12.5}
                />
                {node.pii_count > 0 ? (
                  <StatusBadge
                    kind="pii"
                    label={`${node.pii_count} colonne${node.pii_count > 1 ? "s" : ""} pseudonymisée${node.pii_count > 1 ? "s" : ""}`}
                    size={12.5}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpen(node)}
                  className={cn(
                    "ml-auto h-8 flex-none rounded-md border-0 px-3.5 text-ui font-semibold",
                    review ? "bg-acc text-on-acc" : "bg-sunk text-tx",
                  )}
                >
                  {review ? "Revoir" : "Ouvrir"}
                </button>
              </div>
              <div
                role="tablist"
                aria-label="Sections de l’inspecteur"
                className="flex rounded-[11px] bg-sunk p-[3px]"
              >
                {INSPECTOR_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    onClick={() => onTab(item.id)}
                    className={cn(
                      "h-8 flex-1 rounded-sm border-0 text-meta font-medium transition-[background,box-shadow] duration-200",
                      tab === item.id ? "bg-node text-tx shadow-sm" : "bg-transparent text-tx2",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </SheetHeader>
            <SheetBody role="tabpanel">
              <TabContent
                node={node}
                tab={tab}
                graph={graph}
                projectId={projectId}
                onSelect={onSelect}
              />
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
