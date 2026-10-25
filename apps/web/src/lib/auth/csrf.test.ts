// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CSRF, browserRequest } from "@/test/fake-api";
import { checkCsrf, newCsrfToken } from "./csrf";
import { readCsrfToken } from "./csrf-client";

describe("CSRF checks", () => {
  it("let safe methods through", () => {
    expect(
      checkCsrf(browserRequest("/api/forja/projects", { csrf: null, origin: null })),
    ).toBeNull();
  });

  it("accept a same-origin mutation carrying the cookie's token", () => {
    expect(checkCsrf(browserRequest("/api/auth/logout", { method: "POST" }))).toBeNull();
  });

  it("refuse another origin", () => {
    const request = browserRequest("/api/auth/logout", {
      method: "POST",
      origin: "https://evil.example",
    });
    expect(checkCsrf(request)).toBe("origin");
  });

  it("refuse a missing or different token", () => {
    expect(checkCsrf(browserRequest("/api/auth/logout", { method: "POST", csrf: null }))).toBe(
      "token",
    );
    expect(
      checkCsrf(browserRequest("/api/auth/logout", { method: "POST", csrf: "d".repeat(64) })),
    ).toBe("token");
  });

  it("refuse a request without Origin, Referer or same-origin fetch metadata", () => {
    expect(checkCsrf(browserRequest("/api/auth/logout", { method: "POST", origin: null }))).toBe(
      "origin",
    );
  });

  it("generate long random tokens", () => {
    const a = newCsrfToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newCsrfToken()).not.toBe(a);
  });

  it("read the token from document.cookie", () => {
    expect(readCsrfToken(`forja_view=engineer; forja_csrf=${CSRF}`)).toBe(CSRF);
    expect(readCsrfToken("forja_view=engineer")).toBeNull();
  });
});
