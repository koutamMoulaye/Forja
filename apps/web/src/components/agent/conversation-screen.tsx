"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ChartPieSlice,
  ChatCircleText,
  Lightbulb,
  PlusCircle,
} from "@phosphor-icons/react";
import { Card, EmptyState, ScreenError } from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import {
  useAgentActions,
  useAgentOverview,
  useAgentRun,
  useMartRequest,
} from "@/lib/agent/queries";
import {
  controlsSummary,
  destinationLabel,
  freshnessLabel,
  latestIteration,
  martBadge,
  martTitle,
  pickSuggestions,
  type MartIteration,
  type MartRequest,
} from "@/lib/agent/view";
import { askNotificationPermission, useWatched } from "@/lib/agent/watch";
import { cn } from "@/lib/cn";
import { formatAgo, formatWhen, plural } from "@/lib/format";
import { useSemanticLayer } from "@/lib/project/queries";
import { AgentAvatar, PreparationCard } from "./preparation-card";
import { ClarifyOptions } from "./clarify-options";
import { Composer } from "./composer";
import { SuggestionChips } from "./home-screen";

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Réessayez dans un instant.";
}

function UserBubble({ children, current }: { children: React.ReactNode; current: boolean }) {
  return (
    <div
      data-testid="user-message"
      className={cn(
        "max-w-[560px] self-end rounded-[22px_22px_6px_22px] px-[18px] py-3 text-[16px] leading-snug",
        current ? "bg-acc text-on-acc" : "bg-sunk text-tx",
      )}
    >
      {children}
    </div>
  );
}

/** What the user sent for a version: the question, the option chosen, the adjustment. */
function userText(iteration: MartIteration): string {
  return iteration.instruction;
}

