"use client";

import { createContext, useContext } from "react";
import type { Counters } from "@/lib/project/use-counters";
import type { Filter, GraphNode } from "@/lib/pipeline/model";
import type { SectionId } from "@/lib/navigation";
import type { Me, Project, Role, View } from "@/lib/session/views";

/** What the canvas lends the palette while it is open: its nodes and actions on them. */
export type CanvasCommands = {
  nodes: { node: GraphNode; lane: string }[];
  /** Selects the node and moves the camera to it. */
  focus: (id: string) => void;
  /** Selects the node on an inspector tab. */
  review: (id: string, tab: "overview" | "columns" | "rules" | "quality" | "history") => void;
  run: (type: "build_all" | "build_silver" | "build_gold") => void;
  add: () => void;
  filter: (filter: Filter) => void;
  fit: () => void;
};

/** A node growing into its detailed screen (double-click), shared through the shell. */
export type SharedTransition = {
  id: string;
  name: string;
  type: GraphNode["type"];
  rect: { x: number; y: number; width: number; height: number };
  href: string;
};

export type Shell = {
  me: Me;
  projects: Project[];
  project: Project;
  role: Role;
  view: View;
  views: View[];
  section: SectionId | null;
  rest: string[];
  counters: Counters;
  canvas: boolean;
  tablet: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  switchView: (view: View) => void;
  switchProject: (projectId: string) => void;
  signOut: () => void;
  canvasCommands: CanvasCommands | null;
  registerCanvas: (commands: CanvasCommands | null) => void;
  transition: SharedTransition | null;
  startTransition: (transition: SharedTransition) => void;
};

const ShellContext = createContext<Shell | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used within the project shell");
  return shell;
}

/** Initials for the avatar: "thomas.lefevre@…" gives TL, "ingenieur@…" gives IN. */
export function initialsOf(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  engineer: "Engineer",
  analyst: "Analyst",
};
