import "server-only";

import { NextResponse } from "next/server";
import { isApiErrorBody } from "@/lib/api/errors";
import { clearSession, markPasswordChangeRequired, writeTokens, type SessionCall } from "./session";

/** Upstream headers worth passing to the browser. */
const PASSED_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "retry-after",
  "x-request-id",
  "cache-control",
  "etag",
  "last-modified",
];

export function relayHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return headers;
}

/**
 * Turns an authenticated call into the browser's response: the API's answer, plus the
 * cookie updates the call implied (new tokens, session ended, password to change).
 * Successful bodies are streamed; error bodies are small and read to spot
 * `password_change_required`.
 */
export async function relay(call: SessionCall, remember: boolean): Promise<NextResponse> {
  let response: NextResponse;
  let mustChangePassword = false;
  if (call.failure) {
    response = new NextResponse(call.failure.body, {
      status: call.failure.status,
      headers: call.failure.headers,
    });
  } else {
    const upstream = call.response!;
    const headers = relayHeaders(upstream);
    if (upstream.ok) {
      const body = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;
      response = new NextResponse(body, { status: upstream.status, headers });
    } else {
      const text = await upstream.text();
      headers.delete("content-length");
      if (upstream.status === 403) {
        try {
          const body: unknown = JSON.parse(text);
          mustChangePassword =
            isApiErrorBody(body) && body.error.code === "password_change_required";
        } catch {
          // Not JSON: nothing to flag.
        }
      }
      response = new NextResponse(text, { status: upstream.status, headers });
    }
  }
  if (call.ended) clearSession(response);
  else if (call.pair) writeTokens(response, call.pair, remember);
  if (mustChangePassword) markPasswordChangeRequired(response, remember);
  return response;
}
