"use client";

import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";
import { CSRF_HEADER, readCsrfToken } from "./csrf-client";
import type { InvitationStatus } from "./invitation";

/** POSTs JSON to one of the web server's own auth routes. */
export async function postAuth<T>(path: string, body?: unknown): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  const token = readCsrfToken();
  if (token) headers.set(CSRF_HEADER, token);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, WEB_ERROR_CODES.apiUnreachable, "Le serveur ne répond pas.");
  }
  const payload: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (!response.ok) {
    throw ApiError.from(response.status, payload, response.headers.get("Retry-After"));
  }
  return payload as T;
}

export type SignInResult = { redirect: string; must_change_password: boolean };

export function signIn(input: {
  email: string;
  password: string;
  remember: boolean;
  next?: string | null;
}) {
  return postAuth<SignInResult>("/api/auth/login", input);
}

export function changePassword(input: { current_password: string; new_password: string }) {
  return postAuth<{ redirect: string }>("/api/auth/password", input);
}

export function signOut() {
  return postAuth<null>("/api/auth/logout");
}

export function lookupInvitation(token: string) {
  return postAuth<InvitationStatus>("/api/auth/invitation", { token });
}

export function register(input: { token: string; password: string; name: string }) {
  return postAuth<{ redirect: string }>("/api/auth/register", input);
}
