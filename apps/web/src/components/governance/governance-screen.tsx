"use client";

import { useState } from "react";
import { MagnifyingGlass, ShieldCheck } from "@phosphor-icons/react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HatchGlyph } from "@/components/ui/spinner";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { formatDateTime, plural } from "@/lib/format";
import {
  NO_FILTER,
  OBJECT_LABELS,
  actionLabel,
  auditFacets,
  auditSummary,
  filterAudit,
  personalDataMap,
  type AuditFilters,
  type AuditPeriod,
} from "@/lib/governance/view";
import {
  useAudit,
  useGoldPlan,
  useLatestPlans,
  useSources,
  type TransformationPlan,
} from "@/lib/project/queries";

type View = "personal" | "audit";
const AUDIT_GRID = "150px minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.4fr)";
const PII_GRID = "minmax(0,1.1fr) 110px minmax(0,1fr) minmax(0,1.3fr) minmax(0,1fr) 120px";
const ALL = "__all__";

/** /projects/[id]/governance: personal columns by layer, and the audit log. */
export function GovernanceScreen() {
  const { project, role } = useShell();
  const [view, setView] = useState<View>("personal");
  return (
    <ScreenBody testId="governance-screen">
      <ScreenHeader
        title="Gouvernance"
        subtitle="Données personnelles et journal d’audit du projet"
        actions={
          <Segmented<View>
            label="Vue de la gouvernance"
            value={view}
            onValueChange={setView}
            options={[
              { value: "personal", label: "Données personnelles" },
              { value: "audit", label: "Journal d’audit" },
            ]}
          />
        }
      />
      {view === "personal" ? <PersonalData projectId={project.id} /> : null}
      {view === "audit" ? <AuditLog projectId={project.id} allowed={role === "admin"} /> : null}
    </ScreenBody>
  );
}

function PersonalData({ projectId }: { projectId: string }) {
  const sources = useSources(projectId);
  const plans = useLatestPlans((sources.data ?? []).map((s) => s.id));
  const gold = useGoldPlan(projectId);
  if (sources.isPending || plans.some((p) => p.isPending) || gold.isPending) {
    return <ListSkeleton rows={5} />;
  }
  if (sources.isError) {
    return <ScreenError error={sources.error} onRetry={() => void sources.refetch()} />;
  }
  const rows = personalDataMap(
    plans.map((p) => p.data).filter((p): p is TransformationPlan => Boolean(p)),
    gold.data ?? null,
  );
  if (!rows.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Aucune donnée personnelle détectée"
        description="Le profilage cherche les emails, téléphones, IBAN et noms dans chaque fichier chargé."
      />
    );
  }
  const exposed = rows.filter((r) => r.exposed).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-ui text-tx2">
        <span className="flex items-center gap-2">
          <HatchGlyph size={12} className="text-pii-fg" />
          {plural(rows.length, "colonne personnelle", "colonnes personnelles")}
        </span>
        {exposed ? (
          <span className="text-prop-fg">
            {plural(
              exposed,
              "laissée en clair dans les exports",
              "laissées en clair dans les exports",
            )}
          </span>
        ) : (
          <span>toutes traitées avant diffusion</span>
        )}
      </div>
      <Card
        role="table"
        aria-label="Colonnes personnelles"
        className="overflow-x-auto"
        data-testid="personal-data"
      >
        <div className="min-w-[900px]">
          <ListHead
            style={{ gridTemplateColumns: PII_GRID }}
            columns={["Colonne", "Type", "Silver", "Gold", "Diffusion et exports", "Analysts"]}
          />
          {rows.map((row) => (
            <div
              role="row"
              key={`${row.source}.${row.column}`}
              className={cn(
                "grid min-h-[56px] items-center gap-3 border-t border-sunk px-5 text-[13.5px]",
                row.exposed && "bg-prop-bg/40",
              )}
              style={{ gridTemplateColumns: PII_GRID }}
            >
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium">
                  <HatchGlyph size={10} className="flex-none text-pii-fg" />
                  <span className="truncate">{row.column}</span>
                </span>
                <span className="text-meta text-tx3">{row.source}</span>
              </span>
              <span role="cell" className="flex flex-col">
                <span>{row.type}</span>
                <span className="text-meta text-tx3">confiance {row.confidence}</span>
              </span>
              <span role="cell" className="text-tx2">
                {row.silver}
              </span>
              <span role="cell" className="text-tx2">
                {row.gold}
              </span>
              <span role="cell" className={row.exposed ? "font-medium text-prop-fg" : "text-tx2"}>
                {row.serving}
              </span>
              <span role="cell" className="text-tx2">
                {row.analyst}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <p className="m-0 text-meta text-tx3">
        La couche Silver reste en clair, sur ce poste et pour le pipeline. Le traitement de chaque
        colonne se règle dans la revue de son plan de nettoyage.
      </p>
    </div>
  );
}

const PERIODS: { value: AuditPeriod; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "day", label: "24 h" },
  { value: "week", label: "7 jours" },
  { value: "month", label: "30 jours" },
];

