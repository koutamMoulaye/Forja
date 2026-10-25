import { vi } from "vitest";
import { NextRequest } from "next/server";

export const ORIGIN = "http://localhost:3000";
export const CSRF = "c".repeat(64);

type Handler = (request: Request) => Response | Promise<Response>;

/** Replaces fetch with a fake Forja API keyed by "METHOD /path". */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: { key: string; request: Request }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;
    calls.push({ key, request: request.clone() });
    const handler = routes[key];
    if (!handler) return new Response("not found", { status: 404 });
    return handler(request);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers });
}

export function apiError(status: number, code: string, message = code, headers: HeadersInit = {}) {
  return json({ error: { code, message, details: {} } }, status, headers);
}

export const pair = (suffix: string, mustChange = false) => ({
  access_token: `at-${suffix}`,
  refresh_token: `rt-${suffix}`,
  expires_in: 900,
  token_type: "bearer",
  must_change_password: mustChange,
});

/** A browser request to the web server, with cookies and the CSRF header. */
export function browserRequest(
  path: string,
  init: {
    method?: string;
    cookies?: Record<string, string>;
    body?: unknown;
    csrf?: string | null;
    origin?: string | null;
  } = {},
) {
  const headers = new Headers();
  const cookies = { forja_csrf: CSRF, ...init.cookies };
  headers.set(
    "cookie",
    Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
  );
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  if (init.csrf !== null) headers.set("x-csrf-token", init.csrf ?? CSRF);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", "203.0.113.7");
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
}

/** Set-Cookie headers of a response, by cookie name. */
export function setCookies(response: Response): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of response.headers.getSetCookie()) {
    const name = line.split("=")[0]!;
    result[name] = line;
  }
  return result;
}
