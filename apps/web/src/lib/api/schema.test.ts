// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SCHEMA_FILE, renderSchema } from "../../../scripts/api-schema.mjs";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

describe("generated API client", () => {
  it("matches docs/openapi.json (run `pnpm api:generate` after `forja openapi`)", async () => {
    const committed = normalize(await readFile(SCHEMA_FILE, "utf8"));
    expect(committed === normalize(await renderSchema())).toBe(true);
  }, 30_000);
});
