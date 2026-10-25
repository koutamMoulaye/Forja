"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, onSessionEnd, unwrap } from "@/lib/api/client";
import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";
import type { Me, Project } from "./views";

export const sessionKeys = {
  me: ["session", "me"] as const,
  projects: ["session", "projects"] as const,
};

async function fetchMe(): Promise<Me> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw ApiError.from(response.status, body, response.headers.get("Retry-After"));
  return body as Me;
}

/** The signed-in user and their role in each project. */
export function useMe() {
  return useQuery({ queryKey: sessionKeys.me, queryFn: fetchMe, staleTime: 60_000 });
}

export function useProjects() {
  return useQuery({
    queryKey: sessionKeys.projects,
    queryFn: async (): Promise<Project[]> => unwrap(await api.GET("/projects")),
    staleTime: 60_000,
  });
}

/**
 * Leaves the app when the session ends (refresh refused, reuse detected) or when the
 * API demands a new password first.
 */
export function useSessionGuard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  useEffect(
    () =>
      onSessionEnd((code) => {
        queryClient.clear();
        router.replace(
          code === "password_change_required" ? "/auth/change-password" : "/auth/login",
        );
      }),
    [queryClient, router],
  );

  useEffect(() => {
    const error = me.error;
    if (!(error instanceof ApiError)) return;
    if (error.code === WEB_ERROR_CODES.sessionExpired || error.status === 401) {
      queryClient.clear();
      router.replace("/auth/login");
    }
  }, [me.error, queryClient, router]);

  useEffect(() => {
    if (me.data?.user.must_change_password) router.replace("/auth/change-password");
  }, [me.data, router]);
}

/** Readable cookie written by the browser (view and last project; no secret). */
export function writePreferenceCookie(name: string, value: string) {
  const maxAge = 365 * 24 * 3600;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function readPreferenceCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
