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

  it("streams the event stream as it comes, uncompressed", async () => {
    const FRAME = "event: ping\ndata: {}\n\n";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(FRAME));
        controller.close();
      },
    });
    const upstream = new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
    });
    const response = await relay({ response: upstream } as Parameters<typeof relay>[0], false);
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe(FRAME);
  });
});
