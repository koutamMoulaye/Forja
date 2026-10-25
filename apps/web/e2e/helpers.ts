import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

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
