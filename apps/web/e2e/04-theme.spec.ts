import { expect, test } from "./fixtures";
import { capture, credentials, signIn } from "./helpers";

type Probe = { themeAtLoad?: string };

test("the theme choice is applied, kept, and present before the first paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByTestId("user-menu").click();
  const appearance = page.getByRole("group", { name: "Apparence" });
  await appearance.getByRole("button", { name: "Sombre" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // After a reload the stored choice is in place when the document is parsed.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as Probe).themeAtLoad = document.documentElement.dataset.theme;
    });
  });
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as Probe).themeAtLoad)).toBe("dark");

  // "Système" follows the operating system.
  await page.getByTestId("user-menu").click();
  await appearance.getByRole("button", { name: "Système" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("captures of the design system page in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/design-system");
    await expect(page.getByTestId("panel-dark")).toBeVisible();
    await capture(page, `design-system-${theme}`);
  }
});
