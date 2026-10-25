import { COOKIES } from "./cookies";
import { CSRF_HEADER } from "./csrf-client";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function newCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The origin the browser used, honouring a reverse proxy's forwarded host. */
export function expectedOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

export type CsrfFailure = "origin" | "token";

/**
 * Checks a state-changing request: it must come from this origin (Origin, or Referer
 * when Origin is absent) and carry the double-submit token matching its cookie.
 * SameSite=Lax cookies already stop most cross-site posts; this closes the rest.
 */
export function checkCsrf(request: Request): CsrfFailure | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const expected = expectedOrigin(request);
  if (origin) {
    if (origin !== expected) return "origin";
  } else if (referer) {
    try {
      if (new URL(referer).origin !== expected) return "origin";
    } catch {
      return "origin";
    }
  } else if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return "origin";
  }
  const cookie = readCookie(request, COOKIES.csrf);
  const header = request.headers.get(CSRF_HEADER);
  if (!cookie || !header || !constantTimeEqual(cookie, header)) return "token";
  return null;
}
