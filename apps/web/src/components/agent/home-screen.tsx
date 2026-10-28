"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartPieSlice, ChatCircle, Database, FileCsv, Hourglass } from "@phosphor-icons/react";
import { Card, EmptyState, ScreenError } from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { useAgentActions, useAgentOverview, useConversations } from "@/lib/agent/queries";
import {
  businessDescription,
  destinationLabel,
  freshnessLabel,
  greetingName,
  martBadge,
  martTitle,
  pickSuggestions,
  recentConversations,
  type MartRequest,
} from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import { formatAgo } from "@/lib/format";
import { useSemanticLayer } from "@/lib/project/queries";
import { Composer } from "./composer";

/** Questions as chips; a click asks it at once. */
export function SuggestionChips({
  suggestions,
  onPick,
  align = "center",
  disabled = false,
}: {
  suggestions: string[];
  onPick: (question: string) => void;
  align?: "center" | "start";
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2",
        align === "center" ? "justify-center" : "justify-start",
      )}
      data-testid="suggestions"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          className="h-[38px] rounded-full border-0 bg-sunk px-3.5 font-sans text-[14px] font-medium text-tx2 transition-[background-color,box-shadow,color] duration-200 ease-soft hover:bg-node hover:text-tx hover:shadow-sm disabled:opacity-60"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function destinationIcon(request: MartRequest) {
  if (request.destination === "csv") return FileCsv;
  if (request.destination === "parquet") return Database;
  return request.status === "validated" ? Hourglass : ChartPieSlice;
}

