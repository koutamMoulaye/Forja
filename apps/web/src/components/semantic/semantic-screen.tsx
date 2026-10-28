"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpenText,
  EyeSlash,
  Function as FunctionIcon,
  Plus,
  Tag,
  Warning,
  X,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatAgo, plural } from "@/lib/format";
import { springs } from "@/lib/motion";
import {
  keys,
  useMartRequests,
  useSemanticLayer,
  useSemanticVersions,
  useSynonymProposals,
  type SemanticLayer,
  type SynonymProposal,
} from "@/lib/project/queries";
import {
  ADDITIVITY,
  dimensionRows,
  findAttribute,
  findMetric,
  formatLabel,
  metricRows,
  sortProposals,
  synonymWarnings,
  targetLabel,
  type SemanticRow,
} from "@/lib/semantic/view";

type Tab = "metrics" | "dimensions";
const GRID = "minmax(0,1.2fr) minmax(0,1.2fr) 112px minmax(0,1.3fr) 76px";

/** /projects/[id]/semantic: metrics, dimensions, synonyms (S3); edit with ?metric=… */
export function SemanticScreen() {
  const { project } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [version, setVersion] = useState<number | undefined>(undefined);
  const layer = useSemanticLayer(project.id, version);
  const versions = useSemanticVersions(project.id);
  const marts = useMartRequests(project.id);
  const proposals = useSynonymProposals(project.id);
  const tab: Tab = params.get("dimension") ? "dimensions" : (params.get("tab") as Tab) || "metrics";
  const selectedKey = params.get(tab === "metrics" ? "metric" : "dimension");

  const select = (next: Tab, key: string | null) => {
    const query = new URLSearchParams();
    if (key) query.set(next === "metrics" ? "metric" : "dimension", key);
    else if (next === "dimensions") query.set("tab", "dimensions");
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (layer.isPending) return <ScreenBodySkeleton />;
  if (layer.isError) {
    return (
      <ScreenBody>
        <ScreenError error={layer.error} onRetry={() => void layer.refetch()} />
      </ScreenBody>
    );
  }
  if (!layer.data) {
    return (
      <ScreenBody>
        <ScreenHeader title="Couche sémantique" subtitle="Métriques, dimensions et synonymes" />
        <EmptyState
          icon={BookOpenText}
          title="Pas encore de couche sémantique"
          description="Elle est générée à la construction du modèle en étoile : libellés métier, formules et synonymes pour l’agent."
        />
      </ScreenBody>
    );
  }

  const data = layer.data;
  const latest = versions.data?.length ? Math.max(...versions.data) : data.version;
  const readOnly = data.version !== latest;
  const rows =
    tab === "metrics" ? metricRows(data, marts.data ?? []) : dimensionRows(data, marts.data ?? []);
  const selected = rows.find((r) => r.key === selectedKey) ?? rows[0] ?? null;
  const pending = (proposals.data ?? []).filter((p) => p.status === "pending");

  return (
    <ScreenBody
      testId="semantic-screen"
      asideWidth={400}
      aside={
        selected ? (
          <EditPanel
            key={`${data.version}-${selected.target}`}
            layer={data}
            row={selected}
            tab={tab}
            readOnly={readOnly}
            onClose={() => select(tab, null)}
          />
        ) : undefined
      }
    >
      <ScreenHeader
        title="Couche sémantique"
        subtitle={`${plural(data.metrics?.length ?? 0, "métrique", "métriques")} · ${plural(
          dimensionRows(data, []).length,
          "dimension",
          "dimensions",
        )} · ${plural(pending.length, "synonyme à valider", "synonymes à valider")}`}
        actions={
          <>
            <Segmented<Tab>
              label="Éléments"
              value={tab}
              onValueChange={(next) => select(next, null)}
              options={[
                { value: "metrics", label: "Métriques" },
                { value: "dimensions", label: "Dimensions" },
              ]}
            />
            <Select
              value={String(version ?? latest)}
              onValueChange={(v) => setVersion(Number(v) === latest ? undefined : Number(v))}
            >
              <SelectTrigger aria-label="Version de la couche">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...(versions.data ?? [data.version])]
                  .sort((a, b) => b - a)
                  .map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v === latest ? `Version ${v} (actuelle)` : `Version ${v}`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        }
      />
      {readOnly ? (
        <div className="rounded-xl bg-prop-bg px-4 py-3 text-ui text-prop-fg">
          Version {data.version}, en lecture seule. Les modifications portent sur la version{" "}
          {latest}.
        </div>
      ) : null}
      <Card
        role="table"
        aria-label={tab === "metrics" ? "Métriques" : "Dimensions"}
        className="overflow-x-auto"
      >
        <div className="min-w-[680px]">
          <ListHead
            style={{ gridTemplateColumns: GRID }}
            columns={
              tab === "metrics"
                ? ["Libellé métier", "Formule", "Additivité", "Synonymes", "Data marts"]
                : ["Libellé métier", "Colonne", "Type", "Synonymes", "Data marts"]
            }
          />
          {rows.map((row) => (
            <button
              role="row"
              type="button"
              key={row.target}
              data-testid={`semantic-row-${row.key}`}
              aria-current={row.target === selected?.target || undefined}
              onClick={() => select(tab, row.key)}
              className={cn(
                "grid min-h-16 w-full items-center gap-3.5 border-0 border-t border-sunk px-5 text-left font-sans text-tx transition-colors",
                row.target === selected?.target ? "bg-acc-soft" : "bg-transparent hover:bg-sunk",
              )}
              style={{ gridTemplateColumns: GRID }}
            >
              <span role="cell" className="flex min-w-0 flex-col gap-px">
                <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                  <span className="truncate">{row.label}</span>
                  {row.hidden ? (
                    <EyeSlash size={15} className="flex-none text-tx3" aria-label="Masqué" />
                  ) : null}
                </span>
                <span className="truncate font-mono text-mono text-tx3">{row.id}</span>
              </span>
              <span
                role="cell"
                className="truncate font-mono text-[13px] text-tx2"
                title={row.formula}
              >
                {row.formula}
              </span>
              <span role="cell" className="flex">
                <span className="flex h-[26px] items-center rounded-full bg-sunk px-2.5 text-[12.5px] font-medium whitespace-nowrap text-tx2">
                  {row.kind}
                </span>
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-1 overflow-hidden">
                {row.synonyms.slice(0, 2).map((synonym) => (
                  <span
                    key={synonym}
                    className="min-w-0 truncate rounded-[7px] bg-sunk px-2 py-[3px] text-meta whitespace-nowrap text-tx2"
                  >
                    {synonym}
                  </span>
                ))}
                {row.synonyms.length > 2 ? (
                  <span className="flex-none text-meta text-tx3">+{row.synonyms.length - 2}</span>
                ) : null}
              </span>
              <span role="cell" className="text-right text-[14px] text-tx2 tabular-nums">
                {row.marts}
              </span>
            </button>
          ))}
          {rows.length === 0 ? (
            <p className="m-0 border-t border-sunk px-5 py-8 text-center text-ui text-tx3">
              Aucun élément.
            </p>
          ) : null}
        </div>
      </Card>
      <SynonymQueue layer={data} proposals={proposals.data ?? []} loading={proposals.isPending} />
    </ScreenBody>
  );
}

