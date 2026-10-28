"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Broadcast,
  CaretDown,
  ChartBar,
  ChartLineUp,
  ChartPieSlice,
  Copy,
  Database,
  FileCsv,
  FolderOpen,
  Play,
} from "@phosphor-icons/react";
import {
  Card,
  EmptyState,
  ListHead,
  ListSkeleton,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  SectionTitle,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatInteger, formatWhen, plural } from "@/lib/format";
import {
  downloadFile,
  keys,
  useMartRequests,
  useTables,
  type WarehouseTable,
} from "@/lib/project/queries";
import { runKeys, useProjectRuns, isActive } from "@/lib/project/use-runs";
import {
  LAYER_LABELS,
  connectSteps,
  lastPublication,
  publishedMarts,
  servingTables,
  type LayerFilter,
  type Tool,
} from "@/lib/serving/view";

const GRID = "minmax(0,1.3fr) 64px 64px 92px 96px 204px";

/** /projects/[id]/serving: published tables, data marts, destinations and BI connection. */
export function ServingScreen() {
  const { project } = useShell();
  const queryClient = useQueryClient();
  const tables = useTables(project.id);
  const marts = useMartRequests(project.id);
  const runs = useProjectRuns(project.id);
  const [filter, setFilter] = useState<LayerFilter>("gold");
  const publication = lastPublication(runs.data ?? []);
  const publishing = (runs.data ?? []).some((r) => r.type === "export" && isActive(r.status));

  const toggle = useMutation({
    mutationFn: async ({ table, publish }: { table: WarehouseTable; publish: boolean }) =>
      unwrap(
        await api.PATCH("/tables/{table_id}", {
          params: { path: { table_id: table.id } },
          body: { publish },
        }),
      ),
    onSuccess: (table) => {
      toast.success({
        title: table.publish ? `${table.name} publiée` : `${table.name} retirée`,
        description: "Effectif à la prochaine publication de la base",
      });
      void queryClient.invalidateQueries({ queryKey: keys.tables(project.id) });
      void queryClient.invalidateQueries({ queryKey: ["graph", project.id] });
    },
    onError: (error) =>
      toast.error({
        title: "Publication non modifiée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });

  const publish = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/projects/{project_id}/runs", {
          params: { path: { project_id: project.id } },
          body: { type: "export", full_refresh: false, use_llm: false },
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(runKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: runKeys.list(project.id) });
      toast.info({ title: "Publication lancée", description: "Base serving et fichiers d’export" });
    },
    onError: (error) =>
      toast.error({
        title: "Publication non lancée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });

  const exportTable = async (table: WarehouseTable, format: "csv" | "parquet", name: string) => {
    try {
      const file = await downloadFile(
        `/tables/${table.id}/export?format=${format}`,
        `${name}.${format}`,
      );
      toast.success({
        title: `Export ${format === "csv" ? "CSV" : "Parquet"} prêt`,
        description: file,
      });
    } catch (error) {
      toast.error({
        title: "Export impossible",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
    }
  };

  const all = tables.data ?? [];
  const rows = servingTables(all, filter);
  const martRows = publishedMarts(marts.data ?? []);
  const tableById = new Map(all.map((t) => [t.id, t]));
  const published = all.filter((t) => t.publish).length;

  return (
    <ScreenBody
      testId="serving-screen"
      asideWidth={420}
      aside={<ConnectPanel path={publication?.path ?? null} />}
    >
      <ScreenHeader
        title="Diffusion"
        subtitle={
          tables.data
            ? `${plural(published, "table publiée", "tables publiées")} · ${plural(martRows.length, "data mart", "data marts")}${
                publication
                  ? ` · base publiée ${formatWhen(publication.run.finished_at ?? publication.run.created_at).toLowerCase()}`
                  : ""
              }`
            : "Tables publiées, data marts et destinations"
        }
        actions={
          <>
            <Segmented<LayerFilter>
              label="Couches affichées"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "gold", label: "Publiées" },
                { value: "all", label: "Avec Silver" },
              ]}
            />
            <Button
              variant="primary"
              size="lg"
              loading={publish.isPending || publishing}
              onClick={() => publish.mutate()}
            >
              <Play size={14} weight="fill" />
              {publishing ? "Publication en cours" : "Publier la base"}
            </Button>
          </>
        }
      />

      {tables.isPending ? (
        <ListSkeleton rows={5} />
      ) : tables.isError ? (
        <ScreenError error={tables.error} onRetry={() => void tables.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Broadcast}
          title="Rien à diffuser pour l’instant"
          description="Les tables apparaissent après le premier nettoyage ; les tables Gold sont publiées par défaut."
        />
      ) : (
        <Card role="table" aria-label="Tables du projet" className="overflow-x-auto">
          <div className="min-w-[680px]">
            <ListHead
              style={{ gridTemplateColumns: GRID }}
              columns={[
                "Table",
                "Couche",
                <span key="r" className="block text-right">
                  Lignes
                </span>,
                "Diffusion",
                "Construite",
                "",
              ]}
            />
            {rows.map((table) => (
              <div
                role="row"
                key={table.id}
                data-testid={`serving-row-${table.name}`}
                className="grid min-h-[60px] items-center gap-3 border-t border-sunk px-5"
                style={{ gridTemplateColumns: GRID }}
              >
                <span role="cell" className="flex min-w-0 flex-col gap-px">
                  <span className="truncate font-mono text-[14px] font-medium">{table.name}</span>
                  <span className="text-meta text-tx3">
                    {plural(
                      table.columns.filter((c) => !c.name.startsWith("_")).length,
                      "colonne",
                      "colonnes",
                    )}
                    {table.rejected_count
                      ? ` · ${formatInteger(table.rejected_count)} en quarantaine`
                      : ""}
                  </span>
                </span>
                <span role="cell" className="text-[14px] text-tx2">
                  {LAYER_LABELS[table.layer ?? "silver"]}
                </span>
                <span role="cell" className="text-right text-[14px] text-tx2 tabular-nums">
                  {formatInteger(table.row_count)}
                </span>
                <span role="cell" className="flex">
                  {table.publish ? (
                    <StatusBadge kind="pub" label="Publiée" size={13} />
                  ) : (
                    <StatusBadge kind="queue" label="Interne" size={13} />
                  )}
                </span>
                <span role="cell" className="text-[14px] whitespace-nowrap text-tx2 tabular-nums">
                  {formatWhen(table.built_at)}
                </span>
                <span role="cell" className="flex justify-end gap-1.5">
                  <Button
                    variant="tonal"
                    size="md"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ table, publish: !table.publish })}
                  >
                    {table.publish ? "Retirer" : "Publier"}
                  </Button>
                  <ExportMenu onExport={(format) => void exportTable(table, format, table.name)} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <SectionTitle count={martRows.length}>Data marts publiés</SectionTitle>
        {marts.isPending ? (
          <ListSkeleton rows={2} />
        ) : martRows.length === 0 ? (
          <Card className="px-5 py-6 text-center text-ui text-tx3">
            Aucun data mart publié : ils arrivent des questions posées par les analysts.
          </Card>
        ) : (
          <Card className="flex flex-col">
            {martRows.map((mart, index) => {
              const table = tableById.get(mart.published_table_id ?? "");
              return (
                <div
                  key={mart.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    index > 0 && "border-t border-sunk",
                  )}
                >
                  <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-sunk text-tx2">
                    <ChartPieSlice size={20} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-semibold">
                      {mart.published_name ?? mart.question}
                    </span>
                    <span className="truncate text-meta text-tx3">
                      {mart.question} · {mart.owner_email ?? "analyst"}
                      {table ? ` · ${plural(table.row_count, "ligne", "lignes")}` : ""}
                    </span>
                  </span>
                  <span className="text-meta whitespace-nowrap text-tx3">
                    {mart.published_at ? formatWhen(mart.published_at) : ""}
                  </span>
                  {table ? (
                    <ExportMenu
                      onExport={(format) =>
                        void exportTable(table, format, mart.published_name ?? table.name)
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Destinations</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="flex items-start gap-3 px-5 py-4">
            <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-sunk text-tx2">
              <Database size={20} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[14.5px] font-semibold">Base de diffusion DuckDB</span>
              <span className="text-meta text-tx3">
                {publication
                  ? `Publiée ${formatWhen(publication.run.finished_at ?? publication.run.created_at).toLowerCase()} · lecture seule pour Power BI, Superset, Metabase`
                  : "Pas encore publiée : lancez « Publier la base »."}
              </span>
              {publication ? (
                <code className="truncate font-mono text-[12px] text-tx2" title={publication.path}>
                  {publication.path}
                </code>
              ) : null}
            </span>
          </Card>
          <Card className="flex items-start gap-3 px-5 py-4">
            <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-sunk text-tx2">
              <FolderOpen size={20} />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[14.5px] font-semibold">Fichiers d’export</span>
              <span className="text-meta text-tx3">
                {publication?.run.metrics?.exports?.length
                  ? `${plural(publication.run.metrics.exports.length, "fichier", "fichiers")} Parquet et CSV écrits à la dernière publication`
                  : "Parquet et CSV, écrits à chaque publication, ou à la demande depuis une table."}
              </span>
            </span>
          </Card>
        </div>
      </div>
    </ScreenBody>
  );
}

function ExportMenu({ onExport }: { onExport: (format: "csv" | "parquet") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="tonal" size="md" aria-haspopup="menu">
          Exporter
          <CaretDown size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[210px] flex-col" aria-label="Format d’export">
        {(
          [
            ["csv", "Exporter en CSV", FileCsv],
            ["parquet", "Exporter en Parquet", Database],
          ] as const
        ).map(([format, label, Icon]) => (
          <button
            key={format}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onExport(format);
            }}
            className="flex h-[38px] items-center gap-2.5 rounded-sm border-0 bg-transparent px-2.5 text-left font-sans text-[14px] text-tx hover:bg-sunk"
          >
            <Icon size={17} className="text-tx2" />
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const TOOLS: { value: Tool; label: string; icon: typeof ChartBar }[] = [
  { value: "powerbi", label: "Power BI", icon: ChartBar },
  { value: "superset", label: "Superset", icon: ChartLineUp },
  { value: "metabase", label: "Metabase", icon: ChartPieSlice },
];

/** « Se connecter depuis Power BI, Superset ou Metabase », with the real file path. */
function ConnectPanel({ path }: { path: string | null }) {
  const [tool, setTool] = useState<Tool>("powerbi");
  const shown = path ?? "data/<projet>/serving/<projet>.duckdb";
  const steps = connectSteps(tool, shown);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: "Copié", description: "Collez-le dans l’outil" });
    } catch {
      toast.error({ title: "Copie impossible", description: "Sélectionnez le texte à la main" });
    }
  };
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5"
      data-testid="connect-panel"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-section font-semibold">Se connecter depuis un outil BI</h2>
        <p className="m-0 text-ui text-tx2">
          La base est en lecture seule : plusieurs outils peuvent la lire pendant que Forja publie.
        </p>
      </div>
      <Segmented<Tool>
        label="Outil BI"
        value={tool}
        onValueChange={setTool}
        options={TOOLS.map((t) => ({ value: t.value, label: t.label, icon: <t.icon size={15} /> }))}
      />
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-sunk p-3.5">
        <span className="text-meta font-semibold text-tx3">Fichier DuckDB</span>
        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-tx"
            data-testid="serving-path"
          >
            {shown}
          </code>
          {path ? (
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Copier le chemin"
              onClick={() => void copy(path)}
            >
              <Copy size={16} />
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-acc-soft text-[12.5px] font-semibold text-acc-tx">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[13.5px] leading-normal text-tx2">{step.text}</span>
              {step.code ? (
                <div className="flex items-start gap-1.5 rounded-lg bg-sunk p-2.5">
                  <pre className="m-0 min-w-0 flex-1 font-mono text-[12px] leading-[1.6] break-all whitespace-pre-wrap text-tx">
                    {step.code}
                  </pre>
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    aria-label="Copier"
                    onClick={() => void copy(step.code!)}
                  >
                    <Copy size={15} />
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 text-meta text-tx3">
        Données personnelles pseudonymisées ou masquées selon les plans ; les lignes en quarantaine
        ne sont jamais publiées. Détails dans docs/bi.md.
      </p>
    </div>
  );
}
