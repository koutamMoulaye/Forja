"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileArrowUp, Globe, HardDrives, type Icon } from "@phosphor-icons/react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  useRefreshConnections,
  type Connection,
  type ImportResponse,
} from "@/lib/connections/queries";
import { formatLimit } from "@/lib/uploads/send";
import { ApiWizard } from "./api-wizard";
import { DatabaseWizard } from "./database-wizard";

type Kind = "file" | "database" | "api";

const KINDS: { kind: Kind; icon: Icon; title: string; detail: string }[] = [
  {
    kind: "file",
    icon: FileArrowUp,
    title: "Fichier",
    detail: "CSV, Excel, Parquet ou JSON, depuis ce poste",
  },
  {
    kind: "database",
    icon: HardDrives,
    title: "Base de données",
    detail: "PostgreSQL, MySQL ou MariaDB, SQL Server",
  },
  { kind: "api", icon: Globe, title: "API", detail: "Une API REST qui répond en JSON" },
];

const TITLES: Record<Exclude<Kind, "file">, { title: string; description: string }> = {
  database: {
    title: "Connecter une base de données",
    description: "Forja lit les tables choisies, en entier ou seulement les nouvelles lignes.",
  },
  api: {
    title: "Connecter une API",
    description: "Forja suit la pagination et aplatit les enregistrements en tables.",
  },
};

/** « Ajouter une source »: a file, a database or an API; the last two open a wizard. */
export function AddSourceDialog({
  projectId,
  open,
  onOpenChange,
  onChooseFile,
  uploadLimitMb,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseFile: () => void;
  uploadLimitMb: number | null;
}) {
  const [kind, setKind] = useState<Exclude<Kind, "file"> | null>(null);
  const router = useRouter();
  const refresh = useRefreshConnections(projectId);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setKind(null);
  };
  const done = ({ connection, imported }: { connection: Connection; imported: ImportResponse }) => {
    close(false);
    void refresh();
    toast.success({
      title: `${connection.name} connectée`,
      description: imported.run
        ? `Premier chargement de ${imported.feeds.length} source${imported.feeds.length > 1 ? "s" : ""} lancé`
        : "Sources enregistrées",
    });
    router.push(`/projects/${projectId}/sources/connections`);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        data-testid="add-source-dialog"
        className={cn(
          kind
            ? "top-[8vh] max-h-[84vh] w-[min(780px,calc(100vw-32px))]"
            : "w-[min(560px,calc(100vw-32px))]",
        )}
      >
        <DialogHeader>
          <DialogTitle>{kind ? TITLES[kind].title : "Ajouter une source"}</DialogTitle>
          <DialogDescription>
            {kind ? TITLES[kind].description : "D’où viennent les données ?"}
          </DialogDescription>
        </DialogHeader>
        {kind === "database" ? (
          <DatabaseWizard projectId={projectId} onDone={done} />
        ) : kind === "api" ? (
          <ApiWizard projectId={projectId} onDone={done} />
        ) : (
          <DialogBody className="flex flex-col gap-2 pb-6">
            {KINDS.map((item) => (
              <button
                key={item.kind}
                type="button"
                data-testid={`add-source-${item.kind}`}
                onClick={() => {
                  if (item.kind === "file") {
                    close(false);
                    onChooseFile();
                  } else {
                    setKind(item.kind);
                  }
                }}
                className="flex items-center gap-3.5 rounded-xl border-0 bg-node px-4 py-3.5 text-left shadow-sm transition-shadow hover:shadow-hover"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-acc-soft text-acc-tx">
                  <item.icon size={22} weight="duotone" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{item.title}</span>
                  <span className="text-meta text-tx3">
                    {item.detail}
                    {item.kind === "file" && uploadLimitMb
                      ? `, jusqu’à ${formatLimit(uploadLimitMb)}`
                      : ""}
                  </span>
                </span>
              </button>
            ))}
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
