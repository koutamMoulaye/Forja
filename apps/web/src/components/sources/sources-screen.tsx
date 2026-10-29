"use client";

import { useState } from "react";
import Link from "next/link";
import { Files, Plus } from "@phosphor-icons/react";
import { AddSourceDialog } from "@/components/connections/add-source-dialog";
import { SourcesTabs } from "@/components/connections/sources-tabs";
import {
  Card,
  EmptyState,
  ListHead,
  ListSkeleton,
  ScreenBody,
  ScreenError,
  ScreenHeader,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { HatchGlyph } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatInteger, formatWhen, plural } from "@/lib/format";
import { originIcon } from "@/lib/connections/view";
import { useLatestPlans, useProfiles, useSources } from "@/lib/project/queries";
import {
  FORMAT_LABELS,
  matchesSourceFilter,
  personalColumns,
  planBadge,
  qualityView,
  type SourceFilter,
} from "@/lib/sources/view";
import { useFileUpload } from "./use-file-upload";

const GRID = "minmax(0,1.6fr) 110px 84px 76px 132px 56px 64px 104px 128px" as const;

const FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "review", label: "Plan à revoir" },
  { value: "pii", label: "Données personnelles" },
  { value: "drift", label: "Schéma modifié" },
];

/** /projects/[id]/sources: the loaded files, their quality, versions and plans. */
export function SourcesScreen() {
  const { project } = useShell();
  const sources = useSources(project.id);
  const ids = (sources.data ?? []).map((s) => s.id);
  const plans = useLatestPlans(ids);
  const profiles = useProfiles(ids);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [adding, setAdding] = useState(false);
  const files = useFileUpload(project.id);

  const rows = (sources.data ?? []).map((source, index) => {
    const plan = plans[index]?.data;
    const personal = personalColumns(profiles[index]?.data).length;
    return { source, plan, personal, profileLoading: profiles[index]?.isPending ?? true };
  });
  const visible = rows.filter((row) =>
    matchesSourceFilter(filter, row.source, row.plan, row.personal),
  );
  const review = rows.filter((row) => row.plan?.status === "draft").length;
  const subtitle = sources.data
    ? [
        plural(sources.data.length, "source", "sources"),
        review ? plural(review, "plan à revoir", "plans à revoir") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Fichiers et tables chargés, versions et profils";

  return (
    <ScreenBody testId="sources-screen">
      <ScreenHeader
        title="Sources"
        subtitle={subtitle}
        eyebrow={<SourcesTabs projectId={project.id} current="sources" />}
        actions={
          <>
            <Segmented
              label="Filtrer les sources"
              value={filter}
              onValueChange={setFilter}
              options={FILTERS}
            />
            {files.element}
            <Button
              variant="primary"
              size="lg"
              loading={files.uploading}
              onClick={() => setAdding(true)}
              data-testid="add-source"
            >
              {files.uploading ? null : <Plus size={17} />}
              {files.uploading ? (files.label ?? "Chargement") : "Ajouter une source"}
            </Button>
          </>
        }
      />
      <AddSourceDialog
        projectId={project.id}
        open={adding}
        onOpenChange={setAdding}
        onChooseFile={files.choose}
        uploadLimitMb={files.maxMb}
      />
      {sources.isPending ? (
        <ListSkeleton />
      ) : sources.isError ? (
        <ScreenError error={sources.error} onRetry={() => void sources.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Files}
          title="Aucune source pour l’instant"
          description="Un fichier, une base de données ou une API : Forja les profile puis propose un plan de nettoyage."
          action={
            <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Ajouter une source
            </Button>
          }
        />
      ) : (
        <Card role="table" aria-label="Sources du projet" className="overflow-x-auto">
          <div className="min-w-[960px]">
            <ListHead
              style={{ gridTemplateColumns: GRID }}
              columns={[
                "Nom",
                "Format",
                <span key="l" className="block text-right">
                  Lignes
                </span>,
                <span key="c" className="block text-right">
                  Colonnes
                </span>,
                "Qualité",
                "PII",
                "Version",
                "Chargée",
                "Plan",
              ]}
            />
            {visible.length === 0 ? (
              <p className="m-0 border-t border-sunk px-5 py-8 text-center text-ui text-tx3">
                Aucune source ne correspond à ce filtre.
              </p>
            ) : null}
            {visible.map(({ source, plan, personal, profileLoading }) => {
              const quality = qualityView(source.quality_score);
              const badge = planBadge(plan);
              const OriginIcon = originIcon(source.format);
              return (
                <Link
                  role="row"
                  key={source.id}
                  href={`/projects/${project.id}/sources/${source.id}`}
                  data-testid={`source-row-${source.name}`}
                  className="grid min-h-[64px] items-center gap-3 border-t border-sunk px-5 text-tx no-underline transition-colors hover:bg-sunk hover:no-underline"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-semibold">{source.name}</span>
                    <span className="truncate font-mono text-mono text-tx3">
                      {source.origin
                        ? `${source.origin.connection_name} · ${source.origin.object}`
                        : source.original_filename}
                      {source.sheet_name ? ` · ${source.sheet_name}` : ""}
                    </span>
                  </span>
                  <span role="cell" className="flex items-center gap-1.5 text-[14px] text-tx2">
                    {OriginIcon ? <OriginIcon size={15} className="flex-none text-tx3" /> : null}
                    <span className="truncate">{FORMAT_LABELS[source.format]}</span>
                  </span>
                  <span role="cell" className="text-right text-[14px] text-tx2 tabular-nums">
                    {formatInteger(source.row_count)}
                  </span>
                  <span role="cell" className="text-right text-[14px] text-tx2 tabular-nums">
                    {formatInteger(source.column_count)}
                  </span>
                  <span role="cell" className="flex items-center gap-2">
                    {quality ? (
                      <>
                        <span className="flex h-[5px] flex-1 overflow-hidden rounded-[3px] bg-sunk">
                          <span
                            className={cn(
                              "rounded-[3px]",
                              quality.tone === "val" ? "bg-val-fg" : "bg-prop-fg",
                            )}
                            style={{ width: `${quality.width}%` }}
                          />
                        </span>
                        <span className="w-9 text-right text-[13.5px] text-tx2 tabular-nums">
                          {quality.label}
                        </span>
                      </>
                    ) : (
                      <span className="text-meta text-tx3">—</span>
                    )}
                  </span>
                  <span role="cell" className="flex items-center gap-1.5 text-[14px] tabular-nums">
                    {profileLoading ? (
                      <span className="text-tx3">…</span>
                    ) : personal ? (
                      <span
                        className="flex items-center gap-1.5 text-pii-fg"
                        title={plural(personal, "colonne personnelle", "colonnes personnelles")}
                      >
                        <HatchGlyph size={12} />
                        {personal}
                      </span>
                    ) : (
                      <span className="text-tx3">0</span>
                    )}
                  </span>
                  <span role="cell" className="font-mono text-mono text-tx2">
                    v{source.version}
                    {source.schema_drift?.has_drift ? (
                      <span className="ml-1 text-prop-fg" title="Schéma modifié">
                        •
                      </span>
                    ) : null}
                  </span>
                  <span role="cell" className="text-[14px] whitespace-nowrap text-tx2 tabular-nums">
                    {formatWhen(source.ingested_at)}
                  </span>
                  <span role="cell" className="flex">
                    <StatusBadge kind={badge.kind} label={badge.label} size={13} />
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </ScreenBody>
  );
}
