"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CaretRight,
  ChatCircleText,
  CheckCircle,
  DownloadSimple,
  Hourglass,
  ListMagnifyingGlass,
  Question,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { Card, EmptyState, ScreenError, ScreenSkeleton } from "@/components/screens/screen";
import { DataTable } from "@/components/screens/data-table";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { CheckBadge } from "@/components/ui/check-badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HatchGlyph, Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { useAgentActions, useAgentRun, useMartRequest } from "@/lib/agent/queries";
import { agentSteps } from "@/lib/agent/steps";
import {
  DESTINATIONS,
  awaitsApproval,
  controlLabel,
  controlOutcome,
  controlsSummary,
  destinationLabel,
  latestIteration,
  lineage,
  mainTotal,
  martBadge,
  martTitle,
  previewedIteration,
  refineSuggestions,
  summaryParts,
  type Destination,
  type MartIteration,
  type MartRequest,
} from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import { formatAgo, formatDateTime, formatInteger, plural } from "@/lib/format";
import { downloadFile, useSemanticLayer } from "@/lib/project/queries";

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Réessayez dans un instant.";
}

function Banner({
  tone,
  icon,
  title,
  children,
  action,
  testId,
}: {
  tone: "run" | "prop" | "val" | "err" | "queue";
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl px-[18px] py-3.5",
        tone === "run" && "bg-run-bg text-run-fg",
        tone === "prop" && "bg-prop-bg text-prop-fg",
        tone === "val" && "bg-val-bg text-val-fg",
        tone === "err" && "bg-err-bg text-err-fg",
        tone === "queue" && "bg-sunk text-tx2",
      )}
    >
      <span className="flex-none">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold">{title}</span>
        {children ? <span className="text-ui text-tx2">{children}</span> : null}
      </div>
      {action}
    </div>
  );
}

