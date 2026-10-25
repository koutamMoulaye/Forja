import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import type { components } from "@/lib/api/schema";
import { WEB_ERROR_CODES, parseRetryAfter } from "@/lib/api/errors";
import {
  ACCESS_EXPIRY_MARGIN,
  COOKIES,
  REFRESH_MAX_AGE,
  TOKEN_COOKIE_PATH,
  secureCookies,
} from "./cookies";
import { errorResponse, forwardedHeaders, readJson, upstream } from "./upstream";

export type TokenPair = components["schemas"]["TokenPair"];

export type SessionCookies = {
  access: string | null;
  refresh: string | null;
  remember: boolean;
};

export function readSession(request: NextRequest): SessionCookies {
  return {
    access: request.cookies.get(COOKIES.access)?.value ?? null,
    refresh: request.cookies.get(COOKIES.refresh)?.value ?? null,
    remember: request.cookies.get(COOKIES.remember)?.value === "1",
  };
}

function base(path: string) {
  return { httpOnly: true, sameSite: "lax" as const, secure: secureCookies(), path };
}

/** Stores a token pair; without "remember", the refresh cookie ends with the browser. */
export function writeTokens(response: NextResponse, pair: TokenPair, remember: boolean): void {
  const persistent = remember ? { maxAge: REFRESH_MAX_AGE } : {};
  response.cookies.set(COOKIES.access, pair.access_token, {
    ...base(TOKEN_COOKIE_PATH),
    maxAge: Math.max(1, pair.expires_in - ACCESS_EXPIRY_MARGIN),
  });
  response.cookies.set(COOKIES.refresh, pair.refresh_token, {
    ...base(TOKEN_COOKIE_PATH),
    ...persistent,
  });
  if (remember) {
    response.cookies.set(COOKIES.remember, "1", { ...base(TOKEN_COOKIE_PATH), ...persistent });
  } else {
    response.cookies.delete({ name: COOKIES.remember, path: TOKEN_COOKIE_PATH });
  }
  response.cookies.set(COOKIES.session, "1", { ...base("/"), ...persistent });
  if (pair.must_change_password) {
    response.cookies.set(COOKIES.passwordChange, "1", { ...base("/"), ...persistent });
  } else {
    response.cookies.delete({ name: COOKIES.passwordChange, path: "/" });
  }
}

export function markPasswordChangeRequired(response: NextResponse, remember: boolean): void {
  response.cookies.set(COOKIES.passwordChange, "1", {
    ...base("/"),
    ...(remember ? { maxAge: REFRESH_MAX_AGE } : {}),
  });
}

export function clearSession(response: NextResponse): void {
  for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.remember]) {
    response.cookies.set(name, "", { ...base(TOKEN_COOKIE_PATH), maxAge: 0 });
  }
  for (const name of [COOKIES.session, COOKIES.passwordChange]) {
    response.cookies.set(name, "", { ...base("/"), maxAge: 0 });
  }
}

// --- Refresh -------------------------------------------------------------------------

export type RefreshOutcome =
  | { ok: true; pair: TokenPair }
  | { ok: false; status: number; body: unknown; retryAfter: number | null };

/**
 * Concurrent requests carrying the same refresh token share one refresh: the API treats
 * a second use of a token as theft and revokes the whole session. The result stays
 * available for REUSE_WINDOW_MS, long enough for the browser to store the new cookies.
 * The map is per process: run the web server as one process or use sticky sessions.
 */
const REUSE_WINDOW_MS = 30_000;
const inflight = new Map<string, Promise<RefreshOutcome>>();

