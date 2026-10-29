"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CaretDown,
  ChartPieSlice,
  ChatCircleText,
  Database,
  FileCsv,
  SealCheck,
} from "@phosphor-icons/react";
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
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { useMartPages } from "@/lib/agent/queries";
import {
  MART_FILTERS,
  awaitsApproval,
  countByFilter,
  destinationLabel,
  filterMarts,
  martBadge,
  martTitle,
  previewedIteration,
  type MartFilter,
  type MartRequest,
} from "@/lib/agent/view";
import { cn } from "@/lib/cn";
import { formatWhen, plural } from "@/lib/format";
import { downloadFile } from "@/lib/project/queries";

/** Columns of S5: name, status, destination, update, actions. */
const COLUMNS = "lg:grid-cols-[minmax(0,1.6fr)_230px_150px_130px_220px]";

function DestinationCell({ request }: { request: MartRequest }) {
  const Icon =
    request.destination === "csv"
      ? FileCsv
      : request.destination === "parquet"
        ? Database
        : ChartPieSlice;
  return (
    <span className="flex items-center gap-2 text-[14px] text-tx2">
      {request.destination ? <Icon size={18} /> : null}
      {destinationLabel(request.destination, request.status === "published")}
    </span>
  );
}

function ExportMenu({ request }: { request: MartRequest }) {
  const ready = request.status === "published" && Boolean(request.published_table_id);
  const exportAs = async (format: "csv" | "parquet") => {
    try {
      const file = await downloadFile(
        `/tables/${request.published_table_id}/export?format=${format}`,
        `${request.published_name ?? "data_mart"}.${format}`,
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="tonal"
          size="md"
          disabled={!ready}
          title={ready ? undefined : "Disponible une fois le data mart publié"}
        >
          Exporter
          <CaretDown size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[210px] flex-col p-1.5">
        {(["csv", "parquet"] as const).map((format) => (
          <PopoverClose asChild key={format}>
            <button
              type="button"
              onClick={() => void exportAs(format)}
              className="flex h-[38px] items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-2.5 text-left font-sans text-[14px] text-tx hover:bg-sunk"
            >
              {format === "csv" ? (
                <FileCsv size={17} className="text-tx2" />
              ) : (
                <Database size={17} className="text-tx2" />
              )}
              Exporter en {format === "csv" ? "CSV" : "Parquet"}
            </button>
          </PopoverClose>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function MartRow({ request, mine }: { request: MartRequest; mine: boolean }) {
  const shell = useShell();
  const base = `/projects/${shell.project.id}`;
  const badge = martBadge(request);
  const href = previewedIteration(request)
    ? `${base}/marts/${request.id}/preview`
    : `${base}/ask/${request.id}`;
  return (
    <div
      role="row"
      data-testid="mart-row"
      className={cn(
        "grid min-h-[68px] items-center gap-3.5 border-t border-sunk px-5 py-2 max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-y-2",
        COLUMNS,
      )}
    >
      <Link
        href={href}
        role="cell"
        className="flex min-w-0 flex-col gap-0.5 text-tx no-underline hover:no-underline"
      >
        <span className="truncate text-[15px] font-semibold hover:underline">
          {martTitle(request)}
        </span>
        <span className="truncate text-[13px] text-tx3">
          {request.question}
          {mine ? "" : ` · ${request.owner_email ?? "analyst"}`}
        </span>
      </Link>
      <span role="cell" className="flex">
        <StatusBadge kind={badge.kind} label={badge.label} size={13} />
      </span>
      <span role="cell" className="max-lg:hidden">
        <DestinationCell request={request} />
      </span>
      <span role="cell" className="text-[14px] text-tx2 tabular-nums max-lg:hidden">
        {formatWhen(request.updated_at)}
      </span>
      <span role="cell" className="flex justify-end gap-1.5 max-lg:col-span-2 max-lg:justify-start">
        {mine && request.status !== "rejected" ? (
          <Button asChild variant="tonal" size="md">
            <Link href={`${base}/ask/${request.id}`}>Affiner</Link>
          </Button>
        ) : null}
        <ExportMenu request={request} />
      </span>
    </div>
  );
}

/** /projects/[id]/marts (S5): every data mart asked, by status, with its destination. */
export function MartsScreen() {
  const shell = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const conversations = useMartPages(shell.project.id);
  const filter = (params.get("filtre") as MartFilter | null) ?? "all";
  const all = useMemo(
    () => conversations.data?.pages.flatMap((page) => page.items) ?? [],
    [conversations.data],
  );
  const total = conversations.data?.pages[0]?.total ?? 0;
  const counts = countByFilter(all);
  const rows = filterMarts(all, filter);
  const pending = all.filter(awaitsApproval).length;
  const setFilter = (next: MartFilter) => {
    const search = new URLSearchParams(params.toString());
    if (next === "all") search.delete("filtre");
    else search.set("filtre", next);
    const query = search.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  };
  const newQuestion = (
    <Button asChild variant="primary" size="lg">
      <Link href={`/projects/${shell.project.id}/ask`}>
        <ChatCircleText size={17} />
        Nouvelle question
      </Link>
    </Button>
  );

  return (
    <ScreenBody testId="marts-screen">
      <ScreenHeader
        title="Mes data marts"
        subtitle={
          conversations.data
            ? `${plural(total, "data mart", "data marts")}${
                pending ? ` · ${pending} en attente d’approbation` : ""
              }`
            : "Brouillons, aperçus et publications"
        }
        actions={
          <>
            <Segmented
              label="Filtrer les data marts"
              value={filter}
              onValueChange={setFilter}
              options={MART_FILTERS.map((f) => ({
                value: f.id,
                label: counts[f.id] && f.id !== "all" ? `${f.label} ${counts[f.id]}` : f.label,
              }))}
            />
            {newQuestion}
          </>
        }
      />
      {conversations.isPending ? (
        <ListSkeleton rows={5} height={68} />
      ) : conversations.isError ? (
        <ScreenError error={conversations.error} onRetry={() => void conversations.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={ChartPieSlice}
          title="Aucun data mart pour l’instant"
          description="Posez une question en français : Forja prépare un aperçu à vérifier, puis le publie vers votre outil."
          action={newQuestion}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SealCheck}
          title="Rien dans ce filtre"
          description={
            filter === "pending"
              ? "Aucun data mart n’attend d’approbation."
              : filter === "published"
                ? "Aucun data mart publié : validez un aperçu pour le publier."
                : "Aucun brouillon en cours."
          }
          action={
            <Button variant="secondary" size="lg" onClick={() => setFilter("all")}>
              Voir tous les data marts
            </Button>
          }
        />
      ) : (
        <Card role="table" aria-label="Data marts">
          <ListHead
            columns={["Nom", "Statut", "Destination", "Mise à jour", ""]}
            className={cn("max-lg:hidden", COLUMNS)}
          />
          <div role="rowgroup">
            {rows.map((request) => (
              <MartRow
                key={request.id}
                request={request}
                mine={request.owner_id === shell.me.user.id}
              />
            ))}
          </div>
          {conversations.hasNextPage ? (
            <div className="border-t border-sunk px-5 py-3">
              <Button
                variant="tonal"
                size="md"
                loading={conversations.isFetchingNextPage}
                onClick={() => void conversations.fetchNextPage()}
              >
                Data marts plus anciens ({total - all.length})
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </ScreenBody>
  );
}