/** « Ce que Forja a compris »: the summary with each term underlined and correctable. */
function Understood({
  iteration,
  editable,
  busy,
  onCorrect,
}: {
  iteration: MartIteration;
  editable: boolean;
  busy: boolean;
  onCorrect: (term: number, option: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const parts = summaryParts(iteration);
  const term = open !== null ? parts[open]?.term : null;
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="understood">
      <h2 className="m-0 text-section font-semibold">Ce que Forja a compris</h2>
      <p className="m-0 text-[17px] leading-[1.6]">
        {parts.map((part, index) =>
          part.term && editable ? (
            <button
              key={index}
              type="button"
              disabled={busy}
              aria-expanded={open === index}
              aria-label={`${part.text} : corriger`}
              data-testid="summary-term"
              onClick={() => setOpen(open === index ? null : index)}
              className={cn(
                "mx-[-1px] rounded-md border-0 border-b-2 border-solid border-acc bg-transparent px-[3px] font-sans text-[17px] font-semibold text-tx transition-colors duration-200",
                open === index ? "bg-acc-soft" : "hover:bg-acc-soft",
              )}
            >
              {part.text}
            </button>
          ) : (
            <span key={index} className={part.term ? "font-semibold" : undefined}>
              {part.text}
            </span>
          ),
        )}
      </p>
      {term && open !== null ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[14px] bg-sunk p-2.5"
          data-testid="term-options"
        >
          <span className="px-1.5 text-ui font-semibold text-tx2">{term.question}</span>
          {term.options?.map((option, index) => {
            const current = index === term.current;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={current}
                disabled={busy}
                onClick={() => {
                  setOpen(null);
                  if (!current) onCorrect(open, index);
                }}
                className={cn(
                  "h-[34px] rounded-[10px] border-0 px-3 font-sans text-[13.5px] font-medium transition-shadow",
                  current ? "bg-acc text-on-acc" : "bg-node text-tx shadow-sm hover:shadow-hover",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : null}
      {editable ? (
        <p className="m-0 text-meta text-tx3">
          Cliquez un terme souligné pour le corriger ; l’aperçu est recalculé en quelques secondes.
        </p>
      ) : null}
    </Card>
  );
}

function Controls({ iteration }: { iteration: MartIteration }) {
  const controls = iteration.preview?.controls ?? [];
  const [selected, setSelected] = useState(0);
  const current = controls[selected] ?? controls[0];
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="controls">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 text-section font-semibold">Contrôles de cohérence</h2>
        <span className="text-ui text-tx3">{controlsSummary(controls)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {controls.map((control, index) => (
          <CheckBadge
            key={`${control.code}-${index}`}
            outcome={controlOutcome(control)}
            label={controlLabel(control)}
            detail={control.message}
            selected={index === selected}
            onClick={() => setSelected(index)}
          />
        ))}
      </div>
      {current ? <p className="m-0 text-ui leading-normal text-tx2">{current.message}</p> : null}
    </Card>
  );
}

function Sample({ iteration, sqlVisible }: { iteration: MartIteration; sqlVisible: boolean }) {
  const [sql, setSql] = useState(false);
  const preview = iteration.preview!;
  const labels = new Map(preview.columns.map((c) => [c.name, c.label]));
  const columns = preview.columns.map((c) => c.label);
  const rows = preview.rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [labels.get(key) ?? key, value])),
  );
  const personal = (preview.pseudonymized ?? []).map((name) => labels.get(name) ?? name);
  return (
    <Card className="flex flex-col gap-2 px-5 py-[18px]" data-testid="sample">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 text-section font-semibold">Échantillon du résultat</h2>
        <span className="text-ui text-tx3">
          {plural(preview.rows.length, "ligne", "lignes")} sur {formatInteger(preview.row_count)}
        </span>
      </div>
      <DataTable
        label="Échantillon du data mart"
        columns={columns}
        rows={rows}
        personal={personal}
        maxHeight={360}
        empty="Le data mart est vide."
      />
      {personal.length ? (
        <p className="m-0 flex items-center gap-2 text-meta text-tx3">
          <span className="text-pii-fg">
            <HatchGlyph size={11} />
          </span>
          {personal.join(", ")} {personal.length > 1 ? "sont pseudonymisées" : "est pseudonymisée"}{" "}
          : identifiants stables, les vraies valeurs restent dans la source.
        </p>
      ) : null}
      {sqlVisible && iteration.sql ? (
        <>
          <button
            type="button"
            aria-expanded={sql}
            onClick={() => setSql(!sql)}
            className="flex items-center gap-2 self-start rounded-md border-0 bg-transparent px-1 py-1.5 font-sans text-ui text-tx2 hover:text-tx"
          >
            <CaretRight
              size={14}
              className={cn("transition-transform duration-200", sql && "rotate-90")}
            />
            <span className="font-semibold">Requête SQL</span>
            <span className="text-tx3">pour les équipes data</span>
          </button>
          {sql ? (
            <pre
              data-testid="preview-sql"
              className="m-0 max-h-[320px] overflow-auto rounded-[14px] bg-sunk p-4 font-mono text-mono leading-relaxed whitespace-pre text-tx2"
            >
              {iteration.sql}
            </pre>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function TotalCard({ iteration, format }: { iteration: MartIteration; format?: string | null }) {
  const total = mainTotal(iteration);
  const preview = iteration.preview!;
  const value = total
    ? format === "currency"
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(total.value)
      : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(total.value)
    : formatInteger(preview.row_count);
  const period = iteration.spec?.period?.label;
  const axes = preview.columns.filter((c) => c.kind === "axis").map((c) => c.label.toLowerCase());
  return (
    <Card className="flex flex-col gap-1 px-5 py-[18px]" data-testid="total">
      <span className="text-meta font-semibold text-tx3">
        {total ? `Total${period ? ` · ${period}` : ""} · ${total.label}` : "Lignes du data mart"}
      </span>
      <span className="text-[32px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </span>
      <span className="text-ui text-tx2">
        {plural(preview.row_count, "ligne", "lignes")}
        {axes.length ? ` · par ${axes.join(" × ")}` : ""}
      </span>
    </Card>
  );
}

function Lineage({ iteration }: { iteration: MartIteration }) {
  const nodes = lineage(iteration);
  const sources = nodes.filter((n) => n.kind !== "mart");
  const mart = nodes.find((n) => n.kind === "mart");
  const filtered = sources.filter((n) => n.detail === "filtre appliqué").map((n) => n.name);
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="lineage">
      <h2 className="m-0 text-section font-semibold">D’où viennent les chiffres</h2>
      <div className="flex flex-col items-stretch gap-2">
        <div className="grid grid-cols-2 gap-2">
          {sources.map((node) => (
            <LineageCard key={node.name} node={node} />
          ))}
        </div>
        <div className="flex justify-center" aria-hidden>
          <span className="h-5 w-px bg-acc opacity-70" />
        </div>
        {mart ? (
          <div className="mx-auto w-1/2 min-w-[150px]">
            <LineageCard node={mart} />
          </div>
        ) : null}
      </div>
      <p className="m-0 text-meta text-tx3">
        {plural(sources.length, "table du modèle", "tables du modèle")}, validées par l’équipe data.
        {filtered.length ? ` Les filtres s’appliquent sur ${filtered.join(", ")}.` : ""}
      </p>
    </Card>
  );
}

function LineageCard({ node }: { node: ReturnType<typeof lineage>[number] }) {
  const glyph = node.kind === "fact" ? "F" : node.kind === "mart" ? "M" : "D";
  return (
    <div
      className="flex h-[50px] min-w-0 items-center gap-2 rounded-[10px] bg-node py-0 pr-2.5 pl-3 shadow-[inset_3px_0_0_var(--val-fg),0_0_0_1px_var(--hair)]"
      style={
        node.kind === "mart"
          ? { boxShadow: "inset 3px 0 0 var(--prop-fg), 0 0 0 1px var(--hair)" }
          : undefined
      }
    >
      <span
        className={cn(
          "flex size-6 flex-none items-center justify-center rounded-[7px] text-[11px] font-bold",
          node.kind === "fact" && "bg-tx text-node",
          node.kind === "mart" && "bg-acc-soft text-acc-tx",
          node.kind === "dimension" && "bg-sunk text-tx2",
        )}
      >
        {glyph}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-[12.5px] text-tx">{node.name}</span>
        <span className="truncate text-[12px] text-tx3">{node.detail}</span>
      </span>
    </div>
  );
}

function Destinations({
  value,
  onChange,
  disabled,
}: {
  value: Destination;
  onChange: (destination: Destination) => void;
  disabled: boolean;
}) {
  return (
    <Card className="flex flex-col gap-2 px-5 py-[18px]" data-testid="destinations">
      <h2 className="m-0 text-section font-semibold">Publier vers</h2>
      <div role="radiogroup" aria-label="Destination" className="flex flex-col gap-2">
        {DESTINATIONS.map((destination) => {
          const on = destination.id === value;
          return (
            <button
              key={destination.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(destination.id)}
              className={cn(
                "flex min-h-[50px] items-center gap-3 rounded-xl border-0 px-3 py-2 text-left font-sans text-tx transition-all duration-200",
                on
                  ? "bg-acc-soft shadow-[inset_0_0_0_1.5px_var(--acc)]"
                  : "bg-transparent shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-sunk",
                "disabled:cursor-default",
              )}
            >
              <span
                className={cn(
                  "size-[18px] flex-none rounded-full bg-node",
                  on
                    ? "shadow-[inset_0_0_0_5px_var(--acc)]"
                    : "shadow-[inset_0_0_0_1.5px_var(--edge)]",
                )}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-[14.5px] font-semibold">{destination.label}</span>
                <span className="text-[13px] text-tx3">{destination.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function RefinePanel({
  request,
  iteration,
  busy,
  onClose,
}: {
  request: MartRequest;
  iteration: MartIteration;
  busy: boolean;
  onClose: () => void;
}) {
  const shell = useShell();
  const layer = useSemanticLayer(shell.project.id);
  const { refine } = useAgentActions(shell.project.id);
  const [text, setText] = useState("");
  const send = (instruction: string) =>
    refine.mutate(
      { martId: request.id, instruction },
      {
        onSuccess: () => {
          setText("");
          onClose();
        },
        onError: (error) =>
          toast.error({ title: "Ajustement refusé", description: errorText(error) }),
      },
    );
  const suggestions = refineSuggestions(iteration.spec, layer.data ?? null);
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]" data-testid="refine-panel">
      <div className="flex items-center">
        <h2 className="m-0 text-section font-semibold">Affiner la demande</h2>
        <Button
          variant="quiet"
          size="icon-sm"
          className="ml-auto"
          aria-label="Fermer"
          onClick={onClose}
        >
          <XCircle size={18} />
        </Button>
      </div>
      <p className="m-0 text-ui text-tx2">
        Décrivez le changement en français. Forja reconstruit l’aperçu ; rien n’est publié.
      </p>
      <textarea
        aria-label="Changement à apporter"
        value={text}
        maxLength={1000}
        onChange={(event) => setText(event.target.value)}
        placeholder="Par exemple : seulement le T1, ajoute le nombre de commandes"
        className="min-h-[84px] w-full resize-y rounded-[11px] border-0 bg-sunk p-3 font-sans text-body text-tx outline-none placeholder:text-tx3 focus-visible:shadow-[0_0_0_2px_var(--acc)]"
      />
      {suggestions.length ? (
        <div className="flex flex-col gap-2">
          <span className="text-meta font-semibold text-tx3">Suggestions</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy || refine.isPending}
                onClick={() => send(suggestion)}
                className="h-[34px] rounded-[10px] border-0 bg-node px-3 font-sans text-[13.5px] font-medium text-tx shadow-sm hover:shadow-hover"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Button
        variant="primary"
        size="lg"
        className="self-start"
        disabled={text.trim().length < 2 || busy}
        loading={refine.isPending}
        onClick={() => send(text.trim())}
      >
        Recalculer l’aperçu
      </Button>
    </Card>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  onReject,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReject: (reason: string) => void;
  saving: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeter ce data mart</DialogTitle>
          <DialogDescription>
            Le motif est montré à l’auteur de la demande, qui pourra poser une nouvelle question.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <textarea
            aria-label="Motif du rejet"
            autoFocus
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Par exemple : doublon du data mart des ventes mensuelles"
            className="min-h-[96px] w-full resize-y rounded-[11px] border-0 bg-sunk p-3 font-sans text-body text-tx outline-none placeholder:text-tx3 focus-visible:shadow-[0_0_0_2px_var(--acc)]"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="quiet" size="lg" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="lg"
            disabled={reason.trim().length < 3}
            loading={saving}
            onClick={() => onReject(reason.trim())}
          >
            Rejeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What runs now, in one line: the step of the job recomputing the preview. */
function runningStep(iteration: MartIteration, job: ReturnType<typeof useAgentRun>["data"]) {
  const step = agentSteps(iteration, job).find((s) => s.state === "run");
  return step ? step.title : "Mise en file";
}

/**
 * /projects/[id]/marts/[martId]/preview (C5 structure): what Forja understood, with its
 * terms to correct, the consistency checks, a sample, where the figures come from, the
 * destination, then « Valider et publier »; for an engineer, Approuver or Rejeter.
 */
export function PreviewScreen({ martId }: { martId: string }) {
  const shell = useShell();
  const request = useMartRequest(martId);
  const layer = useSemanticLayer(shell.project.id);
  const actions = useAgentActions(shell.project.id);
  const data = request.data;
  const latest = data ? latestIteration(data) : null;
  const run = useAgentRun(latest?.status === "processing" ? latest.job_id : null);
  const [refining, setRefining] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [chosen, setChosen] = useState<Destination | null>(null);
  const base = `/projects/${shell.project.id}`;

  if (request.isPending) return <ScreenSkeleton aside />;
  if (request.isError || !data) {
    if (request.error instanceof ApiError && request.error.status === 404) {
      return (
        <div className="p-7">
          <EmptyState
            icon={ListMagnifyingGlass}
            title="Aperçu introuvable"
            description="Cette demande n’existe pas, ou elle appartient à quelqu’un d’autre."
            action={
              <Button asChild variant="primary" size="lg">
                <Link href={`${base}/marts`}>Mes data marts</Link>
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="p-7">
        <ScreenError error={request.error} onRetry={() => void request.refetch()} />
      </div>
    );
  }

  const iteration = previewedIteration(data);
  const owner = data.owner_id === shell.me.user.id;
  const engineer = shell.role !== "analyst";
  const busy = latest?.status === "processing";
  const editable = owner && data.status !== "rejected";
  const approving = engineer && awaitsApproval(data);
  const badge = martBadge(data);
  const destination: Destination = chosen ?? data.destination ?? "powerbi";
  const failing = iteration?.preview?.controls?.some((c) => c.status === "error") ?? false;
  const format = layer.data?.metrics?.find((m) => m.name === iteration?.spec?.metrics[0])?.format;

  if (!iteration) {
    return (
      <div className="flex flex-col gap-4 px-7 pt-2.5 pb-7">
        <EmptyState
          icon={busy ? Hourglass : ChatCircleText}
          title={busy ? "L’aperçu se prépare" : "Pas encore d’aperçu"}
          description={
            busy
              ? "Forja construit le data mart et ses contrôles. Suivez l’avancement dans la conversation."
              : "La demande attend une précision, ou elle n’a pas pu être traitée : reprenez la conversation."
          }
          action={
            <Button asChild variant="primary" size="lg">
              <Link href={`${base}/ask/${data.id}`}>Ouvrir la conversation</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const validate = () =>
    actions.validate.mutate(
      { martId: data.id, destination },
      {
        onSuccess: (result) =>
          result.status === "validated" && !result.approved_at
            ? toast.info({
                title: "Envoyé pour approbation",
                description: "Un engineer du projet vérifie l’aperçu avant la publication",
              })
            : toast.success({
                title: "Publication lancée",
                description: `${martTitle(result)} · ${destinationLabel(destination)}`,
              }),
        onError: (error) =>
          toast.error({ title: "Validation refusée", description: errorText(error) }),
      },
    );
  const exportAs = async (formatName: "csv" | "parquet") => {
    if (!data.published_table_id) return;
    try {
      const file = await downloadFile(
        `/tables/${data.published_table_id}/export?format=${formatName}`,
        `${data.published_name ?? "data_mart"}.${formatName}`,
      );
      toast.success({
        title: `Export ${formatName === "csv" ? "CSV" : "Parquet"} prêt`,
        description: file,
      });
    } catch (error) {
      toast.error({ title: "Export impossible", description: errorText(error) });
    }
  };

  const actionsBar = approving ? (
    <>
      <Button variant="danger-quiet" size="lg" onClick={() => setRejecting(true)}>
        Rejeter
      </Button>
      <Button
        variant="primary"
        size="lg"
        loading={actions.approve.isPending}
        onClick={() =>
          actions.approve.mutate(data.id, {
            onSuccess: () =>
              toast.success({ title: "Data mart approuvé", description: "Publication en cours" }),
            onError: (error) =>
              toast.error({ title: "Approbation refusée", description: errorText(error) }),
          })
        }
      >
        Approuver et publier
      </Button>
    </>
  ) : editable ? (
    <>
      {data.status === "published" && data.published_table_id ? (
        <>
          <Button variant="tonal" size="lg" onClick={() => void exportAs("csv")}>
            <DownloadSimple size={17} />
            CSV
          </Button>
          <Button variant="tonal" size="lg" onClick={() => void exportAs("parquet")}>
            <DownloadSimple size={17} />
            Parquet
          </Button>
        </>
      ) : null}
      <Button
        variant="tonal"
        size="lg"
        aria-expanded={refining}
        disabled={busy}
        onClick={() => setRefining(!refining)}
      >
        Affiner
      </Button>
      {data.status === "previewed" ? (
        <Button
          variant="primary"
          size="lg"
          disabled={busy || failing}
          loading={actions.validate.isPending}
          onClick={validate}
        >
          Valider et publier
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-4 px-7 pt-2.5 pb-7 max-sm:px-4" data-testid="preview-screen">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex">
            <StatusBadge kind={badge.kind} label={badge.label} size={13} />
          </span>
          <h1 className="m-0 text-title font-semibold">{martTitle(data)}</h1>
          <span className="text-ui text-tx3">
            {owner ? "Votre demande" : `Demandé par ${data.owner_email ?? "un analyst"}`} · version{" "}
            {iteration.version} · {formatAgo(iteration.created_at)}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">{actionsBar}</div>
      </div>

      {busy && latest ? (
        <Banner
          tone="run"
          testId="preview-busy"
          icon={<Spinner size={16} />}
          title="Recalcul de l’aperçu"
          action={
            <Link href={`${base}/ask/${data.id}`} className="text-meta font-medium text-acc-tx">
              Suivre dans la conversation
            </Link>
          }
        >
          {latest.instruction} · {runningStep(latest, run.data)}
        </Banner>
      ) : latest && latest !== iteration && latest.status === "clarification" ? (
        <Banner
          tone="prop"
          icon={<Question size={20} weight="bold" />}
          title="Forja a besoin d’une précision"
          action={
            <Button asChild variant="secondary" size="md">
              <Link href={`${base}/ask/${data.id}`}>Répondre</Link>
            </Button>
          }
        >
          {latest.clarification?.question}
        </Banner>
      ) : latest &&
        latest !== iteration &&
        (latest.status === "refused" || latest.status === "failed") ? (
        <Banner
          tone="queue"
          icon={<WarningCircle size={20} />}
          title="Le dernier ajustement n’a pas abouti"
        >
          {latest.refusal ?? (latest.error === "annulée" ? "Annulé." : latest.error)} L’aperçu
          ci-dessous reste celui de la version {iteration.version}.
        </Banner>
      ) : null}
      {data.status === "validated" && !data.publish_job_id ? (
        <Banner
          tone="queue"
          testId="awaiting-approval"
          icon={<Hourglass size={20} />}
          title="En attente d’approbation"
        >
          {approving
            ? `Validé par ${data.owner_email ?? "l’auteur"} ${
                data.validated_at ? formatAgo(data.validated_at) : ""
              } pour ${destinationLabel(data.destination)}.`
            : "Un engineer du projet vérifie l’aperçu avant la publication ; une notification annonce sa décision."}
        </Banner>
      ) : data.status === "validated" && data.publish_error ? (
        <Banner
          tone="err"
          icon={<WarningCircle size={20} weight="fill" />}
          title="Échec de la publication"
        >
          {data.publish_error}
        </Banner>
      ) : data.status === "validated" ? (
        <Banner tone="run" icon={<Spinner size={16} />} title="Publication en cours">
          Construction du modèle, base serving et exports.
        </Banner>
      ) : data.status === "published" ? (
        <Banner
          tone="val"
          testId="published"
          icon={<CheckCircle size={20} weight="fill" />}
          title={`Publié vers ${destinationLabel(data.destination, true)}`}
        >
          {data.published_name ? `Table ${data.published_name}` : "Data mart publié"}
          {data.published_at ? ` · ${formatDateTime(data.published_at)}` : ""} · actualisé à chaque
          run du modèle.
        </Banner>
      ) : data.status === "rejected" ? (
        <Banner tone="err" icon={<XCircle size={20} weight="fill" />} title="Data mart rejeté">
          {data.rejection_reason || "Sans motif."}
        </Banner>
      ) : null}

      <div
        className={cn(
          "grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]",
          busy && "opacity-60 transition-opacity",
        )}
      >
        <div className="flex min-w-0 flex-col gap-5">
          {refining && editable ? (
            <RefinePanel
              request={data}
              iteration={iteration}
              busy={busy}
              onClose={() => setRefining(false)}
            />
          ) : null}
          <Understood
            iteration={iteration}
            editable={editable}
            busy={busy || actions.correct.isPending}
            onCorrect={(term, option) =>
              actions.correct.mutate(
                { martId: data.id, version: iteration.version, term, option },
                {
                  onError: (error) =>
                    toast.error({ title: "Correction refusée", description: errorText(error) }),
                },
              )
            }
          />
          <Controls key={iteration.version} iteration={iteration} />
          <Sample iteration={iteration} sqlVisible />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <TotalCard iteration={iteration} format={format} />
          <Lineage iteration={iteration} />
          <Destinations
            value={destination}
            onChange={setChosen}
            disabled={!editable || data.status !== "previewed"}
          />
        </div>
      </div>
      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        saving={actions.reject.isPending}
        onReject={(reason) =>
          actions.reject.mutate(
            { martId: data.id, reason },
            {
              onSuccess: () => {
                setRejecting(false);
                toast.info({ title: "Data mart rejeté", description: reason });
              },
              onError: (error) =>
                toast.error({ title: "Rejet impossible", description: errorText(error) }),
            },
          )
        }
      />
    </div>
  );
}
