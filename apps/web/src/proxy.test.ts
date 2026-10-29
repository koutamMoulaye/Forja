// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function page(path: string, cookies: Record<string, string> = {}) {
  const headers = new Headers();
  const all = { forja_csrf: "t", ...cookies };
  headers.set(
    "cookie",
    Object.entries(all)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
  );
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

const location = (response: Response) => {
  const value = response.headers.get("location");
  return value ? new URL(value).pathname + new URL(value).search : null;
};

describe("page routing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends signed-out visitors to the login screen, keeping their destination", () => {
    const response = proxy(page("/projects/p1/runs?status=failed"));
    expect(location(response)).toBe("/auth/login?next=%2Fprojects%2Fp1%2Fruns%3Fstatus%3Dfailed");
  });

  it("holds a user with the initial password on the password screen", () => {
    const response = proxy(page("/projects/p1/pipeline", { forja_session: "1", forja_pwc: "1" }));
    expect(location(response)).toBe("/auth/change-password");
    expect(location(proxy(page("/auth/login", { forja_session: "1", forja_pwc: "1" })))).toBe(
      "/auth/change-password",
    );
  });

  it("lets signed-in users through and away from the login screen", () => {
    expect(location(proxy(page("/projects/p1/pipeline", { forja_session: "1" })))).toBeNull();
    expect(location(proxy(page("/auth/login", { forja_session: "1" })))).toBe("/");
    expect(location(proxy(page("/auth/change-password")))).toBe("/auth/login");
  });

  it("opens an invitation link signed out as well as signed in", () => {
    expect(location(proxy(page("/auth/invite/abc")))).toBeNull();
    expect(location(proxy(page("/auth/invite/abc", { forja_session: "1" })))).toBeNull();
    expect(location(proxy(page("/auth/inviter")))).toBe("/auth/login?next=%2Fauth%2Finviter");
  });

  it("issues a CSRF cookie to pages that lack one", () => {
    const request = new NextRequest("http://localhost:3000/auth/login");
    const cookie = proxy(request).headers.getSetCookie().join(";");
    expect(cookie).toMatch(/forja_csrf=[0-9a-f]{64}/);
  });

  it("hides the design system page in production unless enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(page("/design-system")).status).toBe(404);
    vi.stubEnv("FORJA_WEB_DESIGN_SYSTEM", "true");
    expect(proxy(page("/design-system")).status).toBe(200);
  });
});

describe("content security policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("gives each page a fresh nonce, passed on to the rendering", () => {
    const first = proxy(page("/auth/login"));
    const second = proxy(page("/auth/login"));
    const csp = first.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
    expect(nonce.length).toBeGreaterThanOrEqual(22);
    expect(second.headers.get("content-security-policy")).not.toContain(nonce);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    // Next.js reads the nonce from the request it renders.
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("sends Strict-Transport-Security in production over HTTPS only", () => {
    expect(proxy(page("/auth/login")).headers.get("strict-transport-security")).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FORJA_WEB_SECURE_COOKIES", "true");
    expect(proxy(page("/auth/login")).headers.get("strict-transport-security")).toMatch(
      /^max-age=31536000/,
    );
    vi.stubEnv("FORJA_WEB_SECURE_COOKIES", "false");
    expect(proxy(page("/auth/login")).headers.get("strict-transport-security")).toBeNull();
  });
});
