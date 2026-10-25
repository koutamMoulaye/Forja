import type { components } from "@/lib/api/schema";

export type Role = components["schemas"]["Role"];
export type Me = components["schemas"]["Me"];
export type Project = components["schemas"]["Project"];

/** The two faces of the app: the pipeline (engineer) and the business side (analyst). */
export type View = "engineer" | "analyst";

/** Effective role in a project; the instance administrator is admin everywhere. */
export function roleIn(me: Me, projectId: string): Role | null {
  if (me.user.is_admin) return "admin";
  return me.roles[projectId] ?? null;
}

/** Views a role opens. Admins and engineers can also act as analysts. */
export function viewsFor(role: Role | null): View[] {
  if (role === "analyst") return ["analyst"];
  if (role === "engineer" || role === "admin") return ["engineer", "analyst"];
  return [];
}

export function isView(value: unknown): value is View {
  return value === "engineer" || value === "analyst";
}

export function defaultView(role: Role | null, preferred?: string | null): View | null {
  const views = viewsFor(role);
  if (views.length === 0) return null;
  if (isView(preferred) && views.includes(preferred)) return preferred;
  return views[0]!;
}

export function landingFor(projectId: string, view: View): string {
  return view === "analyst" ? `/projects/${projectId}/home` : `/projects/${projectId}/pipeline`;
}

/**
 * Where to go after signing in: the last project if still accessible, else the first
 * one; engineers land on the pipeline, analysts on their home page.
 */
export function landingPath(
  me: Me,
  projects: readonly Project[],
  preferredProject?: string | null,
  preferredView?: string | null,
): string {
  if (me.user.must_change_password) return "/auth/change-password";
  const project = projects.find((p) => p.id === preferredProject) ?? projects[0];
  if (!project) return "/projects";
  const view = defaultView(roleIn(me, project.id), preferredView);
  if (!view) return "/projects";
  return landingFor(project.id, view);
}

/** Only same-site paths are accepted as a destination after signing in. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  if (value.startsWith("/auth/") || value.startsWith("/api/")) return null;
  return value;
}