function AuditLog({ projectId, allowed }: { projectId: string; allowed: boolean }) {
  const audit = useAudit(projectId, allowed);
  const [filters, setFilters] = useState<AuditFilters>(NO_FILTER);
  if (!allowed) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Journal réservé aux administrateurs"
        description="Le journal d’audit liste qui a fait quoi dans le projet ; un administrateur du projet peut le consulter."
      />
    );
  }
  if (audit.isPending) return <ListSkeleton rows={8} height={52} />;
  if (audit.isError)
    return <ScreenError error={audit.error} onRetry={() => void audit.refetch()} />;
  const facets = auditFacets(audit.data);
  const rows = filterAudit(audit.data, filters);
  const set = (change: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...change }));
  const menu = (
    label: string,
    value: string | null,
    options: { value: string; label: string }[],
    onChange: (v: string | null) => void,
  ) => (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger aria-label={label} className="min-w-[170px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label} : tous</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTER);
  return (
    <div className="flex flex-col gap-3" data-testid="audit-log">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <MagnifyingGlass
            size={17}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-tx3"
          />
          <Input
            variant="sunk"
            className="pl-9"
            placeholder="Rechercher un objet, un fichier, un email"
            aria-label="Rechercher dans le journal"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
          />
        </div>
        {menu(
          "Utilisateur",
          filters.user,
          facets.users.map((u) => ({ value: u, label: u })),
          (user) => set({ user }),
        )}
        {menu(
          "Action",
          filters.action,
          facets.actions.map((a) => ({ value: a, label: actionLabel(a) })),
          (action) => set({ action }),
        )}
        {menu(
          "Objet",
          filters.object,
          facets.objects.map((o) => ({ value: o, label: OBJECT_LABELS[o] ?? o })),
          (object) => set({ object }),
        )}
        <Segmented<AuditPeriod>
          label="Période"
          value={filters.period}
          onValueChange={(period) => set({ period })}
          options={PERIODS}
        />
        {active ? (
          <Button variant="link" size="md" onClick={() => setFilters(NO_FILTER)}>
            Effacer les filtres
          </Button>
        ) : null}
      </div>
      <SectionTitle count={`${rows.length} sur ${audit.data.length}`}>Événements</SectionTitle>
      <Card role="table" aria-label="Journal d’audit" className="overflow-x-auto">
        <div className="min-w-[760px]">
          <ListHead
            style={{ gridTemplateColumns: AUDIT_GRID }}
            columns={["Date", "Utilisateur", "Action", "Objet"]}
          />
          {rows.length === 0 ? (
            <p className="m-0 border-t border-sunk px-5 py-8 text-center text-ui text-tx3">
              Aucun événement ne correspond à ces filtres.
            </p>
          ) : null}
          {rows.slice(0, 300).map((entry) => (
            <div
              role="row"
              key={entry.id}
              className="grid min-h-[52px] items-center gap-3 border-t border-sunk px-5 py-2 text-[13.5px]"
              style={{ gridTemplateColumns: AUDIT_GRID }}
            >
              <span role="cell" className="text-tx2 tabular-nums">
                {formatDateTime(entry.at)}
              </span>
              <span role="cell" className="truncate text-tx">
                {entry.user_email ?? "Système"}
              </span>
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{actionLabel(entry.action)}</span>
                <span className="truncate font-mono text-[12px] text-tx3">{entry.action}</span>
              </span>
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="truncate text-tx2">
                  {entry.object_type
                    ? (OBJECT_LABELS[entry.object_type] ?? entry.object_type)
                    : "—"}
                  {auditSummary(entry) ? ` · ${auditSummary(entry)}` : ""}
                </span>
                {entry.object_id ? (
                  <span className="truncate font-mono text-[12px] text-tx3">{entry.object_id}</span>
                ) : null}
              </span>
            </div>
          ))}
          {rows.length > 300 ? (
            <p className="m-0 border-t border-sunk px-5 py-3 text-meta text-tx3">
              300 premiers événements affichés : affinez les filtres.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
