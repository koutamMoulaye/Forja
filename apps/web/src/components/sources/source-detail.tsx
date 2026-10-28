"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Broom, Key, Table, UploadSimple } from "@phosphor-icons/react";
import { DataTable } from "@/components/screens/data-table";
import {
  Card,
  Code,
  EmptyState,
  ScreenBody,
  ScreenError,
  ScreenHeader,
  ScreenSkeleton,
  SectionTitle,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { HatchGlyph } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatDecimal, formatInteger, formatWhen, plural } from "@/lib/format";
import { springs } from "@/lib/motion";
import {
  keys,
  uploadFile,
  usePlan,
  useProfile,
  useSource,
  useTablePreview,
  useTables,
  useVersions,
  type ProfileReport,
  type Source,
  type TransformationPlan,
} from "@/lib/project/queries";
import {
  FORMAT_LABELS,
  driftLines,
  driftSummary,
  fillRate,
  inferredTypeLabel,
  levelLabel,
  piiLabel,
  planBadge,
  qualityComponents,
  qualityIssues,
} from "@/lib/sources/view";

type Tab = "profile" | "versions" | "preview";

const TABS: { value: Tab; label: string }[] = [
  { value: "profile", label: "Profil" },
  { value: "versions", label: "Versions" },
  { value: "preview", label: "Aperçu" },
];

