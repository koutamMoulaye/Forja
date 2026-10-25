// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, browserRequest, fakeApi, json, pair, setCookies } from "@/test/fake-api";
import { relay } from "./relay";
import { callAsUser, refreshTokens, resetRefreshCache } from "./session";

describe("session", () => {
  beforeEach(() => resetRefreshCache());
  afterEach(() => vi.unstubAllGlobals());

  it("shares one refresh between concurrent requests", async () => {
    const api = fakeApi({ "POST /auth/refresh": () => json(pair("2")) });
    const request = browserRequest("/api/forja/projects");
    const [a, b] = await Promise.all([
      refreshTokens("rt-1", request),
      refreshTokens("rt-1", request),
    ]);
    expect(a).toEqual(b);
    expect(api.calls.filter((c) => c.key === "POST /auth/refresh")).toHaveLength(1);
  });

  it("refreshes first when the access cookie has expired, and stores the new pair", async () => {
    const api = fakeApi({
      "POST /auth/refresh": () => json(pair("2")),
      "GET /auth/me": (r) =>
        r.headers.get("authorization") === "Bearer at-2"
          ? json({ ok: true })
          : apiError(401, "unauthorized"),
    });
    const request = browserRequest("/api/auth/session", { cookies: { forja_rt: "rt-1" } });
    const call = await callAsUser(request, "/auth/me");
    expect(call.response?.status).toBe(200);
    const response = await relay(call, true);
    const cookies = setCookies(response);
    expect(cookies.forja_at).toContain("at-2");
    expect(cookies.forja_at).toContain("HttpOnly");
    expect(cookies.forja_at).toContain("Path=/api");
    expect(cookies.forja_rt).toContain("rt-2");
    expect(cookies.forja_rt).toContain("Max-Age=1209600");
    expect(cookies.forja_session).toContain("Path=/");
    expect(api.calls.map((c) => c.key)).toEqual(["POST /auth/refresh", "GET /auth/me"]);
    const refresh = api.calls[0]!.request;
    expect(refresh.headers.get("x-forwarded-for")).toBe("203.0.113.7");
  });

  it("retries once after a 401 with rotated tokens", async () => {
    fakeApi({
      "POST /auth/refresh": () => json(pair("2")),
      "GET /projects": (r) =>
        r.headers.get("authorization") === "Bearer at-2"
          ? json([])
          : apiError(401, "unauthorized", "access token expired: refresh it"),
    });
    const request = browserRequest("/api/forja/projects", {
      cookies: { forja_at: "at-1", forja_rt: "rt-1" },
    });
    const call = await callAsUser(request, "/projects");
    expect(call.response?.status).toBe(200);
    expect(call.pair?.refresh_token).toBe("rt-2");
  });

  it("ends the session when the refresh token is refused (reuse detected)", async () => {
    fakeApi({
      "POST /auth/refresh": () =>
        apiError(401, "unauthorized", "refresh token already used: the session is revoked"),
    });
    const request = browserRequest("/api/forja/projects", { cookies: { forja_rt: "rt-1" } });
    const call = await callAsUser(request, "/projects");
    expect(call.ended).toBe(true);
    const response = await relay(call, false);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "session_expired" } });
    const cookies = setCookies(response);
    expect(cookies.forja_rt).toContain("Max-Age=0");
    expect(cookies.forja_session).toContain("Max-Age=0");
  });

  it("keeps the session when the refresh is throttled", async () => {
    fakeApi({
      "POST /auth/refresh": () =>
        apiError(429, "too_many_attempts", "too many", { "Retry-After": "60" }),
    });
    const request = browserRequest("/api/forja/projects", { cookies: { forja_rt: "rt-1" } });
    const call = await callAsUser(request, "/projects");
    expect(call.ended).toBe(false);
    const response = await relay(call, false);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("passes a 401 through when retries are off (wrong current password)", async () => {
    const api = fakeApi({
      "POST /auth/password": () => apiError(401, "unauthorized", "current password is incorrect"),
    });
    const request = browserRequest("/api/auth/password", {
      method: "POST",
      cookies: { forja_at: "at-1", forja_rt: "rt-1" },
    });
    const call = await callAsUser(request, "/auth/password", { method: "POST", retryOn401: false });
    expect(call.ended).toBe(false);
    expect(call.response?.status).toBe(401);
    expect(api.calls).toHaveLength(1);
  });

  it("flags the session when the API asks for a new password", async () => {
    fakeApi({ "GET /projects": () => apiError(403, "password_change_required") });
    const request = browserRequest("/api/forja/projects", {
      cookies: { forja_at: "at-1", forja_rt: "rt-1" },
    });
    const response = await relay(await callAsUser(request, "/projects"), false);
    expect(response.status).toBe(403);
    expect(setCookies(response).forja_pwc).toContain("forja_pwc=1");
  });

  it("without a session, answers session_expired without calling the API", async () => {
    const api = fakeApi({});
    const call = await callAsUser(browserRequest("/api/auth/session"), "/auth/me");
    expect(call.ended).toBe(true);
    expect(call.failure?.status).toBe(401);
    expect(api.calls).toHaveLength(0);
  });
});
