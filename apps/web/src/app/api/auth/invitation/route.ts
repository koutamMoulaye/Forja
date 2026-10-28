import { NextResponse, type NextRequest } from "next/server";
import { csrfRejection, readJsonBody, withApiErrors } from "@/lib/auth/guard";
import { relayHeaders } from "@/lib/auth/relay";
import { errorResponse, forwardedHeaders, upstream } from "@/lib/auth/upstream";

/** What an invitation link leads to, before any account exists (no session needed). */
export const POST = withApiErrors(async (request: NextRequest) => {
  const rejected = csrfRejection(request);
  if (rejected) return rejected;
  const body = await readJsonBody<{ token?: unknown }>(request);
  if (!body || typeof body.token !== "string") {
    return errorResponse(422, "validation_error", "Invitation requise.");
  }
  const headers = forwardedHeaders(request);
  headers.set("Content-Type", "application/json");
  const response = await upstream("/auth/invitations/lookup", {
    method: "POST",
    headers,
    body: JSON.stringify({ token: body.token }),
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: relayHeaders(response),
  });
});
