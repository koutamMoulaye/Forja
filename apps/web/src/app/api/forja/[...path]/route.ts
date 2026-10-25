import type { NextRequest } from "next/server";
import { csrfRejection } from "@/lib/auth/guard";
import { relay } from "@/lib/auth/relay";
import { callAsUser, readSession } from "@/lib/auth/session";
import { errorResponse, forwardedHeaders } from "@/lib/auth/upstream";

/** Endpoints handled by dedicated routes, never forwarded with the user's tokens. */
const RESERVED = /^auth\/(login|refresh|logout|password|register)(\/|$)/;

/** Bodies up to this size are buffered so the call can be retried after a refresh. */
const REPLAYABLE_BYTES = 10 * 1024 * 1024;

const REQUEST_HEADERS = ["content-type", "accept", "if-none-match", "if-modified-since"];

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context): Promise<Response> {
  const { path } = await context.params;
  const joined = path.map(encodeURIComponent).join("/");
  if (path.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return errorResponse(400, "invalid_path", "Chemin invalide.");
  }
  if (RESERVED.test(joined)) {
    return errorResponse(404, "not_found", "Route inconnue.");
  }
  const rejected = csrfRejection(request);
  if (rejected) return rejected;

  const headers = forwardedHeaders(request);
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && request.body !== null;
  const length = Number(request.headers.get("content-length") ?? NaN);
  const buffered = hasBody && Number.isFinite(length) && length <= REPLAYABLE_BYTES;
  const payload = buffered ? await request.arrayBuffer() : null;

  const call = await callAsUser(request, `/${joined}${request.nextUrl.search}`, {
    method,
    headers,
    body: () => (hasBody ? (payload ?? request.body) : null),
    replayable: !hasBody || buffered,
  });
  return relay(call, readSession(request).remember);
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