function ScreenBodySkeleton() {
  return (
    <ScreenBody>
      <div className="h-16 w-80 animate-pulse rounded-lg bg-sunk" />
      <ListSkeleton rows={5} height={64} />
    </ScreenBody>
  );
}

function SynonymQueue({
  layer,
  proposals,
  loading,
}: {
  layer: SemanticLayer;
  proposals: SynonymProposal[];
  loading: boolean;
}) {
  const { project } = useShell();
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) =>
      accept
        ? unwrap(
            await api.POST("/synonym-proposals/{proposal_id}/accept", {
              params: { path: { proposal_id: id } },
            }),
          )
        : unwrap(
            await api.POST("/synonym-proposals/{proposal_id}/reject", {
              params: { path: { proposal_id: id } },
            }),
          ),
    onSuccess: (proposal) => {
      toast.success({
        title: proposal.status === "accepted" ? "Synonyme validé" : "Synonyme rejeté",
        description: `« ${proposal.synonym} » pour ${targetLabel(layer, proposal.target)}`,
      });
      void queryClient.invalidateQueries({ queryKey: keys.synonyms(project.id) });
      void queryClient.invalidateQueries({ queryKey: ["semantic", project.id] });
      void queryClient.invalidateQueries({ queryKey: keys.semanticVersions(project.id) });
    },
    onError: (error) =>
      toast.error({
        title: "Décision non enregistrée",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });
  const ordered = sortProposals(proposals);
  const pending = ordered.filter((p) => p.status === "pending");
  const decided = ordered.filter((p) => p.status !== "pending").slice(0, 5);
  return (
    <Card className="flex flex-col gap-1.5 px-5 py-[18px]" data-testid="synonym-queue">
      <SectionTitle count={pending.length} className="pb-1.5">
        Synonymes proposés par les analysts
      </SectionTitle>
      {loading ? <div className="h-16 animate-pulse rounded-lg bg-sunk" /> : null}
      {!loading && pending.length === 0 ? (
        <p className="m-0 py-2 text-ui text-tx3">
          Aucun synonyme en attente. Les analysts en proposent en précisant leurs questions.
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {[...pending, ...decided].map((proposal) => {
          const warnings = proposal.status === "pending" ? synonymWarnings(layer, proposal) : [];
          return (
            <motion.div
              key={proposal.id}
              layout
              transition={springs.settle}
              data-testid={`synonym-${proposal.synonym}`}
              className="flex items-center gap-3.5 py-2.5"
            >
              <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-sunk text-tx2">
                <Tag size={16} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14.5px]">
                  <span className="font-semibold">« {proposal.synonym} »</span> pour{" "}
                  {targetLabel(layer, proposal.target)}
                </span>
                <span className="text-meta text-tx3">
                  Proposé {formatAgo(proposal.created_at)}
                  {proposal.mart_request_id ? " · après une précision de l’agent" : ""}
                </span>
                {warnings.map((warning) => (
                  <span
                    key={warning}
                    className="flex items-start gap-1.5 pt-0.5 text-meta text-prop-fg"
                  >
                    <Warning size={15} weight="fill" className="mt-px flex-none" />
                    {warning}
                  </span>
                ))}
              </div>
              {proposal.status === "pending" ? (
                <>
                  <Button
                    variant="quiet"
                    size="md"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: proposal.id, accept: false })}
                  >
                    Rejeter
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: proposal.id, accept: true })}
                  >
                    Valider
                  </Button>
                </>
              ) : (
                <StatusBadge
                  kind={proposal.status === "accepted" ? "val" : "rej"}
                  label={proposal.status === "accepted" ? "Validé" : "Rejeté"}
                  size={13}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Card>
  );
}

