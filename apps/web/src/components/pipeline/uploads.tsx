"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ViewportPortal } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BracketsCurly,
  Database,
  FileCsv,
  FileXls,
  FolderOpen,
  TrayArrowUp,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { API_PROXY_PREFIX } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { CSRF_HEADER, readCsrfToken } from "@/lib/auth/csrf-client";
import { cn } from "@/lib/cn";
import { GEOMETRY, type Layout } from "@/lib/pipeline/layout";
import { sourceSlug, type GraphNode, type Lane, type ProjectGraph } from "@/lib/pipeline/model";
import { graphKey } from "@/lib/pipeline/use-graph";
import { springs } from "@/lib/motion";

export const ACCEPTED = ".csv,.tsv,.txt,.xlsx,.xls,.parquet,.json,.jsonl,.ndjson";
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED.split(",").map((e) => e.slice(1)));

type Choice = { file: File; existing: GraphNode };
type Mode = { mode: "new_source" } | { mode: "new_version"; sourceId: string };

function useUploadLimit(): number | null {
  const health = useQuery({
    queryKey: ["health"],
    staleTime: Infinity,
    queryFn: async () => (await (await fetch("/api/health")).json()) as { max_upload_mb?: number },
  });
  return health.data?.max_upload_mb ?? null;
}

export function formatLimit(megabytes: number): string {
  return megabytes >= 1024
    ? `${String(Math.round((megabytes / 1024) * 10) / 10).replace(".", ",")} Go`
    : `${megabytes} Mo`;
}

async function sendFile(projectId: string, file: File, mode: Mode | null) {
  const query = new URLSearchParams();
  if (mode?.mode === "new_source") query.set("mode", "new_source");
  if (mode?.mode === "new_version") {
    query.set("mode", "new_version");
    query.set("source_id", mode.sourceId);
  }
  const body = new FormData();
  body.append("file", file, file.name);
  const headers = new Headers();
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);
  const suffix = query.size ? `?${query}` : "";
  const response = await fetch(`${API_PROXY_PREFIX}/projects/${projectId}/sources${suffix}`, {
    method: "POST",
    body,
    headers,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw ApiError.from(response.status, payload, response.headers.get("Retry-After"));
  }
}

/**
 * Files dropped or chosen: one upload at a time (each is profiled by the API before it
 * answers), so sources appear one by one. A name already used asks whether the file is
 * a new source or a new version.
 */
export function useUploads(
  projectId: string,
  graph: ProjectGraph,
  input: React.RefObject<HTMLInputElement | null>,
) {
  const queryClient = useQueryClient();
  const limit = useUploadLimit();
  const [queue, setQueue] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [choice, setChoice] = useState<{
    pending: Choice;
    resolve: (mode: Mode | null) => void;
  } | null>(null);

  const sources = useMemo(
    () => new Map(graph.nodes.filter((n) => n.type === "source").map((n) => [n.id.slice(4), n])),
    [graph.nodes],
  );

  const ask = useCallback(
    (pending: Choice) => new Promise<Mode | null>((resolve) => setChoice({ pending, resolve })),
    [],
  );

  const upload = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ACCEPTED_EXTENSIONS.has(extension)) {
          toast.error({
            title: `${file.name} n’est pas pris en charge`,
            description: "CSV, Excel, Parquet ou JSON",
          });
          return false;
        }
        if (limit && file.size > limit * 1024 * 1024) {
          toast.error({
            title: `${file.name} est trop volumineux`,
            description: `Jusqu’à ${formatLimit(limit)} par fichier`,
          });
          return false;
        }
        return true;
      });
      if (!valid.length) return;
      setQueue(valid.map((f) => f.name));
      setTotal(valid.length);
      let done = 0;
      for (const file of valid) {
        const existing = sources.get(sourceSlug(file.name));
        let mode: Mode | null = null;
        if (existing) {
          mode = await ask({ file, existing });
          if (mode === null) {
            setQueue((q) => q.filter((name) => name !== file.name));
            continue;
          }
        }
        try {
          await sendFile(projectId, file, mode);
          done += 1;
          await queryClient.invalidateQueries({ queryKey: graphKey(projectId) });
        } catch (error) {
          toast.error({
            title: `Échec du chargement de ${file.name}`,
            description: error instanceof ApiError ? error.message : undefined,
          });
        } finally {
          setQueue((q) => q.filter((name) => name !== file.name));
        }
      }
      if (done) {
        void queryClient.invalidateQueries({ queryKey: ["counters", projectId] });
        toast.success({
          title: done > 1 ? `${done} sources profilées` : "Source profilée",
          description: "Plans de nettoyage proposés",
        });
      }
      setTotal(0);
    },
    [ask, limit, projectId, queryClient, sources],
  );

  const choose = useCallback(() => input.current?.click(), [input]);
  const active = queue.length > 0;

  const sourceCount = graph.nodes.filter((n) => n.type === "source").length;
  return useMemo(
    () => ({
      limit,
      queue,
      total,
      active,
      dragging,
      choice,
      upload,
      choose,
      resolveChoice: (mode: Mode | null) => {
        choice?.resolve(mode);
        setChoice(null);
      },
      /** During profiling the compartments say where things stand. */
      subtitle: (lane: Lane): string | null => {
        if (!active) return null;
        const present = sourceCount;
        if (lane === "sources") return `${total - queue.length} sur ${total} fichiers profilés`;
        if (lane === "cleaning") return present ? null : "Proposé après le profilage";
        if (lane === "star_schema") return "Proposé après le nettoyage";
        return null;
      },
      onDragOver: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        if (!dragging) setDragging(true);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      },
      onDrop: (event: React.DragEvent) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        void upload([...event.dataTransfer.files]);
      },
    }),
    [limit, queue, total, active, dragging, choice, upload, choose, sourceCount],
  );
}

