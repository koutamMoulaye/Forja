import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./e2e/env.mjs";

const web = `http://localhost:${E2E.webPort}`;

/**
 * End-to-end tests against the real Forja API, started on a fresh workspace with the
 * demonstration project, and the production build of the web app.
 */
export default defineConfig({
  testDir: "./e2e",
  // Removes the test PostgreSQL of the connector tests (e2e/start-api.mjs).
  globalTeardown: "./e2e/teardown.mjs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: web,
    locale: "fr-FR",
    viewport: { width: 1440, height: 900 },
    // Traces and screenshots of failures only; no video. The comparison captures go to
    // test-results/captures, emptied at the start of each run.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@perf/,
    },
    // Load times are measured in Google Chrome, the browser people use: Playwright's
    // Chromium build ran the same scripts six times slower on the reference workstation
    // (ELK's first layout: 841 ms against 129 ms), which no user ever sees.
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
      },
      grep: /@perf/,
    },
  ],
  webServer: [
    {
      command: "node e2e/start-api.mjs",
      url: `http://127.0.0.1:${E2E.apiPort}/health`,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: process.env.E2E_SKIP_BUILD
        ? `pnpm exec next start -p ${E2E.webPort}`
        : `pnpm build && pnpm exec next start -p ${E2E.webPort}`,
      url: `${web}/auth/login`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        FORJA_API_URL: `http://127.0.0.1:${E2E.apiPort}`,
        FORJA_WEB_DESIGN_SYSTEM: "true",
      },
    },
  ],
});
