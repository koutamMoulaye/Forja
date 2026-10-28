import {
  BookOpenText,
  Broadcast,
  Broom,
  ChartPieSlice,
  ChatCircleText,
  ClockCounterClockwise,
  Cube,
  Files,
  GearSix,
  Graph,
  House,
  SealCheck,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import type { Role, View } from "@/lib/session/views";

/** Sections of a project; each one is a route under /projects/[projectId]. */
export type SectionId =
  | "pipeline"
  | "sources"
  | "cleaning"
  | "model"
  | "serving"
  | "approvals"
  | "runs"
  | "semantic"
  | "governance"
  | "settings"
  | "home"
  | "ask"
  | "marts"
  | "indicators";

/** Counters of items to review shown next to a section. */
export type CounterKey = "cleaning" | "model" | "approvals" | "runs" | "marts";

export type Section = {
  id: SectionId;
  label: string;
  icon: Icon;
  /** Views where the section lives; null for shared ones (settings). */
  view: View | null;
  counter?: CounterKey;
  /** Who may open it, beyond the view. */
  roles?: Role[];
};

export const SECTIONS: Record<SectionId, Section> = {
  pipeline: { id: "pipeline", label: "Pipeline", icon: Graph, view: "engineer" },
  sources: { id: "sources", label: "Sources", icon: Files, view: "engineer" },
  cleaning: {
    id: "cleaning",
    label: "Nettoyage",
    icon: Broom,
    view: "engineer",
    counter: "cleaning",
  },
  model: { id: "model", label: "Modèle", icon: Cube, view: "engineer", counter: "model" },
  serving: { id: "serving", label: "Diffusion", icon: Broadcast, view: "engineer" },
  approvals: {
    id: "approvals",
    label: "À approuver",
    icon: SealCheck,
    view: "engineer",
    counter: "approvals",
  },
  runs: {
    id: "runs",
    label: "Runs",
    icon: ClockCounterClockwise,
    view: "engineer",
    counter: "runs",
  },
  semantic: { id: "semantic", label: "Couche sémantique", icon: BookOpenText, view: "engineer" },
  governance: { id: "governance", label: "Gouvernance", icon: ShieldCheck, view: "engineer" },
  settings: { id: "settings", label: "Réglages", icon: GearSix, view: null, roles: ["admin"] },
  home: { id: "home", label: "Accueil", icon: House, view: "analyst" },
  ask: { id: "ask", label: "Poser une question", icon: ChatCircleText, view: "analyst" },
  marts: {
    id: "marts",
    label: "Mes data marts",
    icon: ChartPieSlice,
    view: "analyst",
    counter: "marts",
  },
  indicators: { id: "indicators", label: "Indicateurs", icon: BookOpenText, view: "analyst" },
};

/** Sidebar groups by view, in the mockups' order. */
export const NAVIGATION: Record<View, { main: SectionId[]; secondary: SectionId[] }> = {
  engineer: {
    main: ["pipeline", "sources", "cleaning", "model", "serving", "approvals", "runs"],
    secondary: ["semantic", "governance"],
  },
  analyst: { main: ["home", "ask", "marts", "indicators"], secondary: [] },
};

export function sectionHref(projectId: string, section: SectionId): string {
  return `/projects/${projectId}/${section}`;
}

/** The section of a pathname under /projects/[projectId], if any. */
export function parseProjectPath(
  pathname: string,
): { projectId: string; section: SectionId | null; rest: string[] } | null {
  const match = /^\/projects\/([^/]+)(?:\/([^/]+))?(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const section = match[2] && match[2] in SECTIONS ? (match[2] as SectionId) : null;
  return {
    projectId: decodeURIComponent(match[1]!),
    section,
    rest: match[3] ? match[3].split("/").filter(Boolean) : [],
  };
}

/** Whether a role may open a section; analysts never see the pipeline side. */
export function canOpen(role: Role | null, section: SectionId): boolean {
  if (!role) return false;
  const definition = SECTIONS[section];
  if (definition.roles && !definition.roles.includes(role)) return false;
  if (definition.view === "engineer") return role !== "analyst";
  return true;
}

/** Breadcrumb after the project name. */
export function breadcrumb(section: SectionId | null, rest: string[]): string[] {
  if (!section) return [];
  const base = SECTIONS[section].label;
  switch (section) {
    case "settings":
      return ["Réglages du projet"];
    case "model":
      return ["Modèle", "Revue du modèle en étoile"];
    case "sources":
      if (rest[1] === "plan") return ["Sources", "Revue du plan Silver"];
      return rest[0] ? [base, "Détail de la source"] : [base];
    case "runs":
      return rest[0] ? ["Runs", `run_${rest[0].slice(0, 6)}`] : [base];
    case "marts":
      return rest[1] === "preview" ? [base, "Aperçu de vérification"] : [base];
    case "approvals":
      return ["Data marts à approuver"];
    case "ask":
      return rest[0] ? [base, "Conversation"] : [base];
    default:
      return [base];
  }
}

/** The pipeline is a full-bleed canvas: translucent chrome, sidebar folded to a rail. */
export function isCanvasSection(section: SectionId | null): boolean {
  return section === "pipeline";
}
