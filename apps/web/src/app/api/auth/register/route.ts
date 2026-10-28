import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, secureCookies } from "@/lib/auth/cookies";
import { newCsrfToken } from "@/lib/auth/csrf";
import { csrfRejection, readJsonBody, withApiErrors } from "@/lib/auth/guard";
import { landingWithToken } from "@/lib/auth/landing-server";
import { relayHeaders } from "@/lib/auth/relay";
import { writeTokens, type TokenPair } from "@/lib/auth/session";
import { errorResponse, forwardedHeaders, readJson, upstream } from "@/lib/auth/upstream";

type RegisterBody = { token?: unknown; password?: unknown; name?: unknown };

/**
 * Creates the account of an invitation, then signs it in: the token pair goes into
 * httpOnly cookies and the browser gets the role's landing page.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const rejected = csrfRejection(request);
  if (rejected) return rejected;
  const body = await readJsonBody<RegisterBody>(request);
  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return errorResponse(422, "validation_error", "Invitation et mot de passe requis.");
  }
  const headers = forwardedHeaders(request);
  headers.set("Content-Type", "application/json");
  const response = await upstream("/auth/register", {
    method: "POST",
    headers,
    body: JSON.stringify({
      token: body.token,
      password: body.password,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
    }),
  });
  if (!response.ok) {
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: relayHeaders(response),
    });
  }
  const pair = (await readJson(response)) as TokenPair;
  const redirect = await landingWithToken(request, pair.access_token);
  const result = NextResponse.json({ redirect }, { headers: { "cache-control": "no-store" } });
  writeTokens(result, pair, true);
  result.cookies.set(COOKIES.csrf, newCsrfToken(), {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
  });
  return result;
});
