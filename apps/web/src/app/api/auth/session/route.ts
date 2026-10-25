import type { NextRequest } from "next/server";
import { withApiErrors } from "@/lib/auth/guard";
import { relay } from "@/lib/auth/relay";
import { callAsUser, readSession } from "@/lib/auth/session";

/** The signed-in user and their roles (GET /auth/me), refreshing tokens when needed. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const call = await callAsUser(request, "/auth/me");
  return relay(call, readSession(request).remember);
});
