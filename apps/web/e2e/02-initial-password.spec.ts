import { expect, test } from "@playwright/test";
import { E2E } from "./env.mjs";
import { capture, expectShell, signIn } from "./helpers";

const NEW_PASSWORD = "Nouveau-Forja-2026";

test("the initial password must be replaced before anything else", async ({ page }) => {
  const admin = { email: E2E.admin.email, password: E2E.admin.initialPassword };
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/auth\/change-password$/);

  // Every other page leads back here until the password is changed.
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/auth\/change-password$/);

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.reload();
    await page.getByLabel("Mot de passe initial").fill(admin.password);
    await page.getByRole("textbox", { name: "Nouveau mot de passe" }).fill(NEW_PASSWORD);
    await capture(page, `password-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });

  const save = page.getByRole("button", { name: "Enregistrer et continuer" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Confirmation").fill(NEW_PASSWORD);
  await expect(save).toBeEnabled();
  await save.click();

  // The instance administrator is admin of the demo project: the engineer side.
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);

  await page.getByTestId("user-menu").click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await signIn(page, { email: admin.email, password: NEW_PASSWORD });
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
});
