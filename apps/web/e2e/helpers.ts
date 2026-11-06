import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, request, type Page } from "@playwright/test";
import { E2E } from "./env.mjs";

type Account = { email: string; password: string };
export type Credentials = { admin: Account; engineer: Account; analyst: Account };

/** Accounts created by `forja demo` for this run (written by e2e/start-api.mjs). */
export function credentials(): Credentials {
  return JSON.parse(
    readFileSync(join(__dirname, ".data", "credentials.json"), "utf8"),
  ) as Credentials;
}

export async function signIn(page: Page, account: Account) {
  await page.goto("/auth/login");
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

export async function expectShell(page: Page) {
  await expect(page.getByTestId("user-menu")).toBeVisible();
}

// Playwright compiles the tests as CommonJS: __dirname is this folder.
export const CAPTURES = join(__dirname, "..", "test-results", "captures");

/** Full-page capture kept as an artefact, to compare with design/. */
export async function capture(page: Page, name: string) {
  mkdirSync(CAPTURES, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(CAPTURES, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

export const API = `http://127.0.0.1:${E2E.apiPort}`;

/** The administrator with its final password, whatever the tests before it did. */
export async function adminAccount() {
  const api = await request.newContext({ baseURL: API });
  const first = await api.post("/auth/login", {
    data: { email: E2E.admin.email, password: E2E.admin.newPassword },
  });
  if (!first.ok()) {
    const login = await api.post("/auth/login", {
      data: { email: E2E.admin.email, password: E2E.admin.initialPassword },
    });
    const token = (await login.json()).access_token as string;
    await api.post("/auth/password", {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_password: E2E.admin.initialPassword, new_password: E2E.admin.newPassword },
    });
  }
  await api.dispose();
  return { email: E2E.admin.email, password: E2E.admin.newPassword };
}

/**
 * Every compartment starts below the top bar, its tinted zone and its title; the first
 * one also starts right of the sidebar, its title whole (MT-2). Fails the test
 * when a title is covered, whatever the size of the window.
 */
export async function expectClear(page: Page, stage: string) {
  await page.waitForTimeout(700); // the camera moves for 450 ms
  const bar = (await page
    .locator("header")
    .filter({ has: page.getByTestId("project-selector") })
    .boundingBox())!;
  const sidebar = await page.getByRole("complementary", { name: "Barre latérale" }).boundingBox();
  const right = sidebar ? sidebar.x + sidebar.width : 0;
  const viewport = page.viewportSize()!;
  for (const lane of ["sources", "cleaning", "star_schema", "serving"]) {
    const zone = page.getByTestId(`lane-${lane}`);
    const box = (await zone.boundingBox())!;
    const title = (await zone.locator("h2").boundingBox())!;
    expect
      .soft(box.y, `${stage}: ${lane} under the top bar`)
      .toBeGreaterThanOrEqual(bar.y + bar.height);
    expect
      .soft(title.y, `${stage}: title of ${lane} under the top bar`)
      .toBeGreaterThanOrEqual(bar.y + bar.height);
    if (lane === "sources") {
      expect.soft(box.x, `${stage}: ${lane} under the sidebar`).toBeGreaterThanOrEqual(right);
      expect
        .soft(title.x + title.width, `${stage}: title of ${lane} cut on the right`)
        .toBeLessThanOrEqual(viewport.width);
    }
  }
}

/** The same capture in the light and the dark theme. */
export async function captureThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(300);
    await capture(page, `${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}
