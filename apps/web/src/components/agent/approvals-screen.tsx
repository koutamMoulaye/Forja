"use client";

import Link from "next/link";
import { SealCheck } from "@phosphor-icons/react";
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
import { useValidatedMarts } from "@/lib/agent/queries";
import {
  awaitsApproval,
  controlsSummary,
  destinationLabel,
  martTitle,
  previewedIteration,
} from "@/lib/agent/view";
import { formatAgo, plural } from "@/lib/format";

const COLUMNS = "lg:grid-cols-[minmax(0,1.6fr)_200px_140px_150px_150px]";

/**
 * /projects/[id]/approvals: data marts validated by analysts that wait for an engineer;
 * each opens the same verification preview, with Approuver and Rejeter.
 */
export function ApprovalsScreen() {
  const shell = useShell();
  const conversations = useValidatedMarts(shell.project.id);
  const waiting = (conversations.data ?? [])
    .filter(awaitsApproval)
    .sort((a, b) => (a.validated_at ?? a.updated_at).localeCompare(b.validated_at ?? b.updated_at));

  return (
    <ScreenBody testId="approvals-screen">
      <ScreenHeader
        title="Data marts à approuver"
        subtitle={
          conversations.data
            ? waiting.length
              ? `${plural(waiting.length, "data mart attend", "data marts attendent")} votre décision, le plus ancien d’abord`
              : "Rien à approuver pour l’instant"
            : "Aperçus validés par les analysts"
        }
      />
      {conversations.isPending ? (
        <ListSkeleton rows={3} height={68} />
      ) : conversations.isError ? (
        <ScreenError error={conversations.error} onRetry={() => void conversations.refetch()} />
      ) : waiting.length === 0 ? (
        <EmptyState
          icon={SealCheck}
          title="Aucun data mart en attente"
          description="Quand un analyst valide un aperçu, il arrive ici avec ses contrôles : vous l’approuvez ou le rejetez avec un motif."
        />
      ) : (
        <Card role="table" aria-label="Data marts à approuver">
          <ListHead
            columns={["Data mart", "Demandé par", "Destination", "Contrôles", ""]}
            className={`max-lg:hidden ${COLUMNS}`}
          />
          {waiting.map((request) => {
            const preview = previewedIteration(request)?.preview;
            return (
              <div
                key={request.id}
                role="row"
                data-testid="approval-row"
                className={`grid min-h-[68px] items-center gap-3 border-t border-sunk px-5 py-2 max-lg:grid-cols-1 ${COLUMNS}`}
              >
                <span role="cell" className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{martTitle(request)}</span>
                  <span className="truncate text-[13px] text-tx3">{request.question}</span>
                </span>
                <span role="cell" className="flex min-w-0 flex-col text-[14px] text-tx2">
                  <span className="truncate">{request.owner_email ?? "analyst"}</span>
                  <span className="text-[12.5px] text-tx3">
                    {request.validated_at ? `validé ${formatAgo(request.validated_at)}` : ""}
                  </span>
                </span>
                <span role="cell" className="text-[14px] text-tx2">
                  {destinationLabel(request.destination)}
                </span>
                <span role="cell" className="text-[13.5px] text-tx2">
                  {preview ? controlsSummary(preview.controls ?? []) : "—"}
                </span>
                <span role="cell" className="flex justify-end">
                  <Button asChild variant="primary" size="md">
                    <Link href={`/projects/${shell.project.id}/marts/${request.id}/preview`}>
                      Vérifier
                    </Link>
                  </Button>
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </ScreenBody>
  );
}
