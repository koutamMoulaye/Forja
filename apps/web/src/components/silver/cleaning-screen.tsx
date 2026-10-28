"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { Broom } from "@phosphor-icons/react";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { api, unwrap } from "@/lib/api/client";
import { formatWhen, plural } from "@/lib/format";
import { keys, orNull, useSources } from "@/lib/project/queries";
import { PLAN_STATUS } from "@/lib/silver/review";

const GRID = "minmax(0,1.4fr) 90px 150px 170px 120px";

/** /projects/[id]/cleaning: the Silver plan of each source and what is left to decide. */
export function CleaningScreen() {
  const { project } = useShell();
  const sources = useSources(project.id);
  const reviews = useQueries({
    queries: (sources.data ?? []).map((source) => ({
      queryKey: keys.review(source.id),
      queryFn: () =>
        orNull(async () =>
          unwrap(
            await api.GET("/sources/{source_id}/plan/review", {
              params: { path: { source_id: source.id } },
            }),
          ),
        ),
    })),
  });
  const drafts = reviews.filter((r) => r.data?.status === "draft").length;
  return (
    <ScreenBody testId="cleaning-screen">
      <ScreenHeader
        title="Nettoyage"
        subtitle={
          sources.data
            ? `${plural(sources.data.length, "plan", "plans")} Silver${drafts ? ` · ${plural(drafts, "à revoir", "à revoir")}` : ""}`
            : "Plans Silver de chaque source"
        }
      />
      {sources.isPending ? (
        <ListSkeleton rows={4} />
      ) : sources.isError ? (
        <ScreenError error={sources.error} onRetry={() => void sources.refetch()} />
      ) : sources.data.length === 0 ? (
        <EmptyState
          icon={Broom}
          title="Aucun plan de nettoyage"
          description="Chaque fichier chargé reçoit un plan proposé après son profilage."
        />
      ) : (
        <Card role="table" aria-label="Plans de nettoyage" className="overflow-x-auto">
          <div className="min-w-[700px]">
            <ListHead
              style={{ gridTemplateColumns: GRID }}
              columns={["Source", "Version", "Statut", "Règles", "Modifié"]}
            />
            {sources.data.map((source, index) => {
              const review = reviews[index]?.data;
              const status = review ? PLAN_STATUS[review.status as keyof typeof PLAN_STATUS] : null;
              return (
                <Link
                  role="row"
                  key={source.id}
                  href={`/projects/${project.id}/sources/${source.id}/plan`}
                  data-testid={`cleaning-row-${source.name}`}
                  className="grid min-h-[60px] items-center gap-3 border-t border-sunk px-5 text-tx no-underline hover:bg-sunk hover:no-underline"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <span role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate text-[14.5px] font-semibold">{source.name}</span>
                    <span className="truncate font-mono text-mono text-tx3">
                      {source.original_filename}
                    </span>
                  </span>
                  <span role="cell" className="font-mono text-mono text-tx2">
                    {review ? `v${review.plan_version}` : "—"}
                  </span>
                  <span role="cell" className="flex">
                    {status ? (
                      <StatusBadge kind={status.kind} label={status.label} size={13} />
                    ) : (
                      <StatusBadge kind="queue" label="En préparation" size={13} />
                    )}
                  </span>
                  <span role="cell" className="text-[14px] text-tx2 tabular-nums">
                    {review
                      ? review.status === "draft"
                        ? `${review.pending} à décider sur ${review.rules.length}`
                        : plural(review.rules.length, "règle", "règles")
                      : ""}
                  </span>
                  <span role="cell" className="text-[14px] whitespace-nowrap text-tx2 tabular-nums">
                    {formatWhen(source.ingested_at)}
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
