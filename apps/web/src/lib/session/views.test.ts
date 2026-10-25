import { describe, expect, it } from "vitest";
import { landingPath, roleIn, safeNextPath, viewsFor, type Me, type Project } from "./views";

const project = (id: string): Project => ({
  id,
  name: id,
  architecture: "medallion",
  created_at: "2026-10-24T14:26:43Z",
});

const me = (roles: Me["roles"], extra: Partial<Me["user"]> = {}): Me => ({
  user: {
    id: "u",
    email: "u@exemple.fr",
    created_at: "2026-10-24T14:26:43Z",
    disabled: false,
    identity_provider: "password",
    is_admin: false,
    must_change_password: false,
    ...extra,
  },
  via: "password",
  roles,
  auth_mode: "local",
});

describe("views and landing", () => {
  it("gives admins and engineers both views, analysts one", () => {
    expect(viewsFor("admin")).toEqual(["engineer", "analyst"]);
    expect(viewsFor("engineer")).toEqual(["engineer", "analyst"]);
    expect(viewsFor("analyst")).toEqual(["analyst"]);
    expect(viewsFor(null)).toEqual([]);
  });

  it("treats the instance administrator as admin of every project", () => {
    expect(roleIn(me({}, { is_admin: true }), "p1")).toBe("admin");
    expect(roleIn(me({ p1: "analyst" }), "p2")).toBeNull();
  });

  it("sends engineers to the pipeline and analysts home", () => {
    const projects = [project("p1")];
    expect(landingPath(me({ p1: "engineer" }), projects)).toBe("/projects/p1/pipeline");
    expect(landingPath(me({ p1: "analyst" }), projects)).toBe("/projects/p1/home");
  });

  it("reopens the last project and view when still allowed", () => {
    const projects = [project("p1"), project("p2")];
    const user = me({ p1: "engineer", p2: "engineer" });
    expect(landingPath(user, projects, "p2", "analyst")).toBe("/projects/p2/home");
    expect(landingPath(me({ p1: "analyst" }), projects, "p1", "engineer")).toBe(
      "/projects/p1/home",
    );
    expect(landingPath(user, projects, "gone")).toBe("/projects/p1/pipeline");
  });

  it("holds a user on the password screen until the initial password is replaced", () => {
    expect(landingPath(me({}, { must_change_password: true }), [])).toBe("/auth/change-password");
  });

  it("falls back to the project list without a project", () => {
    expect(landingPath(me({}), [])).toBe("/projects");
  });

  it("only accepts local paths as a destination", () => {
    expect(safeNextPath("/projects/p1/runs?status=failed")).toBe("/projects/p1/runs?status=failed");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/auth/login")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
