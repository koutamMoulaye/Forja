"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShellLoading, ShellMessage } from "@/components/shell/shell-states";
import { COOKIES } from "@/lib/auth/cookies";
import {
  readPreferenceCookie,
  useMe,
  useProjects,
  useSessionGuard,
} from "@/lib/session/use-session";
import { landingPath } from "@/lib/session/views";

/** "/": straight to the last project, on the pipeline or the analyst home. */
export function LandingRedirect() {
  useSessionGuard();
  const router = useRouter();
  const me = useMe();
  const projects = useProjects();

  useEffect(() => {
    if (!me.data || !projects.data) return;
    router.replace(
      landingPath(
        me.data,
        projects.data,
        readPreferenceCookie(COOKIES.project),
        readPreferenceCookie(COOKIES.view),
      ),
    );
  }, [me.data, projects.data, router]);

  if (projects.isError) {
    return (
      <ShellMessage
        title="Impossible de charger vos projets"
        description="L’API Forja ne répond pas. Vérifiez qu’elle est lancée, puis réessayez."
        action={{ label: "Réessayer", onClick: () => void projects.refetch() }}
      />
    );
  }
  return <ShellLoading />;
}
