"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { keys } from "@/lib/project/queries";
import {
  progressLabel,
  sendSourceFile,
  useUploadSettings,
  type UploadProgress,
} from "@/lib/uploads/send";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls,.parquet,.json,.jsonl,.ndjson";

/** A hidden file input and the upload of what it receives (in chunks when large). */
export function useFileUpload(projectId: string) {
  const queryClient = useQueryClient();
  const { maxMb, chunkMb } = useUploadSettings();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | undefined>();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await sendSourceFile(projectId, file, null, chunkMb, setProgress);
        toast.success({ title: `${file.name} chargé`, description: "Profil et plan prêts" });
      }
    } catch (error) {
      toast.error({
        title: "Chargement impossible",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setUploading(false);
      setProgress(undefined);
      if (input.current) input.current.value = "";
      void queryClient.invalidateQueries({ queryKey: keys.sources(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["graph", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["counters", projectId] });
    }
  };

  const element = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      accept={ACCEPT}
      data-testid="source-upload-input"
      onChange={(event) => void upload(event.target.files)}
    />
  );
  return {
    element,
    choose: () => input.current?.click(),
    uploading,
    label: progressLabel(progress),
    maxMb,
  };
}
