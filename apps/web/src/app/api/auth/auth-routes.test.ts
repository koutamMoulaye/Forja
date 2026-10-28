// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRefreshCache } from "@/lib/auth/session";
import { CSRF, apiError, browserRequest, fakeApi, json, pair, setCookies } from "@/test/fake-api";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { POST as lookupInvitation } from "./invitation/route";
import { POST as changePassword } from "./password/route";
import { POST as register } from "./register/route";
import { GET as forwardGet, POST as forwardPost } from "../forja/[...path]/route";

const ME = {
  user: { id: "u1", email: "ingenieur@demo.forja.local", created_at: "2026-10-24T14:26:43Z" },
  via: "password",
  roles: { p1: "engineer" },
  auth_mode: "local",
};
const PROJECTS = [
  {
    id: "p1",
    name: "Démo e-commerce",
    architecture: "medallion",
    created_at: "2026-10-24T14:26:43Z",
  },
];

const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("auth routes", () => {
  beforeEach(() => resetRefreshCache());
  afterEach(() => vi.unstubAllGlobals());

  it("signs in: tokens in httpOnly cookies, a new CSRF token, the role's landing page", async () => {
    const api = fakeApi({
      "POST /auth/login": () => json(pair("1")),
      "GET /auth/me": () => json(ME),
      "GET /projects": () => json(PROJECTS),
    });
    const response = await login(
      browserRequest("/api/auth/login", {
        method: "POST",
        body: { email: " ingenieur@demo.forja.local ", password: "secret", remember: false },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirect: "/projects/p1/pipeline",
      must_change_password: false,
    });
    const cookies = setCookies(response);
    expect(cookies.forja_at).toMatch(/HttpOnly/);
    expect(cookies.forja_rt).toMatch(/HttpOnly/);
    expect(cookies.forja_rt).not.toMatch(/Max-Age/);
    expect(cookies.forja_csrf).not.toMatch(/HttpOnly/);
    expect(cookies.forja_csrf).not.toContain(CSRF);
    const sent = (await api.calls[0]!.request.json()) as { email: string };
    expect(sent.email).toBe("ingenieur@demo.forja.local");
  });

  it("sends a first-time user to the password screen", async () => {
    fakeApi({ "POST /auth/login": () => json(pair("1", true)) });
    const response = await login(
      browserRequest("/api/auth/login", {
        method: "POST",
        body: { email: "admin@forja.local", password: "initial" },
      }),
    );
    expect(await response.json()).toMatchObject({ redirect: "/auth/change-password" });
    expect(setCookies(response).forja_pwc).toContain("forja_pwc=1");
  });

  it("passes the lockout through with its Retry-After", async () => {
    fakeApi({
      "POST /auth/login": () =>
        apiError(429, "too_many_attempts", "too many failed attempts", { "Retry-After": "57" }),
    });
    const response = await login(
      browserRequest("/api/auth/login", {
        method: "POST",
        body: { email: "a@b.fr", password: "x" },
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("57");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("registers from an invitation and signs the new account in", async () => {
    const api = fakeApi({
      "POST /auth/register": () => json(pair("9"), 201),
      "GET /auth/me": () => json({ ...ME, roles: { p1: "analyst" } }),
      "GET /projects": () => json(PROJECTS),
    });
    const response = await register(
      browserRequest("/api/auth/register", {
        method: "POST",
        body: { token: "tok", password: "Bienvenue-2026x", name: "  Nora Nouvelle " },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirect: "/projects/p1/home" });
    const cookies = setCookies(response);
    expect(cookies.forja_at).toMatch(/HttpOnly/);
    expect(cookies.forja_rt).toMatch(/Max-Age/);
    const sent = (await api.calls[0]!.request.json()) as { name: string; token: string };
    expect(sent).toMatchObject({ token: "tok", name: "Nora Nouvelle" });
  });

  it("relays a refused registration and an invitation's status", async () => {
    fakeApi({
      "POST /auth/register": () => apiError(401, "unauthorized", "invitation revoked"),
      "POST /auth/invitations/lookup": () =>
        json({ status: "expired", project_name: "Démo e-commerce" }),
    });
    const refused = await register(
      browserRequest("/api/auth/register", {
        method: "POST",
        body: { token: "tok", password: "x" },
      }),
    );
    expect(refused.status).toBe(401);
    expect(refused.headers.getSetCookie()).toEqual([]);
    const status = await lookupInvitation(
      browserRequest("/api/auth/invitation", { method: "POST", body: { token: "tok" } }),
    );
    expect(await status.json()).toEqual({ status: "expired", project_name: "Démo e-commerce" });
    const missing = await lookupInvitation(
      browserRequest("/api/auth/invitation", { method: "POST", body: {} }),
    );
    expect(missing.status).toBe(422);
  });

  it("refuses a sign-in without the CSRF token", async () => {
    const api = fakeApi({});
    const response = await login(
      browserRequest("/api/auth/login", {
        method: "POST",
        csrf: null,
        body: { email: "a@b.fr", password: "x" },
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "csrf_failed" } });
    expect(api.calls).toHaveLength(0);
  });

  it("changes the password and stores the new pair", async () => {
    fakeApi({
      "POST /auth/password": () => json(pair("2")),
      "GET /auth/me": () => json(ME),
      "GET /projects": () => json(PROJECTS),
    });
    const response = await changePassword(
      browserRequest("/api/auth/password", {
        method: "POST",
        cookies: { forja_at: "at-1", forja_rt: "rt-1", forja_pwc: "1" },
        body: { current_password: "initial", new_password: "Nouveau-mot-2026" },
      }),
    );
    expect(await response.json()).toEqual({ redirect: "/projects/p1/pipeline" });
    const cookies = setCookies(response);
    expect(cookies.forja_at).toContain("at-2");
    expect(cookies.forja_pwc).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
  });

  it("reports a wrong current password without ending the session", async () => {
    fakeApi({
      "POST /auth/password": () => apiError(401, "unauthorized", "current password is incorrect"),
    });
    const response = await changePassword(
      browserRequest("/api/auth/password", {
        method: "POST",
        cookies: { forja_at: "at-1", forja_rt: "rt-1" },
        body: { current_password: "wrong", new_password: "Nouveau-mot-2026" },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("signs out on the API and clears every cookie", async () => {
    const api = fakeApi({ "POST /auth/logout": () => new Response(null, { status: 204 }) });
    const response = await logout(
      browserRequest("/api/auth/logout", {
        method: "POST",
        cookies: { forja_at: "at-1", forja_rt: "rt-1" },
      }),
    );
    expect(response.status).toBe(204);
    expect(api.calls[0]!.request.headers.get("authorization")).toBe("Bearer at-1");
    const cookies = setCookies(response);
    for (const name of ["forja_at", "forja_rt", "forja_session"]) {
      expect(cookies[name]).toContain("Max-Age=0");
    }
  });
});

describe("API proxy", () => {
  beforeEach(() => resetRefreshCache());
  afterEach(() => vi.unstubAllGlobals());

  it("forwards reads with the bearer token and the query string", async () => {
    const api = fakeApi({ "GET /projects/p1/runs": () => json([]) });
    const response = await forwardGet(
      browserRequest("/api/forja/projects/p1/runs?limit=5", {
        cookies: { forja_at: "at-1", forja_rt: "rt-1" },
      }),
      params("projects", "p1", "runs"),
    );
    expect(response.status).toBe(200);
    const sent = api.calls[0]!.request;
    expect(sent.headers.get("authorization")).toBe("Bearer at-1");
    expect(new URL(sent.url).search).toBe("?limit=5");
  });

  it("refuses mutations without the CSRF token", async () => {
    const api = fakeApi({});
    const response = await forwardPost(
      browserRequest("/api/forja/projects/p1/runs", {
        method: "POST",
        csrf: null,
        cookies: { forja_at: "at-1" },
        body: { type: "profile" },
      }),
      params("projects", "p1", "runs"),
    );
    expect(response.status).toBe(403);
    expect(api.calls).toHaveLength(0);
  });

  it("never forwards the token endpoints", async () => {
    const api = fakeApi({});
    const response = await forwardPost(
      browserRequest("/api/forja/auth/refresh", { method: "POST", body: {} }),
      params("auth", "refresh"),
    );
    expect(response.status).toBe(404);
    const traversal = await forwardGet(
      browserRequest("/api/forja/x/../auth/refresh"),
      params("x", "..", "auth", "refresh"),
    );
    expect(traversal.status).toBe(400);
    expect(api.calls).toHaveLength(0);
  });

  it("replays a buffered body after refreshing an expired token", async () => {
    const bodies: string[] = [];
    fakeApi({
      "POST /auth/refresh": () => json(pair("2")),
      "POST /projects/p1/runs": async (r) => {
        bodies.push(await r.text());
        return r.headers.get("authorization") === "Bearer at-2"
          ? json({ id: "run1" }, 202)
          : apiError(401, "unauthorized", "access token expired: refresh it");
      },
    });
    const request = browserRequest("/api/forja/projects/p1/runs", {
      method: "POST",
      cookies: { forja_at: "at-1", forja_rt: "rt-1" },
      body: { type: "profile" },
    });
    request.headers.set("content-length", String(JSON.stringify({ type: "profile" }).length));
    const response = await forwardPost(request, params("projects", "p1", "runs"));
    expect(response.status).toBe(202);
    expect(bodies).toEqual(['{"type":"profile"}', '{"type":"profile"}']);
  });
});