export type Uploads = ReturnType<typeof useUploads>;

const FORMATS = [
  { icon: FileCsv, label: "CSV" },
  { icon: FileXls, label: "Excel (.xlsx, .xls)" },
  { icon: Database, label: "Parquet" },
  { icon: BracketsCurly, label: "JSON" },
];

/** File input, the empty project's drop zone (v2 V4) and the new source or version choice. */
export function UploadLayer({
  inputRef,
  uploads,
  empty,
  area,
  onDemo,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploads: Uploads;
  empty: boolean;
  area: { left: number; top: number; width: number; height: number };
  onDemo: () => void;
}) {
  const reduce = useReducedMotion();
  const pending = uploads.choice?.pending;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="upload-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void uploads.upload(files);
        }}
      />
      {empty && !uploads.active ? (
        <div
          data-testid="drop-zone"
          className="absolute z-[3] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4"
          style={{ left: area.left + area.width / 2, top: area.top + area.height / 2 }}
        >
          <motion.div
            animate={{ scale: uploads.dragging && !reduce ? 1.015 : 1 }}
            transition={springs.sheet}
            className={cn(
              "flex flex-col items-center gap-5 rounded-3xl px-10 pt-11 pb-9 text-center outline-[1.5px] -outline-offset-[14px] outline-edge material-glass outline-dashed",
              uploads.dragging ? "shadow-[0_0_0_2px_var(--acc),var(--sh-float)]" : "shadow-float",
            )}
          >
            <span className="flex size-16 items-center justify-center rounded-[18px] bg-acc-soft text-acc-tx">
              <TrayArrowUp size={34} weight="duotone" />
            </span>
            <div className="flex flex-col items-center gap-1.5">
              <h2 className="m-0 text-[26px] font-semibold tracking-[-0.022em]">
                Déposez vos fichiers
              </h2>
              <p className="m-0 text-[15px] text-tx2">
                Forja les profile, puis propose un plan de nettoyage.
              </p>
            </div>
            <button
              type="button"
              onClick={uploads.choose}
              className="flex h-11 items-center gap-2 rounded-lg border-0 bg-acc px-5 text-[15px] font-semibold text-on-acc transition-[filter] hover:brightness-[1.06]"
            >
              <FolderOpen size={18} />
              Choisir des fichiers
            </button>
            <ul
              className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0"
              aria-label="Formats acceptés"
            >
              {FORMATS.map((format) => (
                <li
                  key={format.label}
                  className="flex h-7 items-center gap-1.5 rounded-lg bg-sunk px-2.5 text-meta text-tx2"
                >
                  <format.icon size={16} />
                  {format.label}
                </li>
              ))}
            </ul>
            <p className="m-0 text-meta text-tx3">
              {uploads.limit ? `Jusqu’à ${formatLimit(uploads.limit)} par fichier. ` : ""}Les
              fichiers restent sur ce poste.
            </p>
          </motion.div>
          <button
            type="button"
            onClick={onDemo}
            className="flex items-center gap-1.5 self-center border-0 bg-transparent text-[14px] font-medium text-tx2 hover:text-tx"
          >
            Ouvrir le projet de démo
            <ArrowRight size={15} />
          </button>
        </div>
      ) : null}
      <Dialog
        open={pending !== undefined}
        onOpenChange={(open) => !open && uploads.resolveChoice(null)}
      >
        <DialogContent className="w-[min(480px,calc(100vw-32px))]">
          <DialogHeader>
            <DialogTitle>{pending ? `${pending.existing.name} existe déjà` : ""}</DialogTitle>
            <DialogDescription>
              {pending ? `Que faire de ${pending.file.name} ?` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            {pending ? (
              <>
                <button
                  type="button"
                  autoFocus
                  onClick={() =>
                    uploads.resolveChoice({ mode: "new_version", sourceId: pending.existing.ref! })
                  }
                  className="flex flex-col items-start gap-0.5 rounded-xl border-0 bg-node px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-hover"
                >
                  <span className="text-[14.5px] font-semibold">Nouvelle version</span>
                  <span className="text-meta text-tx3">
                    Remplace les données de {pending.existing.name} ; la dérive de schéma est
                    détectée.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => uploads.resolveChoice({ mode: "new_source" })}
                  className="flex flex-col items-start gap-0.5 rounded-xl border-0 bg-node px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-hover"
                >
                  <span className="text-[14.5px] font-semibold">Nouvelle source</span>
                  <span className="text-meta text-tx3">
                    Une source distincte, avec son propre plan.
                  </span>
                </button>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => uploads.resolveChoice(null)}
              className="h-9 rounded-md border-0 bg-transparent px-3 text-ui font-medium text-tx2 hover:bg-sunk"
            >
              Ne pas charger
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const shimmer =
  "bg-[linear-gradient(90deg,var(--sunk)_0%,var(--hair)_50%,var(--sunk)_100%)] bg-[length:840px_100%] animate-shimmer";

/** While files are profiled (v2 V5): the files in flight and skeletons in later compartments. */
export function ProfilingGhosts({
  uploads,
  layout,
  graph,
}: {
  uploads: Uploads;
  layout: Layout;
  graph: ProjectGraph;
}) {
  if (!uploads.active) return null;
  const sourceLane = layout.lanes.find((l) => l.lane === "sources")!;
  const sourceNodes = graph.nodes.filter((n) => n.type === "source" && layout.nodes[n.id]);
  const bottom = Math.max(GEOMETRY.top, ...sourceNodes.map((n) => layout.nodes[n.id]!.y + 136));
  const pitch = GEOMETRY.nodeHeight + GEOMETRY.nearExtra + GEOMETRY.rowGap;
  const rows = sourceNodes.length + uploads.queue.length;
  const skeletons = (["cleaning", "star_schema", "serving"] as const).flatMap((lane) => {
    const placed = layout.lanes.find((l) => l.lane === lane)!;
    if (!placed.open || graph.nodes.some((n) => n.lane === lane)) return [];
    const count = lane === "cleaning" ? Math.min(rows, 6) : lane === "star_schema" ? 2 : 1;
    return Array.from({ length: count }, (_, row) => ({
      key: `${lane}-${row}`,
      x: placed.x + GEOMETRY.lanePadding,
      y: GEOMETRY.top + row * pitch,
    }));
  });
  return (
    <ViewportPortal>
      {uploads.queue.map((name, index) => (
        <div
          key={name}
          data-testid="upload-ghost"
          className="absolute box-border flex items-start gap-3 rounded-lg bg-node px-3.5 py-[13px] shadow-node"
          style={{
            left: sourceLane.x + GEOMETRY.lanePadding,
            top: bottom + index * pitch,
            width: GEOMETRY.column,
            height: GEOMETRY.nodeHeight,
            boxShadow: "inset 3px 0 0 var(--run-fg), var(--sh-node)",
          }}
        >
          <span className="flex size-[38px] flex-none items-center justify-center rounded-md bg-sunk text-run-fg">
            <FileCsv size={21} weight="duotone" />
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate text-[16.5px] font-semibold">{name}</span>
            {index === 0 ? (
              <StatusBadge kind="run" label="Profilage" size={14.5} />
            ) : (
              <span className="flex items-center gap-1.5 text-[15.5px] text-tx3">
                <Spinner size={12} className="opacity-0" />
                En attente
              </span>
            )}
          </div>
        </div>
      ))}
      {skeletons.map((s) => (
        <span
          key={s.key}
          aria-hidden
          className={cn("absolute rounded-lg opacity-80", shimmer)}
          style={{ left: s.x, top: s.y, width: GEOMETRY.column, height: GEOMETRY.nodeHeight }}
        />
      ))}
    </ViewportPortal>
  );
}
