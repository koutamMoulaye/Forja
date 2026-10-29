import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export type { APIRequestContext, Browser, Page } from "@playwright/test";
export { request } from "@playwright/test";

/**
 * Every end-to-end test fails on a Content-Security-Policy violation: Chromium reports
 * each refused script, style, connection or frame in the console.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      const watch = (page: Page) =>
        page.on("console", (message) => {
          const text = message.text();
          if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/.test(text)) {
            violations.push(`${page.url()}: ${text}`);
          }
        });
      context.pages().forEach(watch);
      context.on("page", watch);
      await use();
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
