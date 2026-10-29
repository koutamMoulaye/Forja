import { expect, test } from "./fixtures";
import { capture, credentials, expectShell, signIn } from "./helpers";

test.describe("sign-in", () => {
  test("signed-out visitors are sent to the login screen", async ({ page }) => {
    await page.goto("/projects/any/runs");
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fprojects%2Fany%2Fruns$/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByText("Demandez à votre administrateur")).toBeVisible();
    await expect(page.getByText(/instance partagée · licence Apache 2\.0/)).toBeVisible();
  });

  test("captures of the login screen in both themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/auth/login");
      await expect(page.getByText(/Forja \d/)).toBeVisible();
      await page.getByLabel("Adresse e-mail").fill("thomas.lefevre@exemple.fr");
      await page.getByLabel("Mot de passe", { exact: true }).fill("un-mot-de-passe");
      await page.getByLabel("Mot de passe", { exact: true }).focus();
      await capture(page, `login-${theme}`);
    }
  });

  test("a wrong password is reported without leaving the screen", async ({ page }) => {
    const { engineer } = credentials();
    await signIn(page, { email: engineer.email, password: "pas-le-bon-mot-de-passe" });
    await expect(page.getByRole("region", { name: "Connexion" }).getByRole("alert")).toHaveText(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("repeated failures lock the form with a countdown", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Adresse e-mail").fill("inconnu@exemple.fr");
    const locked = page.getByText("Connexion verrouillée");
    for (let attempt = 0; attempt < 6 && !(await locked.isVisible()); attempt++) {
      await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(
        locked.or(page.getByText("Adresse e-mail ou mot de passe incorrect.")),
      ).toBeVisible();
    }
    await expect(locked).toBeVisible();
    await expect(page.getByTestId("lockout-countdown")).toHaveText(/^\d+ (s|min)/);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeDisabled();
  });

  test("an engineer lands on the pipeline and can sign out", async ({ page, context }) => {
    await signIn(page, credentials().engineer);
    await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
    await expectShell(page);
    const access = (await context.cookies()).find((cookie) => cookie.name === "forja_at");
    expect(access?.httpOnly).toBe(true);
    expect(access?.path).toBe("/api");
    expect(await page.evaluate(() => document.cookie)).not.toContain("forja_at");

    await page.getByTestId("user-menu").click();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