/** Side panel: label, description, synonyms, hidden; additivity follows the formula. */
function EditPanel({
  layer,
  row,
  tab,
  readOnly,
  onClose,
}: {
  layer: SemanticLayer;
  row: SemanticRow;
  tab: Tab;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { project } = useShell();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(row.label);
  const [description, setDescription] = useState(row.description);
  const [synonyms, setSynonyms] = useState(row.synonyms);
  const [hidden, setHidden] = useState(row.hidden);
  const [term, setTerm] = useState("");
  const metric = tab === "metrics" ? findMetric(layer, row.key) : undefined;
  const attribute = tab === "dimensions" ? findAttribute(layer, row.key) : null;
  const changed =
    label !== row.label ||
    description !== row.description ||
    hidden !== row.hidden ||
    synonyms.join("\u0000") !== row.synonyms.join("\u0000");

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH("/projects/{project_id}/semantic-layer", {
          params: { path: { project_id: project.id } },
          body: {
            overrides: [
              {
                target: row.target,
                label: label.trim() || row.label,
                description,
                synonyms,
                hidden,
                add_synonyms: [],
              },
            ],
          },
        }),
      ),
    onSuccess: (saved) => {
      toast.success({
        title: tab === "metrics" ? "Métrique enregistrée" : "Dimension enregistrée",
        description: `${label} · version ${saved.version}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["semantic", project.id] });
      void queryClient.invalidateQueries({ queryKey: keys.semanticVersions(project.id) });
    },
    onError: (error) =>
      toast.error({
        title: "Enregistrement refusé",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });

  const addTerm = () => {
    const value = term.trim();
    if (value && !synonyms.includes(value)) setSynonyms([...synonyms, value]);
    setTerm("");
  };
  const field =
    "flex min-h-[42px] items-center rounded-[11px] bg-node px-3 py-2 text-[14.5px] shadow-[inset_0_0_0_1px_var(--edge)]";

  return (
    <>
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-2" data-testid="semantic-panel">
        <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-acc-soft text-acc-tx">
          {tab === "metrics" ? (
            <FunctionIcon size={20} weight="duotone" />
          ) : (
            <Tag size={20} weight="duotone" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-panel font-semibold">{row.label}</div>
          <div className="truncate text-meta text-tx3">
            {tab === "metrics" ? `Métrique · ${row.id}` : `Dimension · ${row.formula}`}
          </div>
        </div>
        <Button variant="quiet" size="icon-sm" aria-label="Fermer" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 pt-3 pb-5">
        <label className="flex flex-col gap-1.5 text-meta font-semibold text-tx2">
          Libellé métier
          <Input
            variant="outline"
            value={label}
            disabled={readOnly}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-meta font-semibold text-tx2">
          Description
          <textarea
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            className="resize-y rounded-[11px] border-0 bg-node px-3 py-2.5 font-sans text-[14.5px] leading-[1.45] font-normal text-tx shadow-[inset_0_0_0_1px_var(--edge)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--edge),0_0_0_2px_var(--acc)]"
          />
        </label>
        {metric ? (
          <>
            <div className="flex flex-col gap-1.5 text-meta font-semibold text-tx2">
              Formule
              <span className={cn(field, "font-mono text-[13px] font-normal")}>
                {metric.formula}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 text-meta font-semibold text-tx2">
              Format
              <span className={cn(field, "font-normal")}>{formatLabel(metric)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-meta font-semibold text-tx2">Additivité</span>
              <div className="flex gap-0.5 rounded-[11px] bg-sunk p-[3px]" aria-label="Additivité">
                {(["additive", "semi_additive", "non_additive"] as const).map((value) => (
                  <span
                    key={value}
                    aria-current={value === metric.additivity || undefined}
                    className={cn(
                      "flex h-8 flex-1 items-center justify-center rounded-sm px-2 text-[13px] font-medium whitespace-nowrap",
                      value === metric.additivity ? "bg-node text-tx shadow-sm" : "text-tx3",
                    )}
                  >
                    {ADDITIVITY[value].label}
                  </span>
                ))}
              </div>
              <span className="text-meta leading-[1.45] text-tx3">
                {ADDITIVITY[metric.additivity].description} Elle découle de la formule : pour la
                changer, modifiez la mesure dans le modèle.
              </span>
            </div>
          </>
        ) : null}
        {attribute ? (
          <div className="flex flex-col gap-1.5 text-meta font-semibold text-tx2">
            Colonne
            <span className={cn(field, "font-mono text-[13px] font-normal")}>{row.formula}</span>
            {attribute.attribute.pii ? (
              <span className="font-normal text-pii-fg">
                Donnée personnelle : jamais montrée en clair.
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-meta font-semibold text-tx2">Synonymes</span>
          <div className="flex flex-wrap gap-1.5" data-testid="synonym-chips">
            {synonyms.map((synonym) => (
              <span
                key={synonym}
                className="flex h-[30px] items-center gap-1.5 rounded-sm bg-sunk pr-1.5 pl-2.5 text-[13.5px]"
              >
                {synonym}
                {!readOnly ? (
                  <button
                    type="button"
                    aria-label={`Retirer ${synonym}`}
                    onClick={() => setSynonyms(synonyms.filter((s) => s !== synonym))}
                    className="flex border-0 bg-transparent p-0 text-tx3 hover:text-tx"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          {!readOnly ? (
            <div className="flex gap-2">
              <Input
                variant="outline"
                placeholder="Ajouter un synonyme"
                aria-label="Nouveau synonyme"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTerm();
                  }
                }}
              />
              <Button variant="tonal" size="md" className="h-[42px]" onClick={addTerm}>
                <Plus size={14} />
                Ajouter
              </Button>
            </div>
          ) : null}
        </div>
        <label className="flex items-start gap-2.5 text-[13.5px] text-tx2">
          <Checkbox
            checked={hidden}
            disabled={readOnly}
            onCheckedChange={(checked) => setHidden(checked === true)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-tx">Masquer ce champ</span>
            <span className="block text-meta text-tx3">
              Les analysts et l’agent ne le voient plus ; il reste dans le modèle.
            </span>
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2 bg-sunk px-5 py-3.5">
        <Button variant="quiet" size="lg" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={readOnly || !changed}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Enregistrer
        </Button>
      </div>
    </>
  );
}