function ListCard({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card className="flex flex-col px-3 pt-[18px] pb-2.5" data-testid={testId}>
      <div className="flex items-baseline px-2.5 pb-2">
        <h2 className="m-0 text-section font-semibold">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/** /projects/[id]/home (S4): greeting, freshness, the question field, recent work. */
export function HomeScreen() {
  const shell = useShell();
  const router = useRouter();
  const overview = useAgentOverview(shell.project.id);
  const conversations = useConversations(shell.project.id);
  const layer = useSemanticLayer(shell.project.id);
  const { ask } = useAgentActions(shell.project.id);
  const base = `/projects/${shell.project.id}`;
  const mine = (conversations.data ?? []).filter((r) => r.owner_id === shell.me.user.id);
  const recent = recentConversations(mine, 4);
  const marts = mine
    .filter((r) => r.status === "published" || r.status === "validated")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);
  const metrics = (layer.data?.metrics ?? [])
    .filter((m) => !m.hidden)
    .sort((a, b) => Number(b.default ?? false) - Number(a.default ?? false))
    .slice(0, 4);
  const notReady = overview.error instanceof ApiError && [404, 409].includes(overview.error.status);

  const send = (question: string) =>
    ask.mutate(question, {
      onSuccess: (created) => router.push(`${base}/ask/${created.id}`),
      onError: (error) =>
        toast.error({
          title: "Question non envoyée",
          description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
        }),
    });

  if (notReady) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-9 pt-11 pb-10 max-sm:px-4">
        <EmptyState
          icon={Hourglass}
          title="Les données de ce projet ne sont pas encore prêtes"
          description="L’équipe data construit le modèle à partir des fichiers chargés. Vous pourrez poser vos questions dès qu’il sera publié."
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex max-w-[1080px] flex-col gap-10 px-9 pt-11 pb-10 max-sm:px-4 max-sm:pt-6"
      data-testid="home-screen"
    >
      <div className="flex flex-col items-center gap-[18px] text-center">
        <h1 className="m-0 text-[34px] font-semibold tracking-[-0.03em] max-sm:text-[28px]">
          Bonjour {greetingName(shell.me.user)}
        </h1>
        <div className="text-[15px] text-tx2" data-testid="freshness">
          {overview.isPending ? (
            <Skeleton className="h-5 w-72" />
          ) : (
            `${shell.project.name} · ${freshnessLabel(overview.data?.data_updated_at)}`
          )}
        </div>
        <div className="mt-1.5 flex w-full justify-center">
          <Composer
            hero
            label="Posez une question"
            placeholder="Posez une question sur vos ventes, vos clients, vos produits"
            onSubmit={send}
            busy={ask.isPending}
            testId="home-composer"
          />
        </div>
        {overview.isPending ? (
          <div className="flex gap-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-[38px] w-44 rounded-full" />
            ))}
          </div>
        ) : overview.isError ? (
          <ScreenError
            error={overview.error}
            title="Suggestions indisponibles"
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <SuggestionChips
            suggestions={pickSuggestions(overview.data)}
            onPick={send}
            disabled={ask.isPending}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <ListCard title="Questions récentes" testId="recent-questions">
          {conversations.isPending ? (
            <Skeleton className="mx-2.5 my-2 h-40 rounded-xl" />
          ) : recent.length === 0 ? (
            <p className="m-0 px-2.5 py-3 text-ui text-tx3">
              Vos questions apparaîtront ici, avec leur avancement.
            </p>
          ) : (
            recent.map((request) => {
              const badge = martBadge(request);
              return (
                <Link
                  key={request.id}
                  href={`${base}/ask/${request.id}`}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-3 text-tx no-underline transition-colors hover:bg-sunk hover:no-underline"
                >
                  <ChatCircle size={20} className="flex-none text-tx3" />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-medium">{request.question}</span>
                    <span className="text-[13px] text-tx3">{formatAgo(request.updated_at)}</span>
                  </span>
                  <StatusBadge kind={badge.kind} label={badge.label} size={13} />
                </Link>
              );
            })
          )}
        </ListCard>
        <ListCard
          title="Mes data marts"
          testId="home-marts"
          action={
            <Link href={`${base}/marts`} className="text-[13.5px] font-medium text-acc-tx">
              Tout voir
            </Link>
          }
        >
          {conversations.isPending ? (
            <Skeleton className="mx-2.5 my-2 h-40 rounded-xl" />
          ) : marts.length === 0 ? (
            <p className="m-0 px-2.5 py-3 text-ui text-tx3">
              Aucun data mart validé pour l’instant : vérifiez un aperçu pour en publier un.
            </p>
          ) : (
            marts.map((request) => {
              const badge = martBadge(request);
              const Icon = destinationIcon(request);
              return (
                <Link
                  key={request.id}
                  href={`${base}/marts/${request.id}/preview`}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-3 text-tx no-underline transition-colors hover:bg-sunk hover:no-underline"
                >
                  <span className="flex size-[38px] flex-none items-center justify-center rounded-[11px] bg-sunk text-tx2">
                    <Icon size={20} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14.5px] font-medium">{martTitle(request)}</span>
                    <span className="text-[13px] text-tx3">
                      {destinationLabel(request.destination, request.status === "published")} ·{" "}
                      {formatAgo(request.updated_at)}
                    </span>
                  </span>
                  <StatusBadge kind={badge.kind} label={badge.label} size={13} />
                </Link>
              );
            })
          )}
        </ListCard>
      </div>

      <section className="flex flex-col gap-3" data-testid="home-indicators">
        <div className="flex items-baseline">
          <h2 className="m-0 text-section font-semibold">Indicateurs disponibles</h2>
          <Link
            href={`${base}/indicators`}
            className="ml-auto text-[13.5px] font-medium text-acc-tx"
          >
            Tous les indicateurs
          </Link>
        </div>
        {layer.isPending ? (
          <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24 rounded-[18px]" />
            ))}
          </div>
        ) : layer.isError ? (
          <ScreenError error={layer.error} onRetry={() => void layer.refetch()} />
        ) : (
          <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {metrics.map((metric) => (
              <Link
                key={metric.name}
                href={`${base}/indicators?indicateur=${encodeURIComponent(metric.name)}`}
                className="flex flex-col gap-1.5 rounded-[18px] bg-node px-[18px] py-4 text-tx no-underline shadow-sm transition-shadow hover:no-underline hover:shadow-hover"
              >
                <span className="text-[15px] font-semibold">{metric.label}</span>
                <span className="text-[13.5px] leading-[1.45] text-tx2">
                  {businessDescription(metric)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      {conversations.isError ? (
        <ScreenError error={conversations.error} onRetry={() => void conversations.refetch()} />
      ) : null}
    </div>
  );
}
