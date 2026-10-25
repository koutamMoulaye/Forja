"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretRight, FolderSimple } from "@phosphor-icons/react";
import { Logotype } from "@/components/brand/logo";
import { ROLE_LABELS } from "@/components/shell/shell-context";
import { ShellLoading } from "@/components/shell/shell-states";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/auth-client";
import { useMe, useProjects, useSessionGuard } from "@/lib/session/use-session";
import { defaultView, landingFor, roleIn } from "@/lib/session/views";

/** /projects: the projects the user belongs to, or how to get one. */
export function ProjectList() {
  useSessionGuard();
  const router = useRouter();
  const me = useMe();
  const projects = useProjects();
  if (!me.data || !projects.data) return <ShellLoading />;
  const list = projects.data;
  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-bg px-4 py-16">
      <Logotype size={40} />
      <section className="flex w-full max-w-[520px] flex-col gap-3 rounded-3xl bg-node p-6 shadow-float">
        <div className="flex flex-col gap-1 px-1">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">Vos projets</h1>
          <p className="m-0 text-[14px] text-tx2">
            {list.length
              ? "Choisissez le projet à ouvrir."
              : me.data.user.is_admin
                ? "Aucun projet pour l’instant. Créez-en un avec l’API, ou lancez « forja demo » pour la démonstration."
                : "Vous n’êtes membre d’aucun projet. Demandez une invitation à votre administrateur."}
          </p>
        </div>
        {list.map((project) => {
          const role = roleIn(me.data, project.id);
          const view = defaultView(role, null);
          if (!role || !view) return null;
          return (
            <Link
              key={project.id}
              href={landingFor(project.id, view)}
              className="flex items-center gap-3 rounded-xl p-3 text-tx no-underline transition-colors hover:bg-sunk hover:no-underline"
            >
              <span className="flex size-10 flex-none items-center justify-center rounded-[11px] bg-sunk text-tx2">
                <FolderSimple size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold">{project.name}</span>
                <span className="truncate text-meta text-tx3">
                  {ROLE_LABELS[role]}
                  {project.description ? ` · ${project.description}` : ""}
                </span>
              </span>
              <CaretRight size={16} className="text-tx3" />
            </Link>
          );
        })}
      </section>
      <Button
        variant="quiet"
        onClick={async () => {
          await signOut().catch(() => null);
          router.replace("/auth/login");
        }}
      >
        Se déconnecter
      </Button>
    </main>
  );
}
