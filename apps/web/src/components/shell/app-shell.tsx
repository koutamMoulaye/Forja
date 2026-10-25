"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { signOut as signOutRequest } from "@/lib/auth/auth-client";
import { COOKIES } from "@/lib/auth/cookies";
import { cn } from "@/lib/cn";
import {
  SECTIONS,
  canOpen,
  isCanvasSection,
  parseProjectPath,
  sectionHref,
} from "@/lib/navigation";
import { useCounters } from "@/lib/project/use-counters";
import {
  useMe,
  useProjects,
  useSessionGuard,
  writePreferenceCookie,
  readPreferenceCookie,
} from "@/lib/session/use-session";
import { defaultView, landingFor, roleIn, viewsFor, type View } from "@/lib/session/views";
import { useTheme } from "@/lib/theme/use-theme";
import { TABLET_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { CommandPalette, rememberSection } from "./command-palette";
import { ShellLoading, ShellMessage } from "./shell-states";
import { ShellProvider, type Shell } from "./shell-context";
import { SIDEBAR_OPEN, SIDEBAR_RAIL, Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { ShortcutsDialog } from "./user-menu";

const SIDEBAR_KEY = "forja-sidebar";

function storedSidebar(): boolean | null {
  try {
    const value = window.localStorage.getItem(SIDEBAR_KEY);
    return value === "open" ? true : value === "rail" ? false : null;
  } catch {
    return null;
  }
}

/** Everything under /projects/[projectId]: sidebar, top bar, palette, role guard. */
export function AppShell({ children }: { children: React.ReactNode }) {
  useSessionGuard();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const me = useMe();
  const projects = useProjects();
  const tablet = useMediaQuery(TABLET_QUERY);
  const { resolved, setPreference } = useTheme();

  const location = parseProjectPath(pathname);
  const projectId = location?.projectId ?? "";
  const section = location?.section ?? null;
  const canvas = isCanvasSection(section);
  const project = projects.data?.find((p) => p.id === projectId) ?? null;
  const role = me.data && project ? roleIn(me.data, project.id) : null;
  const views = viewsFor(role);
  const [storedView, setStoredView] = useState<string | null>(() =>
    typeof document === "undefined" ? null : readPreferenceCookie(COOKIES.view),
  );
  // A view-specific section decides the view; shared ones keep the last one chosen.
  const ownView = section ? SECTIONS[section].view : null;
  const view: View | null =
    ownView && views.includes(ownView) ? ownView : defaultView(role, storedView);

  // Sidebar: folded on the canvas, open elsewhere unless the user folded it; overlay on tablets.
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : storedSidebar(),
  );
  // The canvas rail and the tablet overlay start folded on every section.
  const [transient, setTransient] = useState<{ section: string | null; open: boolean }>({
    section: null,
    open: false,
  });
  const transientOpen = transient.section === section && transient.open;
  const sidebarOpen = tablet || canvas ? transientOpen : (sidebarChoice ?? true);
  const setSidebarOpen = useCallback(
    (open: boolean) => {
      if (tablet || canvas) return setTransient({ section, open });
      setSidebarChoice(open);
      try {
        window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "rail");
      } catch {
        // Storage unavailable: the choice lasts for this page only.
      }
    },
    [tablet, canvas, section],
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const counters = useCounters(projectId, role);

  // Role guard: an analyst never opens the pipeline side, settings are the owner's.
  useEffect(() => {
    if (!me.data || !projects.data || !project || !role || !section) return;
    if (!canOpen(role, section)) {
      router.replace(landingFor(project.id, defaultView(role, null) ?? "analyst"));
    }
  }, [me.data, projects.data, project, role, section, router]);

  useEffect(() => {
    if (!project) return;
    writePreferenceCookie(COOKIES.project, project.id);
    if (section && role && canOpen(role, section)) rememberSection(project.id, section);
  }, [project, section, role]);

  const switchView = useCallback(
    (next: View) => {
      if (!project) return;
      writePreferenceCookie(COOKIES.view, next);
      setStoredView(next);
      router.push(landingFor(project.id, next));
      toast.info(
        next === "analyst"
          ? { title: "Vue Analyst", description: "Couches techniques et SQL masqués" }
          : { title: "Vue Engineer", description: "Pipeline complet et SQL visibles" },
      );
    },
    [project, router, setStoredView],
  );

  const switchProject = useCallback(
    (id: string) => {
      const target = projects.data?.find((p) => p.id === id);
      if (!target || !me.data) return;
      const targetRole = roleIn(me.data, id);
      const keep = section && canOpen(targetRole, section) ? section : null;
      router.push(
        keep
          ? sectionHref(id, keep)
          : landingFor(id, defaultView(targetRole, storedView) ?? "analyst"),
      );
    },
    [projects.data, me.data, section, storedView, router],
  );

  const signOut = useCallback(async () => {
    await signOutRequest().catch(() => null);
    queryClient.clear();
    router.replace("/auth/login");
  }, [queryClient, router]);

  // ⌘K palette, ⇧⌘L theme, ? shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (mod && event.shiftKey && key === "l") {
        event.preventDefault();
        setPreference(resolved === "dark" ? "light" : "dark");
      } else if (event.key === "?" && !mod && !isTyping(event.target)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolved, setPreference]);

  const shell = useMemo<Shell | null>(() => {
    if (!me.data || !project || !role || !view) return null;
    return {
      me: me.data,
      projects: projects.data ?? [],
      project,
      role,
      view,
      views,
      section,
      rest: location?.rest ?? [],
      counters,
      canvas,
      tablet,
      sidebarOpen,
      setSidebarOpen,
      paletteOpen,
      setPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
      switchView,
      switchProject,
      signOut: () => void signOut(),
    };
  }, [
    me.data,
    project,
    role,
    view,
    views,
    projects.data,
    section,
    location?.rest,
    counters,
    canvas,
    tablet,
    sidebarOpen,
    setSidebarOpen,
    paletteOpen,
    shortcutsOpen,
    switchView,
    switchProject,
    signOut,
  ]);

  if (me.isPending || projects.isPending) return <ShellLoading />;
  if (projects.isError || me.isError) {
    return (
      <ShellMessage
        title="Impossible de charger le projet"
        description="L’API Forja ne répond pas ou a refusé la demande. Réessayez dans un instant."
        action={{ label: "Réessayer", onClick: () => void projects.refetch() }}
      />
    );
  }
  if (!project || !role) {
    return (
      <ShellMessage
        title="Projet introuvable"
        description="Ce projet n’existe pas ou vous n’en êtes pas membre."
        action={{ label: "Mes projets", href: "/projects" }}
      />
    );
  }
  if (!shell || (section && !canOpen(role, section))) return <ShellLoading />;

  const left = tablet ? 0 : sidebarOpen ? SIDEBAR_OPEN : SIDEBAR_RAIL;
  return (
    <ShellProvider value={shell}>
      <div
        className="relative h-dvh overflow-hidden bg-bg"
        style={{ "--shell-left": `${left}px` } as React.CSSProperties}
      >
        <Sidebar />
        <TopBar />
        <main
          id="contenu"
          className={cn(
            "absolute right-0 bottom-0 overflow-auto transition-[left] duration-(--dur-layout) ease-soft",
            canvas ? "top-0" : "top-14",
          )}
          style={{ left: canvas ? 0 : "var(--shell-left)" }}
        >
          {children}
        </main>
        <CommandPalette />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </ShellProvider>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
