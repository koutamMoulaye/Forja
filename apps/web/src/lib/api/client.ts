"use client";

import createClient, { type Middleware } from "openapi-fetch";
import { CSRF_HEADER, readCsrfToken } from "@/lib/auth/csrf-client";
import { ApiError, WEB_ERROR_CODES } from "./errors";
import type { paths } from "./schema";

/** Same-origin prefix of the proxy that forwards to the Forja API. */
export const API_PROXY_PREFIX = "/api/forja";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type SessionListener = (code: string) => void;
const sessionListeners = new Set<SessionListener>();

/** Called when the session ends (refresh refused) or the password must be changed. */
export function onSessionEnd(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

const csrf: Middleware = {
  onRequest({ request }) {
    if (MUTATIONS.has(request.method)) {
      const token = readCsrfToken();
      if (token) request.headers.set(CSRF_HEADER, token);
    }
    return request;
  },
};

const errors: Middleware = {
  async onResponse({ response }) {
    // 304: the caller sent If-None-Match and keeps what it has.
    if (response.ok || response.status === 304) return response;
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const error = ApiError.from(response.status, body, response.headers.get("Retry-After"));
    if (
      error.code === WEB_ERROR_CODES.sessionExpired ||
      error.code === "password_change_required"
    ) {
      sessionListeners.forEach((listener) => listener(error.code));
    }
    throw error;
  },
};

/** Typed client of the Forja API, through the same-origin proxy (cookies, never tokens). */
export const api = createClient<paths>({ baseUrl: API_PROXY_PREFIX });
api.use(csrf, errors);

/** Unwraps an openapi-fetch result; errors were already thrown by the middleware. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data === undefined) {
    if (result.response.status === 204) return undefined as T;
    throw new ApiError(result.response.status, "empty_response", "Réponse vide");
  }
  return result.data;
}
