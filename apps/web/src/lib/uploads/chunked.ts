"use client";

import { API_PROXY_PREFIX } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";
import { CSRF_HEADER, readCsrfToken } from "@/lib/auth/csrf-client";

type UploadSession = components["schemas"]["UploadSession"];
type Job = components["schemas"]["Job"];

export type UploadMode = { mode: "new_source" } | { mode: "new_version"; sourceId: string };

export type UploadProgress = {
  sent: number;
  total: number;
  /** « reprise » after a network cut, while the next attempt waits. */
  state: "sending" | "resuming" | "ingesting";
};

/** Waits between attempts after a network cut: 1, 2, 4, 8… up to 30 s. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const POLL_MS = 1000;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readCsrfToken();
  if (token && init.method && init.method !== "GET") headers.set(CSRF_HEADER, token);
  const response = await fetch(`${API_PROXY_PREFIX}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw ApiError.from(response.status, payload, response.headers.get("Retry-After"));
  }
  return response;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await (await call(path, init)).json()) as T;
}

/** Identity of a file on this browser: the same file, re-chosen, resumes its upload. */
export function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

/**
 * Sends a large file in chunks, resuming where the server's copy ends after a cut
 * (or after the page was reopened and the same file chosen again), then waits for the
 * run that streams it into Bronze. Returns that run, finished.
 */
export async function uploadInChunks(
  projectId: string,
  file: File,
  {
    mode,
    onProgress,
    signal,
  }: {
    mode?: UploadMode | null;
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Job> {
  let session = await json<UploadSession>(`/projects/${projectId}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      size: file.size,
      mode: mode?.mode ?? "auto",
      source_id: mode?.mode === "new_version" ? mode.sourceId : null,
      fingerprint: fingerprint(file),
    }),
    signal,
  });
  let failures = 0;
  while (session.received < session.size) {
    onProgress?.({
      sent: session.received,
      total: file.size,
      state: failures ? "resuming" : "sending",
    });
    const end = Math.min(session.received + session.chunk_size, file.size);
    try {
      session = await json<UploadSession>(
        `/uploads/${session.id}/chunks?offset=${session.received}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: file.slice(session.received, end),
          signal,
        },
      );
      failures = 0;
    } catch (error) {
      if (signal?.aborted) throw error;
      // The server's copy is the truth: a cut chunk may have been partly written, an
      // earlier attempt may have succeeded.
      if (
        error instanceof ApiError &&
        error.status !== 0 &&
        error.status !== 502 &&
        error.status !== 409
      ) {
        throw error;
      }
      if (failures >= RETRY_DELAYS_MS.length) throw error;
      onProgress?.({ sent: session.received, total: file.size, state: "resuming" });
      await wait(RETRY_DELAYS_MS[failures]!, signal);
      failures += 1;
      session = await json<UploadSession>(`/uploads/${session.id}`, { signal }).catch(
        () => session,
      );
    }
  }
  onProgress?.({ sent: file.size, total: file.size, state: "ingesting" });
  let job = await json<Job>(`/uploads/${session.id}/complete`, { method: "POST", signal });
  while (job.status === "queued" || job.status === "running") {
    await wait(POLL_MS, signal);
    job = await json<Job>(`/runs/${job.id}`, { signal });
  }
  if (job.status !== "succeeded") {
    throw new ApiError(422, "ingestion_failed", job.error ?? "Le fichier n’a pas pu être chargé.");
  }
  return job;
}

/** Above one chunk, a file goes through the resumable upload. */
export function needsChunks(file: File, chunkMb: number | null | undefined): boolean {
  return chunkMb != null && file.size > chunkMb * 1024 * 1024;
}
