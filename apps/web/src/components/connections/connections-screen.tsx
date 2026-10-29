"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CaretRight,
  PencilSimple,
  Plugs,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import {
  Card,
  EmptyState,
  ListSkeleton,
  ScreenBody,
  ScreenError,
  ScreenHeader,
} from "@/components/screens/screen";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import {
  removeSchedule,
  saveSchedule,
  useConnectionActions,
  useConnections,
  useProjectSchedules,
  type Connection,
  type Schedule,
  type ScheduleTarget,
} from "@/lib/connections/queries";
import { CONNECTION_TYPES, connectionState, formatNext } from "@/lib/connections/view";
import { formatAgo, formatInteger, plural } from "@/lib/format";
import { useFileUpload } from "@/components/sources/use-file-upload";
import { AddSourceDialog } from "./add-source-dialog";
import { EditConnectionDialog } from "./edit-connection-dialog";
import { SourcesTabs } from "./sources-tabs";
import { ScheduleField } from "./wizard";

function where(connection: Connection): string {
  const params = connection.params as { host?: string; database?: string; base_url?: string };
  if (params.base_url) return params.base_url;
  return `${params.host ?? ""} / ${params.database ?? ""}`;
}

/** /projects/[id]/sources/connections: databases and APIs, their state and their loads. */
export function ConnectionsScreen() {
  const { project } = useShell();
  const connections = useConnections(project.id);
  const actions = useConnectionActions(project.id);
  const files = useFileUpload(project.id);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<Planned | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null);
  const schedules = useProjectSchedules(project.id);
  const sourceSchedule = (sourceId: string) =>
    (schedules.data?.schedules ?? []).find(
      (s) => s.target_type === "source" && s.target_id === sourceId,
    ) ?? null;
  const [deleting, setDeleting] = useState<Connection | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const failure = (title: string) => (error: unknown) =>
    toast.error({ title, description: error instanceof ApiError ? error.message : undefined });

  const list = connections.data ?? [];
  const subtitle = connections.data
    ? plural(list.length, "connexion", "connexions")
    : "Bases de données et API chargées dans le projet";

  return (
    <ScreenBody testId="connections-screen">
      <ScreenHeader
        title="Connexions"
        subtitle={subtitle}
        eyebrow={<SourcesTabs projectId={project.id} current="connections" />}
        actions={
          <>
            {files.element}
            <Button
              variant="primary"
              size="lg"
              loading={files.uploading}
              onClick={() => setAdding(true)}
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
      {connections.isPending ? (
        <ListSkeleton rows={3} height={96} />
      ) : connections.isError ? (
        <ScreenError error={connections.error} onRetry={() => void connections.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Plugs}
          title="Aucune connexion"
          description="Connectez une base de données ou une API : ses tables deviennent des sources, chargées à la demande ou selon une planification."
          action={
            <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Ajouter une source
            </Button>
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Connexions du projet">
          {list.map((connection) => {
            const type = CONNECTION_TYPES[connection.type];
            const state = connectionState(connection);
            const sources = connection.sources ?? [];
            const expanded = open === connection.id;
            return (
              <li key={connection.id} data-testid={`connection-${connection.name}`}>
                <Card className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-sunk text-tx2">
                      <type.icon size={21} weight="duotone" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15.5px] font-semibold">
                          {connection.name}
                        </span>
                        <StatusBadge kind={state.kind} label={state.label} size={13} />
                        {connection.last_test?.read_only === false ? (
                          <span
                            className="flex items-center gap-1 text-meta text-prop-fg"
                            title="Un compte en lecture seule est recommandé"
                          >
                            <Warning size={13} weight="fill" /> Compte en écriture
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-meta text-tx3">
                        {type.label} ·{" "}
                        <span className="font-mono text-mono">{where(connection)}</span>
                      </span>
                    </div>
                    <dl className="m-0 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-meta">
                      <dt className="text-tx3">Dernier chargement</dt>
                      <dd className="m-0 text-tx2 tabular-nums">
                        {connection.last_loaded_at
                          ? formatAgo(connection.last_loaded_at)
                          : "jamais"}
                      </dd>
                      <dt className="text-tx3">Prochain</dt>
                      <dd className="m-0 text-tx2 tabular-nums" data-testid="next-load">
                        {connection.schedule?.next_run_at
                          ? `${formatNext(connection.schedule.next_run_at)} · ${connection.schedule.description}`
                          : "manuel"}
                      </dd>
                    </dl>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="md"
                        loading={actions.load.isPending && actions.load.variables === connection.id}
                        disabled={Boolean(connection.active_run) || !sources.length}
                        onClick={() =>
                          actions.load.mutate(connection.id, {
                            onSuccess: () =>
                              toast.success({
                                title: "Chargement lancé",
                                description: `${connection.name} : ${plural(sources.length, "source", "sources")}`,
                              }),
                            onError: failure("Chargement impossible"),
                          })
                        }
                      >
                        <ArrowsClockwise size={15} />
                        Charger
                      </Button>
                      <Button
                        variant="quiet"
                        size="md"
                        onClick={() =>
                          setScheduling({
                            target: { type: "connection", id: connection.id },
                            name: connection.name,
                            current: connection.schedule ?? null,
                          })
                        }
                      >
                        <CalendarBlank size={15} />
                        Planifier
                      </Button>
                      <Button
                        variant="quiet"
                        size="md"
                        loading={actions.test.isPending && actions.test.variables === connection.id}
                        onClick={() =>
                          actions.test.mutate(connection.id, {
                            onSuccess: (result) =>
                              result.ok
                                ? toast.success({
                                    title: "Connexion réussie",
                                    description: result.server_version ?? undefined,
                                  })
                                : toast.error({
                                    title: "Connexion impossible",
                                    description: result.message,
                                  }),
                            onError: failure("Test impossible"),
                          })
                        }
                      >
                        Tester
                      </Button>
                      <Button
                        variant="quiet"
                        size="icon"
                        aria-label={`Modifier ${connection.name}`}
                        onClick={() => setEditing(connection)}
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        variant="danger-quiet"
                        size="icon"
                        aria-label={`Supprimer ${connection.name}`}
                        onClick={() => setDeleting(connection)}
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>
                  {sources.length ? (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : connection.id)}
                        className="flex w-fit items-center gap-1.5 border-0 bg-transparent p-0 text-meta font-medium text-tx2 hover:text-tx"
                      >
                        {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        {plural(sources.length, "source alimentée", "sources alimentées")}
                      </button>
                      {expanded ? (
                        <table className="w-full border-collapse text-meta">
                          <thead>
                            <tr className="text-left text-tx3">
                              <th className="py-1 pr-4 font-semibold">Source</th>
                              <th className="py-1 pr-4 font-semibold">Origine</th>
                              <th className="py-1 pr-4 font-semibold">Mode</th>
                              <th className="py-1 pr-4 text-right font-semibold">Lignes</th>
                              <th className="py-1 pr-4 font-semibold">Chargée</th>
                              <th className="py-1 font-semibold">Planification</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sources.map((source) => (
                              <tr key={source.source_id} className="border-t border-sunk">
                                <td className="py-1.5 pr-4">
                                  {source.loaded ? (
                                    <Link
                                      href={`/projects/${project.id}/sources/${source.source_id}`}
                                    >
                                      {source.source_name}
                                    </Link>
                                  ) : (
                                    <span className="text-tx3">{source.source_name}</span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-4 font-mono text-mono text-tx2">
                                  {source.object}
                                </td>
                                <td className="py-1.5 pr-4 text-tx2">
                                  {source.mode === "incremental" ? (
                                    <>
                                      Incrémental sur{" "}
                                      <span className="font-mono text-mono">
                                        {source.cursor_column}
                                      </span>
                                    </>
                                  ) : (
                                    "Complet"
                                  )}
                                </td>
                                <td className="py-1.5 pr-4 text-right text-tx2 tabular-nums">
                                  {source.last_rows != null ? formatInteger(source.last_rows) : "—"}
                                </td>
                                <td className="py-1.5 pr-4 text-tx2">
                                  {source.last_loaded_at
                                    ? formatAgo(source.last_loaded_at)
                                    : "en attente"}
                                </td>
                                <td className="py-1.5">
                                  {source.loaded ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setScheduling({
                                          target: { type: "source", id: source.source_id },
                                          name: source.source_name,
                                          current: sourceSchedule(source.source_id),
                                        })
                                      }
                                      className="border-0 bg-transparent p-0 text-meta text-acc-tx hover:underline"
                                      aria-label={`Planifier ${source.source_name}`}
                                    >
                                      {sourceSchedule(source.source_id)?.description ??
                                        "celle de la connexion"}
                                    </button>
                                  ) : (
                                    <span className="text-tx3">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                  ) : (
                    <p className="m-0 text-meta text-tx3">Aucune table sélectionnée.</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <ScheduleDialog
        projectId={project.id}
        planned={scheduling}
        onClose={() => setScheduling(null)}
        onSaved={() => void actions.refresh()}
      />
      <EditConnectionDialog
        connection={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void actions.refresh()}
      />
      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent className="w-[min(480px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>Supprimer {deleting?.name} ?</DialogTitle>
            <DialogDescription>
              Ses sources restent dans le projet, avec leurs versions, mais ne seront plus chargées.
              Ses identifiants et ses planifications sont supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="quiet" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                actions.remove.mutate(deleting!.id, {
                  onSuccess: () => {
                    toast.success({ title: `${deleting!.name} supprimée` });
                    setDeleting(null);
                  },
                  onError: failure("Suppression impossible"),
                })
              }
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenBody>
  );
}

/** What a schedule dialog edits: a connection, or one of its sources. */
type Planned = { target: ScheduleTarget; name: string; current: Schedule | null };

/** Edit when a connection or a source loads, in plain French. */
function ScheduleDialog({
  projectId,
  planned,
  onClose,
  onSaved,
}: {
  projectId: string;
  planned: Planned | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={planned !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))]">
        {planned ? (
          <ScheduleEditor
            key={planned.target.id}
            projectId={projectId}
            planned={planned}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleEditor({
  projectId,
  planned,
  onClose,
  onSaved,
}: {
  projectId: string;
  planned: Planned;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { target, name, current } = planned;
  const [text, setText] = useState(current?.text ?? current?.description ?? "Manuel");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (text.trim().toLowerCase() === "manuel") {
        if (current) await removeSchedule(target);
      } else {
        await saveSchedule(target, text.trim());
      }
      toast.success({ title: "Planification enregistrée" });
      onSaved();
      onClose();
    } catch (error) {
      toast.error({
        title: "Planification impossible",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Planifier {name}</DialogTitle>
        <DialogDescription>
          {target.type === "connection"
            ? "Chaque chargement planifié reprend ses sources"
            : "Cette source se charge aussi selon la planification de sa connexion ; chaque chargement planifié la reprend"}{" "}
          puis reconstruit Silver, Gold, les data marts publiés et le serving selon les plans
          approuvés.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ScheduleField projectId={projectId} value={text} onChange={setText} />
      </DialogBody>
      <DialogFooter>
        <Button variant="quiet" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Enregistrer
        </Button>
      </DialogFooter>
    </>
  );
}
