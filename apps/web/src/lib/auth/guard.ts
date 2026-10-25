import "server-only";

import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";
import { checkCsrf } from "./csrf";
import { errorResponse } from "./upstream";

/** Refuses a state-changing request that fails the CSRF checks. */
export function csrfRejection(request: Request): Response | null {
  const failure = checkCsrf(request);
  if (!failure) return null;
  return errorResponse(
    403,
    WEB_ERROR_CODES.csrf,
    failure === "origin"
      ? "Requête refusée : origine inattendue."
      : "Requête refusée : jeton de sécurité absent ou invalide. Rechargez la page.",
  );
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Route handler wrapper: an unreachable API becomes a JSON 502, not a crash. */
export function withApiErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error.status, error.code, error.message);
      throw error;
    }
  };
}
