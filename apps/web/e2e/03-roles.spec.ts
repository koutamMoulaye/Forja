import { expect, test, type Page } from "@playwright/test";
import { credentials, expectShell, signIn } from "./helpers";

const ENGINEER_NAV = [
  "Pipeline",
  "Sources",
  "Nettoyage",
  "Modèle",
  "Diffusion",
  "Runs",
  "Couche sémantique",
  "Gouvernance",
];
const ANALYST_NAV = ["Accueil", "Poser une question", "Mes data marts", "Indicateurs"];

const nav = (page: Page) => page.getByRole("navigation", { name: "Navigation du projet" });

test("an analyst sees the business side only", async ({ page }) => {
  await signIn(page, credentials().analyst);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/home$/);
  await expectShell(page);
  for (const label of ANALYST_NAV) {
    await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav(page).getByRole("link", { name: "Pipeline" })).toHaveCount(0);

  // The pipeline side is out of reach, even by URL.
  await page.goto(page.url().replace(/\/home$/, "/pipeline"));
  await expect(page).toHaveURL(/\/home$/);

  // No view switch for a single role.
  await page.getByTestId("user-menu").click();
  await expect(page.getByRole("group", { name: "Apparence" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Vue" })).toHaveCount(0);
});

test("an engineer navigates the pipeline side and switches to the analyst view", async ({
  page,
}) => {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/pipeline$/);
  // Folded to a rail on the canvas: open it to read the labels.
  await page.getByTestId("sidebar-toggle").click();
  for (const label of ENGINEER_NAV) {
    await expect(nav(page).getByRole("link", { name: label })).toBeVisible();
  }

  await nav(page).getByRole("link", { name: "Runs" }).click();
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
  // The previous page may stay mounted, hidden, for instant back navigation.
  await expect(page.getByTestId("runs-screen").filter({ visible: true })).toBeVisible();

  await page.getByTestId("notifications-bell").click();
  await expect(page).toHaveURL(/\?panel=notifications$/);
  await expect(
    page.getByText("Tout marquer comme lu").or(page.getByText("Rien de nouveau")),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/runs$/);

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Rechercher une section ou une action").fill("semantique");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/semantic$/);

  await page.getByTestId("user-menu").click();
  await page.getByRole("group", { name: "Vue" }).getByRole("button", { name: "Analyst" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(nav(page).getByRole("link", { name: "Mes data marts" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Runs" })).toHaveCount(0);
});
