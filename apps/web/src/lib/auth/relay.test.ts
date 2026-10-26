import { describe, expect, it } from "vitest";
import { relay } from "./relay";

describe("relay", () => {
  it("passes a 304 through, without a body and with its ETag", async () => {
    const upstream = new Response(null, { status: 304, headers: { ETag: '"abc"' } });
    const response = await relay({ response: upstream } as Parameters<typeof relay>[0], false);
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"abc"');
    expect(await response.text()).toBe("");
  });
});
