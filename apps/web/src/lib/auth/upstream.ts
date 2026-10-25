import "server-only";

import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";

/** Base URL of the Forja API, reachable from the web server only. */
export function apiBaseUrl(): string {
  return (process.env.FORJA_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
}

/** Headers describing the browser's request, forwarded for throttling and tracing. */
export function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("X-Request-ID", requestId);
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("User-Agent", userAgent);
  return headers;
}

export type UpstreamInit = {
  method?: string;
  headers?: Headers;
  body?: BodyInit | null;
  accessToken?: string | null;
  signal?: AbortSignal;
};

/** Calls the Forja API; a network failure becomes a 502 `api_unreachable`. */
export async function upstream(path: string, init: UpstreamInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  const streaming = typeof ReadableStream !== "undefined" && init.body instanceof ReadableStream;
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body ?? null,
      redirect: "manual",
      cache: "no-store",
      signal: init.signal ?? null,
      ...(streaming ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new ApiError(502, WEB_ERROR_CODES.apiUnreachable, "L’API Forja ne répond pas.");
  }
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** JSON error response in the API's own format. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  init: { headers?: HeadersInit; details?: Record<string, unknown> } = {},
): Response {
  return Response.json(
    { error: { code, message, details: init.details ?? {} } },
    { status, headers: init.headers },
  );
}
