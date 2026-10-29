import { expect, test } from "./fixtures";
import { credentials, expectShell, signIn } from "./helpers";

test("pages carry a strict Content-Security-Policy with a fresh nonce", async ({ page }) => {
  const first = await page.goto("/auth/login");
  const headers = first!.headers();
  const csp = headers["content-security-policy"]!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();

  const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
  // The theme script runs before the first paint, with the page's nonce.
  expect(await page.locator("head script").first().getAttribute("nonce")).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/light|dark/);

  const second = await page.goto("/auth/login");
  const again = /'nonce-([^']+)'/.exec(second!.headers()["content-security-policy"]!)![1];
  expect(again).not.toBe(nonce);
});

test("API routes forbid any script and any framing", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
});

test("an unknown address shows the 404 page in the app's style", async ({ page }) => {
  await signIn(page, credentials().engineer);
  await expectShell(page);
  const response = await page.goto("/projets-qui-n-existe-pas");
  expect(response!.status()).toBe(404);
  await expect(page.getByTestId("status-404")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cette page n’existe pas" })).toBeVisible();
  await page.getByRole("link", { name: "Retour à l’accueil" }).click();
  await expect(page).toHaveURL(/\/projects\//);
});