/** An earlier version, folded to one line: what it gave. */
function EarlierResult({
  iteration,
  previewHref,
}: {
  iteration: MartIteration;
  previewHref: string;
}) {
  const text =
    iteration.status === "previewed"
      ? (iteration.summary ?? "Aperçu préparé")
      : iteration.status === "clarification"
        ? (iteration.clarification?.question ?? "Une précision demandée")
        : iteration.status === "refused"
          ? (iteration.refusal ?? "Hors du périmètre des données")
          : iteration.status === "failed"
            ? iteration.error === "annulée"
              ? "Préparation annulée"
              : "Préparation interrompue"
            : "En préparation";
  return (
    <div className="flex gap-3">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-node px-4 py-3.5 shadow-sm">
        <ChartPieSlice size={22} className="flex-none text-tx2" />
        <span className="min-w-0 flex-1 text-[15px]">
          <span className="font-semibold">Version {iteration.version}</span> · {text}
        </span>
        {iteration.status === "previewed" ? (
          <Link href={previewHref} className="text-meta font-medium whitespace-nowrap text-acc-tx">
            Aperçu
          </Link>
        ) : (
          <span className="text-[13px] whitespace-nowrap text-tx3">
            {formatWhen(iteration.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function ReadyCard({ request, iteration }: { request: MartRequest; iteration: MartIteration }) {
  const shell = useShell();
  const preview = iteration.preview;
  return (
    <div className="flex gap-3" data-testid="ready-card">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 rounded-2xl bg-node px-5 py-[18px] shadow-float">
        <div className="min-w-0 flex-1">
          <div className="text-[16.5px] font-semibold">Votre data mart est prêt à vérifier</div>
          <div className="text-[14px] text-tx2">
            {preview ? plural(preview.row_count, "ligne", "lignes") : ""}
            {preview?.controls?.length ? ` · ${controlsSummary(preview.controls)}` : ""} · rien
            n’est publié pour l’instant
          </div>
        </div>
        <Button asChild variant="primary" size="xl" className="rounded-[14px]">
          <Link href={`/projects/${shell.project.id}/marts/${request.id}/preview`}>
            Ouvrir l’aperçu
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** A clean refusal: why, then what Forja can measure, as questions to click. */
function RefusalCard({
  iteration,
  suggestions,
  metrics,
  onAsk,
}: {
  iteration: MartIteration;
  suggestions: string[];
  metrics: string[];
  onAsk: (question: string) => void;
}) {
  return (
    <div className="flex gap-3" data-testid="refusal">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="m-0 text-[16px] leading-normal text-tx">
          {iteration.refusal ?? "Cette demande sort du périmètre des données du projet."}
        </p>
        {metrics.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-meta font-semibold text-tx3">Ce que Forja sait mesurer</span>
            <span className="text-[14.5px] text-tx2">{metrics.join(" · ")}</span>
          </div>
        ) : null}
        {suggestions.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-meta font-semibold text-tx3">Essayez par exemple</span>
            <SuggestionChips suggestions={suggestions} onPick={onAsk} align="start" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** After an option was picked: offer the word as a synonym, for the data team to review. */
function SynonymOffer({ request, iteration }: { request: MartRequest; iteration: MartIteration }) {
  const shell = useShell();
  const { proposeSynonym } = useAgentActions(shell.project.id);
  const [done, setDone] = useState(false);
  const iterations = request.iterations ?? [];
  const asked = iterations.find((it) => it.version === iteration.version - 1)?.clarification;
  const option = asked?.options.find((o) => o.label === iteration.instruction);
  const target = option?.ref;
  if (!asked || !option || !target || !/^(metric|attribute|dimension):/.test(target) || done) {
    return null;
  }
  return (
    <div className="flex gap-3" data-testid="synonym-offer">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-[18px] bg-acc-soft px-4 py-3">
        <Lightbulb size={20} weight="duotone" className="flex-none text-acc-tx" />
        <span className="min-w-0 flex-1 text-[14.5px]">
          Dans ce projet, « {asked.term} » veut-il toujours dire {option.label.toLowerCase()} ?
        </span>
        <Button
          variant="secondary"
          size="md"
          loading={proposeSynonym.isPending}
          onClick={() =>
            proposeSynonym.mutate(
              { target, synonym: asked.term, martId: request.id },
              {
                onSuccess: () => {
                  setDone(true);
                  toast.success({
                    title: "Synonyme proposé",
                    description: "L’équipe data le validera dans la couche sémantique",
                  });
                },
                onError: (error) =>
                  toast.error({ title: "Proposition refusée", description: errorText(error) }),
              },
            )
          }
        >
          Proposer ce synonyme
        </Button>
        <Button variant="quiet" size="md" onClick={() => setDone(true)}>
          Non merci
        </Button>
      </div>
    </div>
  );
}

function RequestStatusLine({ request }: { request: MartRequest }) {
  const shell = useShell();
  if (!["validated", "published", "rejected"].includes(request.status ?? "")) return null;
  const badge = martBadge(request);
  const text =
    request.status === "published"
      ? `Publié${request.destination ? ` vers ${destinationLabel(request.destination)}` : ""}${
          request.published_at ? ` · ${formatAgo(request.published_at)}` : ""
        }`
      : request.status === "rejected"
        ? `Rejeté${request.rejection_reason ? ` : ${request.rejection_reason}` : ""}`
        : badge.label;
  return (
    <div className="flex gap-3" data-testid="request-status">
      <span className="w-[34px] flex-none" />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-node px-4 py-3.5 shadow-sm">
        <StatusBadge kind={badge.kind} label={badge.label} size={13} />
        <span className="min-w-0 flex-1 truncate text-[14.5px] text-tx2">{text}</span>
        <Link
          href={`/projects/${shell.project.id}/marts/${request.id}/preview`}
          className="text-meta font-medium whitespace-nowrap text-acc-tx"
        >
          Voir l’aperçu
        </Link>
      </div>
    </div>
  );
}

function Thread({
  request,
  latestJob,
  onAsk,
}: {
  request: MartRequest;
  latestJob: ReturnType<typeof useAgentRun>["data"];
  onAsk: (question: string) => void;
}) {
  const shell = useShell();
  const actions = useAgentActions(shell.project.id);
  const overview = useAgentOverview(shell.project.id);
  const layer = useSemanticLayer(shell.project.id);
  const { ids: watched, toggle } = useWatched(shell.me.user.id);
  const iterations = request.iterations ?? [];
  const last = iterations.length - 1;
  const previewHref = `/projects/${shell.project.id}/marts/${request.id}/preview`;
  const metrics = (layer.data?.metrics ?? []).filter((m) => !m.hidden).map((m) => m.label);

  return (
    <>
      {iterations.map((iteration, index) => {
        const current = index === last;
        return (
          <div key={iteration.version} className="flex flex-col gap-[18px]">
            {index === 0 || iteration.kind !== "answer" ? (
              <div className="py-2 text-center text-[13px] text-tx3">
                {formatWhen(iteration.created_at)}
              </div>
            ) : null}
            <UserBubble current={current}>{userText(iteration)}</UserBubble>
            {iteration.kind === "answer" ? (
              <SynonymOffer request={request} iteration={iteration} />
            ) : null}
            {current ? (
              <>
                {iteration.status !== "refused" ? (
                  <PreparationCard
                    iteration={iteration}
                    job={latestJob}
                    watched={watched.has(request.id)}
                    onWatch={() => {
                      const on = !watched.has(request.id);
                      toggle(request.id, on);
                      if (on) askNotificationPermission();
                    }}
                    onCancel={() => {
                      if (iteration.job_id) actions.cancel.mutate(iteration.job_id);
                    }}
                    cancelling={actions.cancel.isPending}
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    <AgentAvatar />
                    <div className="pt-1.5 text-[16px] font-semibold">
                      Je ne peux pas répondre à cette demande
                    </div>
                  </div>
                )}
                {iteration.status === "clarification" ? (
                  <div className="flex gap-3">
                    <span className="w-[34px] flex-none" />
                    <ClarifyOptions
                      iteration={iteration}
                      disabled={actions.answer.isPending}
                      picked={
                        actions.answer.isPending ? (actions.answer.variables?.option ?? null) : null
                      }
                      onPick={(option) =>
                        actions.answer.mutate(
                          { martId: request.id, option },
                          {
                            onError: (error) =>
                              toast.error({
                                title: "Réponse refusée",
                                description: errorText(error),
                              }),
                          },
                        )
                      }
                    />
                  </div>
                ) : null}
                {iteration.status === "refused" ? (
                  <RefusalCard
                    iteration={iteration}
                    metrics={metrics}
                    suggestions={pickSuggestions(overview.data, [request.question])}
                    onAsk={onAsk}
                  />
                ) : null}
                {iteration.status === "previewed" && request.status === "previewed" ? (
                  <ReadyCard request={request} iteration={iteration} />
                ) : null}
              </>
            ) : (
              <EarlierResult iteration={iteration} previewHref={previewHref} />
            )}
          </div>
        );
      })}
      <RequestStatusLine request={request} />
    </>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-12 w-80 self-end rounded-[22px]" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

/**
 * The business agent (C4 structure, S9 on a tablet): the conversation of one request,
 * version by version, and the field to ask, answer or refine.
 */
export function ConversationScreen({ conversationId }: { conversationId?: string }) {
  const shell = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get("q") ?? "";
  const actions = useAgentActions(shell.project.id);
  const overview = useAgentOverview(shell.project.id);
  const request = useMartRequest(conversationId ?? null);
  const data = request.data;
  const latest = data ? latestIteration(data) : null;
  const run = useAgentRun(latest?.job_id);
  const bottom = useRef<HTMLDivElement>(null);
  const versions = data?.iterations?.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [versions, latest?.status]);

  const askNew = (question: string) =>
    actions.ask.mutate(question, {
      onSuccess: (created) => router.push(`/projects/${shell.project.id}/ask/${created.id}`),
      onError: (error) =>
        toast.error({ title: "Question non envoyée", description: errorText(error) }),
    });

  // What the field does: answer the question, refine the preview, or ask anew.
  const busy = latest?.status === "processing";
  const closed = data?.status === "rejected" || data?.status === "published";
  const mode: "ask" | "answer" | "refine" =
    !data || closed
      ? "ask"
      : latest?.status === "clarification"
        ? "answer"
        : data.status === "previewed" || data.status === "validated"
          ? "refine"
          : "ask";
  const send = (text: string) => {
    if (!data || mode === "ask") return askNew(text);
    const onError = (error: unknown) =>
      toast.error({ title: "Demande non envoyée", description: errorText(error) });
    if (mode === "answer") actions.answer.mutate({ martId: data.id, text }, { onError });
    else actions.refine.mutate({ martId: data.id, instruction: text }, { onError });
  };
  const placeholder =
    mode === "answer"
      ? "Répondez avec vos mots, ou choisissez une option"
      : mode === "refine"
        ? "Affinez : « ajoute le nombre de commandes », « seulement le T1 »"
        : "Posez une question sur vos données";
  const pending = actions.ask.isPending || actions.answer.isPending || actions.refine.isPending;
  const suggestions = pickSuggestions(overview.data);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agent-screen">
      <div className="flex flex-none justify-center px-9 pt-2.5 max-sm:px-4">
        <div className="flex w-full max-w-[820px] flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="m-0 truncate text-[17px] font-semibold">
              {data ? martTitle(data) : "Nouvelle question"}
            </h1>
            <span className="text-meta text-tx3">
              {shell.project.name}
              {overview.data ? ` · ${freshnessLabel(overview.data.data_updated_at)}` : ""}
            </span>
          </div>
          {data ? (
            <Button asChild variant="tonal" size="md">
              <Link href={`/projects/${shell.project.id}/ask`}>
                <PlusCircle size={17} />
                Nouvelle question
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto px-9 max-sm:px-4">
        {/* Pinned to the bottom like a chat, without cutting the top once it scrolls. */}
        <div className="flex min-h-full w-full max-w-[820px] flex-col gap-[18px] pt-4 pb-5">
          <div aria-hidden className="-mb-[18px] flex-1" />
          {!conversationId ? (
            <Card className="flex flex-col items-center gap-4 px-8 py-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-acc-soft text-acc-tx">
                <ChatCircleText size={30} weight="duotone" />
              </span>
              <div className="flex max-w-[480px] flex-col gap-1">
                <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">
                  Que voulez-vous mesurer ?
                </h2>
                <p className="m-0 text-[14.5px] text-tx2">
                  Décrivez-le en français. Forja demande les précisions utiles et prépare un aperçu
                  à vérifier ; rien n’est publié sans vous.
                </p>
              </div>
              {suggestions.length ? (
                <SuggestionChips suggestions={suggestions} onPick={askNew} />
              ) : null}
            </Card>
          ) : request.isPending ? (
            <ThreadSkeleton />
          ) : request.isError ? (
            request.error instanceof ApiError && request.error.status === 404 ? (
              <EmptyState
                icon={ChatCircleText}
                title="Conversation introuvable"
                description="Elle n’existe pas ou appartient à quelqu’un d’autre."
                action={
                  <Button asChild variant="primary" size="lg">
                    <Link href={`/projects/${shell.project.id}/ask`}>
                      Nouvelle question
                      <ArrowRight size={16} />
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ScreenError error={request.error} onRetry={() => void request.refetch()} />
            )
          ) : data ? (
            <Thread request={data} latestJob={run.data} onAsk={askNew} />
          ) : null}
          <div ref={bottom} />
        </div>
      </div>
      <div className="flex flex-none justify-center px-9 pt-1.5 pb-7 max-sm:px-4 max-sm:pb-4">
        <Composer
          key={prefill}
          initial={prefill}
          label={placeholder}
          placeholder={placeholder}
          onSubmit={send}
          disabled={busy}
          busy={pending || busy}
          autoFocus={!conversationId}
          testId="agent-composer"
        />
      </div>
    </div>
  );
}
