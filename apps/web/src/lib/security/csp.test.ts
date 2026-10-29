// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SONNER_STYLE_HASHES, contentSecurityPolicy } from "./csp";

const hash = (text: string) => `sha256-${createHash("sha256").update(text).digest("base64")}`;

describe("content security policy", () => {
  it("allows the stylesheet the toast library inserts, and nothing else inline", () => {
    const source = readFileSync(join(process.cwd(), "node_modules/sonner/dist/index.mjs"), "utf8");
    const css = JSON.parse(/__insertCSS\((".*?")\)/s.exec(source)![1]!) as string;
    expect(SONNER_STYLE_HASHES).toEqual([hash(css), hash("")]);
    const csp = contentSecurityPolicy("abc");
    const inline = csp.split("; ").filter((directive) => directive.includes("'unsafe-inline'"));
    expect(inline).toEqual(["style-src-attr 'unsafe-inline'"]);
    expect(contentSecurityPolicy("abc", { dev: true })).toContain("'unsafe-eval'");
  });
});
