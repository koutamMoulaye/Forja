import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, secureCookies } from "@/lib/auth/cookies";
import { newCsrfToken } from "@/lib/auth/csrf";
import { csrfRejection, readJsonBody, withApiErrors } from "@/lib/auth/guard";
import { landingWithToken } from "@/lib/auth/landing-server";
import { writeTokens, type TokenPair } from "@/lib/auth/session";
import { errorResponse, forwardedHeaders, readJson, upstream } from "@/lib/auth/upstream";
import { relayHeaders } from "@/lib/auth/relay";
import { safeNextPath } from "@/lib/session/views";

type LoginBody = { email?: unknown; password?: unknown; remember?: unknown; next?: unknown };

/** Signs in: the token pair goes into httpOnly cookies, the browser gets a destination. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const rejected = csrfRejection(request);
  if (rejected) return rejected;
  const body = await readJsonBody<LoginBody>(request);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return errorResponse(422, "validation_error", "Adresse e-mail et mot de passe requis.");
  }
  const remember = body.remember !== false;

  const headers = forwardedHeaders(request);
  headers.set("Content-Type", "application/json");
  const response = await upstream("/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: body.email.trim(), password: body.password }),
  });
  if (!response.ok) {
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: relayHeaders(response),
    });
  }

  const pair = (await readJson(response)) as TokenPair;
  const next = safeNextPath(typeof body.next === "string" ? body.next : null);
  const redirect = pair.must_change_password
    ? "/auth/change-password"
    : (next ?? (await landingWithToken(request, pair.access_token)));

  const result = NextResponse.json(
    { redirect, must_change_password: pair.must_change_password ?? false },
    { headers: { "cache-control": "no-store" } },
  );
  writeTokens(result, pair, remember);
  // A new CSRF token for the new session: one planted before sign-in is worthless.
  result.cookies.set(COOKIES.csrf, newCsrfToken(), {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
  });
  return result;
});
