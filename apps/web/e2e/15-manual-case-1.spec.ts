// Manual test campaign, case 1 (docs/manual-tests.md): MT-1, a project created from the
// interface and its members added by the administrator; MT-2, the canvas content never
// framed under the transparent top bar, nor under the open sidebar.
import { expect, request, test, type Page } from "./fixtures";
import { E2E } from "./env.mjs";
import { capture, credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

/** The administrator with its final password, whatever the tests before it did. */
async function adminAccount() {
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
 * one also starts right of the sidebar.
 */
async function expectClear(page: Page, stage: string) {
  await page.waitForTimeout(700); // the camera moves for 450 ms
  const bar = (await page
    .locator("header")
    .filter({ has: page.getByTestId("project-selector") })
    .boundingBox())!;
  const sidebar = await page.getByRole("complementary", { name: "Barre latérale" }).boundingBox();
  const right = sidebar ? sidebar.x + sidebar.width : 0;
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
    }
  }
}

async function captureThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(300);
    await capture(page, `${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test.describe.configure({ mode: "serial" });

test("MT-2: the canvas is never framed under the top bar or the open sidebar", async ({ page }) => {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  await expect(page.getByTestId("node-fct_ventes")).toBeVisible();
  await expectClear(page, "first framing, rail");

  // Zooming in at the centre lifts the compartments' top under the bar; the camera is
  // remembered, and the next visit starts from it.
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId("node-fct_ventes")).toBeVisible();
  await expectClear(page, "remembered camera");
  await captureThemes(page, "mt2-remembered-camera");

  const fit = page.getByRole("button", { name: "Ajuster à l’écran" });
  await fit.click();
  await expectClear(page, "« Ajuster », rail");

  await page.getByTestId("sidebar-toggle").click();
  await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-expanded", "true");
  await expectClear(page, "sidebar opened");
  await captureThemes(page, "mt2-sidebar-open");

  await fit.click();
  await expectClear(page, "« Ajuster », sidebar open");

  await page.getByTestId("sidebar-toggle").click();
  await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-expanded", "false");
  await expectClear(page, "sidebar folded");
});

test("MT-1: the administrator creates a project, adds members, the engineer loads a file", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const name = `Cas 1 ${Date.now()}`;
  await signIn(page, await adminAccount());
  await expectShell(page);

  await page.getByTestId("project-selector").click();
  await page.getByTestId("new-project").click();
  const dialog = page.getByTestId("new-project-dialog");
  await dialog.getByLabel("Nom").fill(name);
  await dialog.getByLabel("Description").fill("Ventes des magasins, cas de test manuel 1");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();

  // The empty canvas of the new project: its first start.
  await expect(page.getByTestId("project-selector")).toHaveText(name);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  const projectId = /\/projects\/([^/]+)\/pipeline/.exec(page.url())![1]!;
  await expect(page.getByTestId("drop-zone")).toBeVisible();
  await expectClear(page, "first start");
  await captureThemes(page, "mt1-new-project");

  // Réglages › Membres: the demo engineer and analyst join with their role.
  await page.goto(`/projects/${projectId}/settings?tab=members`);
  const members = page.getByTestId("members");
  for (const [email, role] of [
    [E2E.engineerEmail, "Engineer"],
    [E2E.analystEmail, "Analyst"],
  ] as const) {
    await members.getByRole("button", { name: "Ajouter un membre" }).click();
    const add = page.getByTestId("add-member-dialog");
    await add.getByLabel("Compte").click();
    await page.getByRole("option", { name: email }).click();
    await add.getByLabel("Rôle").click();
    await page.getByRole("option", { name: role, exact: true }).click();
    await add.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(add).toBeHidden();
    await expect(members.getByRole("combobox", { name: `Rôle de ${email}` })).toHaveText(role);
  }
  await captureThemes(page, "mt1-members");

  // The engineer finds the project in the selector and drops a file on its canvas.
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: "fr-FR",
  });
  const engineer = await context.newPage();
  await signIn(engineer, credentials().engineer);
  await expectShell(engineer);
  await engineer.getByTestId("project-selector").click();
  await engineer.getByRole("button", { name: new RegExp(name) }).click();
  await expect(engineer).toHaveURL(new RegExp(`/projects/${projectId}/pipeline$`));
  await expect(engineer.getByTestId("drop-zone")).toBeVisible();
  await engineer.getByTestId("upload-input").setInputFiles({
    name: "ventes_cas1.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id;magasin;montant\n1;Lyon;12,50\n2;Paris;8,00\n3;Lille;21,90\n"),
  });
  await expect(engineer.getByTestId("node-src_ventes_cas1")).toBeVisible({ timeout: 60_000 });
  await context.close();

  // The analyst sees it too, as an analyst.
  const analystContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: "fr-FR",
  });
  const analyst = await analystContext.newPage();
  await signIn(analyst, credentials().analyst);
  await expectShell(analyst);
  await analyst.getByTestId("project-selector").click();
  await expect(analyst.getByRole("button", { name: new RegExp(name) })).toContainText("Analyst");
  await expect(analyst.getByTestId("new-project")).toHaveCount(0);
  await analystContext.close();
});