/** /projects/[id]/sources/[sourceId]: profile, versions with drift, new version, preview. */
export function SourceDetail({ sourceId }: { sourceId: string }) {
  const { project } = useShell();
  const queryClient = useQueryClient();
  const source = useSource(sourceId);
  const plan = usePlan(sourceId);
  const [tab, setTab] = useState<Tab>("profile");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (source.isPending) return <ScreenSkeleton />;
  if (source.isError) {
    return (
      <ScreenBody>
        <ScreenError error={source.error} onRetry={() => void source.refetch()} />
      </ScreenBody>
    );
  }
  const data = source.data;
  const badge = planBadge(plan.data);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const updated = (await uploadFile(`/sources/${sourceId}/versions`, file)) as Source;
      toast.success({
        title: `Version ${updated.version} chargée`,
        description: driftSummary({ version: updated.version, schema_drift: updated.schema_drift }),
      });
      setTab("versions");
    } catch (error) {
      toast.error({
        title: "Nouvelle version refusée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
      for (const key of [
        keys.source(sourceId),
        keys.versions(sourceId),
        ["profile", sourceId],
        ["plan", sourceId],
        keys.sources(project.id),
        ["graph", project.id],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }
  };

  return (
    <ScreenBody testId="source-detail">
      <ScreenHeader
        eyebrow={`Source · ${FORMAT_LABELS[data.format]}`}
        title={data.name}
        subtitle={
          <span className="tabular-nums">
            <span className="font-mono text-[13.5px]">{data.original_filename}</span>
            {` · version ${data.version} · ${plural(data.row_count, "ligne", "lignes")}, `}
            {`${plural(data.column_count, "colonne", "colonnes")} · chargée ${formatWhen(data.ingested_at).toLowerCase()}`}
          </span>
        }
        actions={
          <>
            <input
              ref={input}
              type="file"
              hidden
              data-testid="version-upload-input"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.parquet,.json,.jsonl"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="lg"
              loading={uploading}
              onClick={() => input.current?.click()}
            >
              <UploadSimple size={17} />
              Nouvelle version
            </Button>
            <Button
              asChild
              variant={plan.data?.status === "draft" ? "primary" : "secondary"}
              size="lg"
            >
              <Link
                href={`/projects/${project.id}/sources/${sourceId}/plan`}
                className="no-underline hover:no-underline"
              >
                <Broom size={17} />
                {plan.data?.status === "draft" ? "Revoir le plan" : "Plan de nettoyage"}
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Vue de la source" value={tab} onValueChange={setTab} options={TABS} />
        <span className="flex items-center gap-2 text-ui text-tx3">
          Plan Silver
          <StatusBadge kind={badge.kind} label={badge.label} size={13} />
        </span>
      </div>
      {tab === "profile" ? <ProfileTab sourceId={sourceId} /> : null}
      {tab === "versions" ? <VersionsTab sourceId={sourceId} /> : null}
      {tab === "preview" ? <PreviewTab source={data} plan={plan.data ?? null} /> : null}
    </ScreenBody>
  );
}

function ProfileTab({ sourceId }: { sourceId: string }) {
  const profile = useProfile(sourceId);
  if (profile.isPending) return <ScreenSkeletonCards />;
  if (profile.isError) {
    return <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  if (!profile.data) {
    return (
      <EmptyState
        icon={Table}
        title="Profil en préparation"
        description="Le profilage de ce fichier n’est pas encore terminé."
      />
    );
  }
  return <Profile profile={profile.data} />;
}

function ScreenSkeletonCards() {
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]" aria-busy="true">
      <Card className="h-80 animate-pulse" />
      <Card className="h-[420px] animate-pulse" />
    </div>
  );
}

function Profile({ profile }: { profile: ProfileReport }) {
  const issues = qualityIssues(profile);
  const pii = profile.pii.filter((p) => p.level !== "low");
  const byColumn = new Map(profile.pii.map((p) => [p.column, p]));
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="quality-card">
          <div className="text-[13px] font-semibold text-tx3">Qualité de la source</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[40px] leading-none font-semibold tracking-[-0.035em] tabular-nums">
              {formatDecimal(profile.quality.score)}
            </span>
            <span className="text-tx3">/100</span>
          </div>
          <div className="flex flex-col gap-2">
            {qualityComponents(profile).map((component) => (
              <div
                key={component.name}
                title={component.details}
                className="grid grid-cols-[96px_1fr_34px] items-center gap-2.5 text-[13.5px]"
              >
                <span className="text-tx2">{component.label}</span>
                <span className="flex h-1.5 overflow-hidden rounded-[3px] bg-sunk">
                  <span
                    className={cn(
                      "rounded-[3px]",
                      component.value >= 85 ? "bg-val-fg" : "bg-prop-fg",
                    )}
                    style={{ width: `${component.value}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{component.value}</span>
              </div>
            ))}
          </div>
          {issues.length ? (
            <ul
              className="m-0 flex list-none flex-col gap-1.5 p-0 pt-1"
              data-testid="quality-issues"
            >
              {issues.map((issue) => (
                <li key={issue} className="flex gap-2 text-[13px] leading-snug text-tx2">
                  <span className="mt-1.5 size-1.5 flex-none rounded-full bg-prop-fg" />
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        <Card className="flex flex-col gap-2.5 px-5 py-[18px]">
          <SectionTitle>Structure</SectionTitle>
          <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
            <dt className="text-tx3">Lignes</dt>
            <dd className="m-0 tabular-nums">{formatInteger(profile.row_count)}</dd>
            <dt className="text-tx3">Doublons exacts</dt>
            <dd className="m-0 tabular-nums">
              {formatInteger(profile.duplicates.duplicate_rows)}
              <span className="text-tx3">
                {" "}
                ({formatDecimal(profile.duplicates.duplicate_pct)} %)
              </span>
            </dd>
            <dt className="text-tx3">Clés candidates</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {profile.candidate_keys.length
                ? profile.candidate_keys.map((key) => (
                    <Code key={key.columns.join("+")}>{key.columns.join(" + ")}</Code>
                  ))
                : "aucune"}
            </dd>
          </dl>
        </Card>
        {pii.length ? (
          <div className="rounded-2xl p-1.5 hatch-pii" data-testid="pii-card">
            <div className="flex flex-col gap-2 rounded-xl bg-node px-4 py-3.5">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-pii-fg">
                <HatchGlyph size={13} />
                Données personnelles
              </div>
              <div className="flex flex-wrap gap-1">
                {pii.map((p) => (
                  <Code key={p.column}>{p.column}</Code>
                ))}
              </div>
              <p className="m-0 text-[13px] leading-normal text-tx2">
                Le plan de nettoyage les pseudonymise avant toute diffusion. Les valeurs d’origine
                restent sur ce poste.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <Card className="overflow-x-auto" data-testid="profile-columns">
        <div className="min-w-[640px]">
          <div className="flex items-baseline gap-2 px-5 pt-[18px] pb-1">
            <SectionTitle>Colonnes</SectionTitle>
            <span className="text-[13.5px] text-tx3">
              {plural(profile.column_count, "colonne", "colonnes")}
            </span>
          </div>
          <table
            className="w-full border-collapse text-[13.5px] tabular-nums"
            aria-label="Colonnes profilées"
          >
            <thead>
              <tr className="text-left text-[12.5px] font-semibold text-tx3">
                <th className="h-9 pl-5 font-semibold">Colonne</th>
                <th className="font-semibold">Type</th>
                <th className="font-semibold">Remplissage</th>
                <th className="text-right font-semibold">Distinctes</th>
                <th className="pr-5 pl-4 font-semibold">Donnée personnelle</th>
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((column) => {
                const fill = fillRate(column);
                const detection = byColumn.get(column.name);
                const unique = column.is_unique && column.null_count === 0;
                return (
                  <tr key={column.name} className="h-[52px] border-t border-sunk">
                    <td className="pl-5">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-medium">{column.name}</span>
                        {unique ? (
                          <Key size={14} weight="fill" className="text-tx3" aria-label="Unique" />
                        ) : null}
                      </span>
                      {column.top_values?.[0] && !detection ? (
                        <span className="block max-w-[220px] truncate text-[12.5px] text-tx3">
                          ex. {column.top_values[0]!.value}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-tx2">
                      {inferredTypeLabel(column)}
                      {column.inferred.match_ratio < 1 && column.inferred.from_text ? (
                        <span className="block text-[12.5px] text-tx3">
                          {formatDecimal(column.inferred.match_ratio * 100)} % conformes
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="flex h-[5px] w-24 overflow-hidden rounded-[3px] bg-sunk">
                          <span
                            className={cn("rounded-[3px]", fill < 50 ? "bg-prop-fg" : "bg-tx2")}
                            style={{ width: `${fill}%` }}
                          />
                        </span>
                        <span className="w-12 text-tx2">{formatDecimal(fill)} %</span>
                      </span>
                    </td>
                    <td className="text-right text-tx2">{formatInteger(column.distinct_count)}</td>
                    <td className="pr-5 pl-4">
                      {detection ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <StatusBadge
                            kind="pii"
                            label={piiLabel(detection.pii_type)}
                            size={12.5}
                          />
                          <span className="text-[12px] text-tx3">
                            {levelLabel(detection.level)}
                          </span>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function VersionsTab({ sourceId }: { sourceId: string }) {
  const versions = useVersions(sourceId);
  if (versions.isPending) return <ScreenSkeletonCards />;
  if (versions.isError) {
    return <ScreenError error={versions.error} onRetry={() => void versions.refetch()} />;
  }
  const ordered = [...versions.data].sort((a, b) => b.version - a.version);
  return (
    <Card className="flex flex-col" data-testid="versions">
      {ordered.map((version, index) => {
        const lines = driftLines(version);
        return (
          <motion.div
            key={version.id}
            layout
            transition={springs.settle}
            className={cn("flex flex-col gap-2 px-5 py-4", index > 0 && "border-t border-sunk")}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-[13px] text-tx3">v{version.version}</span>
              <span className="text-[14.5px] font-semibold">{version.original_filename}</span>
              <span className="text-[13.5px] text-tx2 tabular-nums">
                {plural(version.row_count, "ligne", "lignes")}
                {version.version > 1
                  ? `, dont ${plural(version.new_row_count, "nouvelle", "nouvelles")}`
                  : ""}
              </span>
              <span className="ml-auto text-[13.5px] text-tx3 tabular-nums">
                {formatWhen(version.ingested_at)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "text-[13px]",
                  version.schema_drift?.has_drift ? "font-medium text-prop-fg" : "text-tx3",
                )}
              >
                {driftSummary(version)}
              </span>
              {lines.map((line) => (
                <span
                  key={line.text}
                  className={cn(
                    "rounded-xs px-[7px] py-0.5 font-mono text-[12.5px]",
                    line.tone === "add" && "bg-val-bg text-val-fg",
                    line.tone === "remove" && "bg-err-bg text-err-fg",
                    line.tone === "change" && "bg-prop-bg text-prop-fg",
                  )}
                >
                  {line.tone === "add" ? "+ " : line.tone === "remove" ? "− " : "~ "}
                  {line.text}
                </span>
              ))}
            </div>
            {version.warnings?.length ? (
              <ul className="m-0 list-none p-0 text-[13px] text-tx2">
                {version.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </motion.div>
        );
      })}
    </Card>
  );
}

/** The Silver table, personal data treated for the viewer's role; never raw Bronze. */
function PreviewTab({ source, plan }: { source: Source; plan: TransformationPlan | null }) {
  const { project, role } = useShell();
  const tables = useTables(project.id);
  const table = tables.data?.find((t) => t.layer === "silver" && t.source_id === source.id) ?? null;
  const preview = useTablePreview(table?.id ?? null, 25);
  if (tables.isPending) return <ScreenSkeletonCards />;
  if (!table) {
    return (
      <EmptyState
        icon={Table}
        title="Pas encore de table nettoyée"
        description="L’aperçu montre la table Silver, jamais le fichier brut : il apparaît après le premier nettoyage."
      />
    );
  }
  const personal = (plan?.columns ?? [])
    .filter((c) => c.pii_type && (c.pii_treatment !== "none" || role === "analyst"))
    .map((c) => c.target_column);
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-2 px-5 pt-[18px] pb-2">
        <SectionTitle>Aperçu de {table.name}</SectionTitle>
        <span className="text-[13.5px] text-tx3 tabular-nums">
          {preview.data
            ? `${plural(preview.data.rows.length, "ligne", "lignes")} sur ${formatInteger(preview.data.total_rows)}`
            : ""}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[13px] text-tx3">
          <HatchGlyph size={11} className="text-pii-fg" />
          Données personnelles traitées comme dans les exports
        </span>
      </div>
      {preview.isError ? (
        <div className="p-4">
          <ScreenError error={preview.error} onRetry={() => void preview.refetch()} />
        </div>
      ) : (
        <DataTable
          label={`Aperçu de ${table.name}`}
          columns={preview.data?.columns ?? []}
          rows={preview.data?.rows ?? []}
          personal={personal}
          loading={preview.isPending}
          maxHeight={560}
        />
      )}
    </Card>
  );
}