export function refreshTokens(refreshToken: string, request: Request): Promise<RefreshOutcome> {
  const pending = inflight.get(refreshToken);
  if (pending) return pending;
  const promise = (async (): Promise<RefreshOutcome> => {
    const headers = forwardedHeaders(request);
    headers.set("Content-Type", "application/json");
    try {
      const response = await upstream("/auth/refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const body = await readJson(response);
      if (response.ok) return { ok: true, pair: body as TokenPair };
      return {
        ok: false,
        status: response.status,
        body,
        retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
      };
    } catch {
      return { ok: false, status: 502, body: null, retryAfter: null };
    }
  })();
  inflight.set(refreshToken, promise);
  const timer = setTimeout(() => inflight.delete(refreshToken), REUSE_WINDOW_MS);
  (timer as { unref?: () => void }).unref?.();
  return promise;
}

/** For tests: forget shared refreshes. */
export function resetRefreshCache(): void {
  inflight.clear();
}

// --- Authenticated calls -------------------------------------------------------------

export type SessionCall = {
  /** The API response, or null when the session could not be used. */
  response: Response | null;
  /** New tokens obtained on the way, to store on the outgoing response. */
  pair: TokenPair | null;
  /** Set when the session is over (refresh refused): cookies must be cleared. */
  ended: boolean;
  /** A response to return as is (refresh throttled, API unreachable...). */
  failure: Response | null;
};

function refreshFailure(outcome: Extract<RefreshOutcome, { ok: false }>): {
  ended: boolean;
  failure: Response;
} {
  if (outcome.status === 401 || outcome.status === 403) {
    return {
      ended: true,
      failure: errorResponse(401, WEB_ERROR_CODES.sessionExpired, "Votre session a expiré."),
    };
  }
  if (outcome.status === 429) {
    return {
      ended: false,
      failure: errorResponse(429, "too_many_attempts", "Trop de tentatives.", {
        headers: outcome.retryAfter ? { "Retry-After": String(outcome.retryAfter) } : undefined,
      }),
    };
  }
  return {
    ended: false,
    failure: errorResponse(502, WEB_ERROR_CODES.apiUnreachable, "L’API Forja ne répond pas."),
  };
}

/**
 * Calls the API as the signed-in user. Refreshes first when the access cookie has
 * expired, and once more on a 401 when the body can be sent again.
 */
export async function callAsUser(
  request: NextRequest,
  path: string,
  init: {
    method?: string;
    headers?: Headers;
    body?: () => BodyInit | null;
    replayable?: boolean;
    retryOn401?: boolean;
  } = {},
): Promise<SessionCall> {
  const session = readSession(request);
  let access = session.access;
  let pair: TokenPair | null = null;

  const refresh = async (): Promise<SessionCall | null> => {
    if (!session.refresh) {
      return {
        response: null,
        pair: null,
        ended: true,
        failure: errorResponse(401, WEB_ERROR_CODES.sessionExpired, "Votre session a expiré."),
      };
    }
    const outcome = await refreshTokens(session.refresh, request);
    if (!outcome.ok) return { response: null, pair: null, ...refreshFailure(outcome) };
    pair = outcome.pair;
    access = outcome.pair.access_token;
    return null;
  };

  if (!access) {
    const stop = await refresh();
    if (stop) return stop;
  }

  const send = () =>
    upstream(path, {
      method: init.method ?? "GET",
      headers: init.headers ?? forwardedHeaders(request),
      body: init.body ? init.body() : null,
      accessToken: access,
    });

  let response = await send();
  const canRetry = (init.retryOn401 ?? true) && (init.replayable ?? true) && pair === null;
  if (response.status === 401 && canRetry) {
    const stop = await refresh();
    if (stop) return stop;
    response = await send();
  }
  // Still refused with brand new tokens: the session is gone. A 401 that was not retried
  // (wrong current password, upload stream) goes back to the caller unchanged.
  if (response.status === 401 && pair !== null) {
    return {
      response: null,
      pair: null,
      ended: true,
      failure: errorResponse(401, WEB_ERROR_CODES.sessionExpired, "Votre session a expiré."),
    };
  }
  return { response, pair, ended: false, failure: null };
}
