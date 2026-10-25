import { NextResponse, type NextRequest } from "next/server";
import { csrfRejection } from "@/lib/auth/guard";
import { callAsUser, clearSession, readSession } from "@/lib/auth/session";

/** Revokes the session on the API, then forgets the cookies whatever the outcome. */
export async function POST(request: NextRequest) {
  const rejected = csrfRejection(request);
  if (rejected) return rejected;
  const session = readSession(request);
  if (session.access || session.refresh) {
    try {
      await callAsUser(request, "/auth/logout", { method: "POST", retryOn401: false });
    } catch {
      // The API is unreachable: the cookies are cleared anyway.
    }
  }
  const response = new NextResponse(null, { status: 204 });
  clearSession(response);
  return response;
}
