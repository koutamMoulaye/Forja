"use client";

import { useQuery } from "@tanstack/react-query";
import { API_PROXY_PREFIX } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { CSRF_HEADER, readCsrfToken } from "@/lib/auth/csrf-client";
import { needsChunks, uploadInChunks, type UploadMode, type UploadProgress } from "./chunked";

export type { UploadMode, UploadProgress } from "./chunked";

/** « 200 Mo », « 10 Go ». */
export function formatLimit(megabytes: number): string {
  return megabytes >= 1024
    ? `${String(Math.round((megabytes / 1024) * 10) / 10).replace(".", ",")} Go`
    : `${megabytes} Mo`;
}

/** Upload limits of the instance: largest file, and chunk size of resumable uploads. */
export function useUploadSettings(): { maxMb: number | null; chunkMb: number | null } {
  const health = useQuery({
    queryKey: ["health"],
    staleTime: Infinity,
    queryFn: async () =>
      (await (await fetch("/api/health")).json()) as {
        max_upload_mb?: number;
        upload_chunk_mb?: number;
      },
  });
  return {
    maxMb: health.data?.max_upload_mb ?? null,
    chunkMb: health.data?.upload_chunk_mb ?? null,
  };
}

async function sendWhole(projectId: string, file: File, mode: UploadMode | null) {
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
 * Sends a file to become a source: in one request when it fits in a chunk (profiled before
 * the answer), else in resumable chunks, streamed into Bronze by a run.
 */
export async function sendSourceFile(
  projectId: string,
  file: File,
  mode: UploadMode | null,
  chunkMb: number | null,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  if (needsChunks(file, chunkMb)) {
    await uploadInChunks(projectId, file, { mode, onProgress });
    return;
  }
  await sendWhole(projectId, file, mode);
}

/** « 42 % », « Reprise… », « Lecture… » of a file being sent. */
export function progressLabel(progress: UploadProgress | undefined): string | null {
  if (!progress) return null;
  if (progress.state === "ingesting") return "Lecture et profilage";
  if (progress.state === "resuming") return "Connexion perdue, reprise…";
  return `Envoi ${Math.floor((100 * progress.sent) / Math.max(1, progress.total))} %`;
}
