// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError, parseRetryAfter } from "./errors";

describe("parseRetryAfter", () => {
  it("reads a delay in seconds", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("reads an HTTP date", () => {
    const now = Date.parse("2026-10-25T10:00:00Z");
    expect(parseRetryAfter("Sun, 25 Oct 2026 10:01:30 GMT", now)).toBe(90);
  });

  it("ignores missing or malformed values", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("bientôt")).toBeNull();
  });
});

describe("ApiError.from", () => {
  it("keeps the API's code, message and details", () => {
    const error = ApiError.from(
      429,
      { error: { code: "too_many_attempts", message: "too many", details: { scope: "account" } } },
      "60",
    );
    expect(error).toMatchObject({ status: 429, code: "too_many_attempts", retryAfter: 60 });
    expect(error.details).toEqual({ scope: "account" });
  });

  it("falls back on the status for unknown bodies", () => {
    expect(ApiError.from(500, "<html>", null).code).toBe("http_error");
    expect(ApiError.from(422, { detail: [] }, null).code).toBe("validation_error");
  });
});
