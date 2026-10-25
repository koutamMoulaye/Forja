import { NextResponse, type NextRequest } from "next/server";
import { csrfRejection, readJsonBody } from "@/lib/auth/guard";
import { landingWithToken } from "@/lib/auth/landing-server";
import { relay } from "@/lib/auth/relay";
import { callAsUser, readSession, writeTokens, type TokenPair } from "@/lib/auth/session";
import { errorResponse, forwardedHeaders, readJson } from "@/lib/auth/upstream";

type PasswordBody = { current_password?: unknown; new_password?: unknown };

/**
 * Replaces the password. The API revokes every session and returns a new pair, stored
 * here; a 401 means the current password is wrong, not that the session ended.
 */
export async function POST(request: NextRequest) {
  const rejected = csrfRejection(request);
  if (rejected) return rejected;
  const body = await readJsonBody<PasswordBody>(request);
  if (!body || typeof body.current_password !== "string" || typeof body.new_password !== "string") {
    return errorResponse(422, "validation_error", "Mot de passe actuel et nouveau requis.");
  }
  const session = readSession(request);
  const headers = forwardedHeaders(request);
  headers.set("Content-Type", "application/json");
  const payload = JSON.stringify({
    current_password: body.current_password,
    new_password: body.new_password,
  });
  const call = await callAsUser(request, "/auth/password", {
    method: "POST",
    headers,
    body: () => payload,
    retryOn401: false,
  });
  if (call.failure || !call.response?.ok) return relay(call, session.remember);

  const pair = (await readJson(call.response)) as TokenPair;
  const redirect = await landingWithToken(request, pair.access_token);
  const response = NextResponse.json({ redirect }, { headers: { "cache-control": "no-store" } });
  writeTokens(response, pair, session.remember);
  return response;
}
