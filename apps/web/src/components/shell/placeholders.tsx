"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { landingFor } from "@/lib/session/views";
import { useShell } from "./shell-context";

/** /projects/[projectId] alone: the role's landing page. */
export function ProjectIndex() {
  const shell = useShell();
  const router = useRouter();
  useEffect(() => {
    router.replace(landingFor(shell.project.id, shell.view));
  }, [router, shell.project.id, shell.view]);
  return null;
}
