import { readFileSync } from "node:fs";
import { join } from "node:path";
import { E2E } from "./env.mjs";
import { expect, request, test, type Browser, type Page } from "./fixtures";
import { capture, credentials, expectShell, signIn } from "./helpers";

// The reference journey of the test campaign, through the interface only, on a project of
// its own: a file, a PostgreSQL table and an API become sources; the engineer reviews and
// approves their plans, cleans them, confirms the relations, has a star model proposed and
// built; the analyst asks for a data mart, the engineer approves it, the analyst finds it
// published. Every screen is captured in both themes (test-results/captures/reference-*).

const API = `http://127.0.0.1:${E2E.apiPort}`;

function services(): { postgres: boolean } {
  return JSON.parse(readFileSync(join(__dirname, ".data", "services.json"), "utf8")) as {
    postgres: boolean;
  };
}

async function captureThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(300);
    await capture(page, `reference-${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** The administrator's token, whose initial password an earlier test may have changed. */
async function admin() {
  const api = await request.newContext({ baseURL: API });
  let login = await api.post("/auth/login", {
    data: { email: E2E.admin.email, password: E2E.admin.newPassword },
  });
  if (!login.ok()) {
    login = await api.post("/auth/login", {
      data: { email: E2E.admin.email, password: E2E.admin.initialPassword },
    });
  }
  let token = (await login.json()).access_token as string;
  if ((await login.json()).must_change_password) {
    const changed = await api.post("/auth/password", {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_password: E2E.admin.initialPassword, new_password: E2E.admin.newPassword },
    });
    token = (await changed.json()).access_token;
  }
  return { api, headers: { Authorization: `Bearer ${token}` } };
}

async function otherUser(browser: Browser) {
  const context = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

const PRODUCTS = [
  "id_produit;libelle;categorie;prix",
  ...Array.from(
    { length: 10 },
    (_, i) =>
      `P${String(i + 1).padStart(3, "0")};Produit ${i + 1};${i % 2 ? "Maison" : "Jardin"};${(4.5 * (i + 1)).toFixed(2).replace(".", ",")}`,
  ),
].join("\n");

test.describe.configure({ mode: "serial" });

test("the reference journey, engineer then analyst, in both themes", async ({ page, browser }) => {
  test.skip(!services().postgres, "the test PostgreSQL needs Docker");
  test.setTimeout(900_000);

  // A project of its own, with the demo's engineer and analyst as members.
  const { api, headers } = await admin();
  const project = (await (
    await api.post("/projects", { headers, data: { name: `Référence ${Date.now()}` } })
  ).json()) as { id: string };
  const users = (await (await api.get("/auth/users", { headers })).json()) as {
    id: string;
    email: string;
  }[];
  for (const [email, role] of [
    [E2E.engineerEmail, "engineer"],
    [E2E.analystEmail, "analyst"],
  ] as const) {
    const user = users.find((u) => u.email === email)!;
    await api.put(`/projects/${project.id}/members/${user.id}`, { headers, data: { role } });
  }

  // 1. Sources: a file dropped on the empty canvas, a database, an API.
  await signIn(page, credentials().engineer);
  await expectShell(page);
  await page.goto(`/projects/${project.id}/pipeline`);
  await expect(page.getByTestId("drop-zone")).toBeVisible();
  await captureThemes(page, "first-launch");
  await page.getByTestId("upload-input").setInputFiles({
    name: "produits.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(PRODUCTS + "\n"),
  });
  await expect(page.getByTestId("node-src_produits")).toBeVisible({ timeout: 60_000 });

  await page.goto(`/projects/${project.id}/sources`);
  await page.getByTestId("add-source").click();
  let dialog = page.getByTestId("add-source-dialog");
  await dialog.getByTestId("add-source-database").click();
  await dialog.getByLabel("Hôte").fill("127.0.0.1");
  await dialog.getByLabel("Port").fill(String(E2E.postgresPort));
  await dialog.getByLabel("Base de données").fill("shop");
  await dialog.getByLabel("Nom de la connexion").fill("Ventes PostgreSQL");
  await dialog.getByLabel("Utilisateur").fill("forja_reader");
  await dialog.getByLabel("Mot de passe", { exact: true }).fill("reader-Pass-2026");
  await dialog.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(dialog.getByTestId("connection-test")).toContainText("Connexion réussie");
  await dialog.getByRole("button", { name: "Choisir les tables" }).click();
  await dialog.getByTestId("table-orders").getByRole("checkbox").check();
  await dialog.getByTestId("table-customers").getByRole("checkbox").check();
  await captureThemes(page, "database-tables");
  await dialog.getByRole("button", { name: /Continuer avec 2 tables/ }).click();
  await dialog.getByRole("button", { name: "Importer et charger" }).click();
  await expect(
    page.getByTestId("connection-Ventes PostgreSQL").getByText("Active", { exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  await page.goto(`/projects/${project.id}/sources`);
  await page.getByTestId("add-source").click({ timeout: 30_000 });
  dialog = page.getByTestId("add-source-dialog");
  await dialog.getByTestId("add-source-api").click();
  await dialog.getByLabel("URL de base").fill(`http://127.0.0.1:${E2E.fakeApiPort}/v1`);
  await dialog.getByLabel("Nom", { exact: true }).fill("CRM");
  await dialog.getByLabel("Authentification").click();
  await page.getByRole("option", { name: "Jeton Bearer" }).click();
  await dialog.getByLabel("Jeton").fill(E2E.fakeApiToken);
  await dialog.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(dialog.getByTestId("connection-test")).toContainText("Connexion réussie");
  await dialog.getByRole("button", { name: "Configurer l’endpoint" }).click();
  await dialog.getByLabel("Chemin de l’endpoint").fill("/page/orders");
  await dialog.getByLabel("Nom de la source").fill("crm");
  await dialog.getByLabel("Pagination").click();
  await page.getByRole("option", { name: "Numéro de page" }).click();
  await dialog.getByLabel("Taille de page").fill("5");
  await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();
  await expect(dialog.getByTestId("api-preview")).toContainText("crm__items");
  await dialog.getByRole("button", { name: "Planifier" }).click();
  await dialog.getByRole("button", { name: "Manuel" }).click();
  await dialog.getByRole("button", { name: "Enregistrer et charger" }).click();
  await expect(page.getByTestId("connection-CRM").getByText("Active", { exact: true })).toBeVisible(
    { timeout: 90_000 },
  );
  await captureThemes(page, "connections");

  // 2. Every plan reviewed rule by rule, then approved.
  const sources = (await (
    await api.get(`/projects/${project.id}/sources`, { headers })
  ).json()) as { id: string; name: string }[];
  expect(sources.map((s) => s.name)).toEqual(
    expect.arrayContaining(["produits", "orders", "customers", "crm"]),
  );
  for (const source of sources) {
    await page.goto(`/projects/${project.id}/sources/${source.id}/plan`);
    await expect(page.getByTestId("plan-review")).toBeVisible();
    const bulk = page.getByRole("button", { name: "Valider les règles à confiance élevée" });
    if (await bulk.isVisible()) await bulk.click();
    const pending = page.getByTestId("rule-list").locator('[data-decision="pending"]');
    while ((await pending.count()) > 0) {
      await pending.first().getByRole("button", { name: "Valider", exact: true }).click();
      await page.waitForTimeout(250);
    }
    if (source.name === "orders") await captureThemes(page, "plan");
    await page.getByRole("button", { name: "Approuver le plan" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Plan approuvé/ })).toBeVisible();
  }

  // 3. Cleaning, launched from the canvas.
  await page.goto(`/projects/${project.id}/pipeline`);
  await expect(page.locator(".react-flow__node-pipeline").first()).toBeVisible();
  await page.getByRole("button", { name: "Lancer un run" }).click();
  await page.getByRole("menuitem", { name: /^Nettoyage/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nettoyage terminé" })).toBeVisible({
    timeout: 300_000,
  });
  await captureThemes(page, "canvas-cleaned");

  // 4. The relation found is confirmed, the model proposed, validated and built.
  await page.goto(`/projects/${project.id}/model`);
  const relation = page.locator('[data-testid^="relation-"]').filter({ hasText: "customer_id" });
  await expect(relation).toBeVisible();
  await relation.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Relation confirmée" })).toBeVisible();
  await captureThemes(page, "model-relations");
  await page.getByRole("button", { name: "Proposer un modèle" }).click();
  await expect(page.getByTestId("star-schema")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("validate-model").click();
  await expect(page.getByRole("status").filter({ hasText: "Modèle validé" })).toBeVisible();
  await page.getByTestId("build-model").click();
  await expect(page.getByTestId("model-footer")).toContainText("Modèle construit", {
    timeout: 300_000,
  });
  await captureThemes(page, "model");

  // 5. The analyst asks; the engineer approves; the data mart is published.
  const analyst = await otherUser(browser);
  try {
    await signIn(analyst.page, credentials().analyst);
    await expectShell(analyst.page);
    await analyst.page.goto(`/projects/${project.id}/home`);
    // The columns of the database are English: the question uses their names, as the
    // agent suggests it (French synonyms come from the semantic layer, or a model).
    await analyst.page.getByLabel("Posez une question").fill("Amount par customer");
    await analyst.page.keyboard.press("Enter");
    await expect(analyst.page.getByTestId("ready-card")).toBeVisible({ timeout: 60_000 });
    await captureThemes(analyst.page, "agent");
    await analyst.page.getByRole("link", { name: "Ouvrir l’aperçu" }).click();
    await expect(analyst.page.getByTestId("understood")).toBeVisible();
    await captureThemes(analyst.page, "preview");
    await analyst.page.getByRole("button", { name: "Valider et publier" }).click();
    await expect(analyst.page.getByTestId("awaiting-approval")).toBeVisible();

    await page.goto(`/projects/${project.id}/approvals`);
    const waiting = page.getByTestId("approval-row").first();
    await expect(waiting).toBeVisible();
    await captureThemes(page, "approvals");
    await waiting.getByRole("link", { name: "Vérifier" }).click();
    await page.getByRole("button", { name: "Approuver et publier" }).click();
    await expect(page.getByTestId("published")).toBeVisible({ timeout: 120_000 });

    await analyst.page.goto(`/projects/${project.id}/marts`);
    await analyst.page.getByRole("button", { name: /^Publiés/ }).click();
    await expect(analyst.page.getByTestId("mart-row").first()).toBeVisible();
    await captureThemes(analyst.page, "marts");
  } finally {
    await analyst.context.close();
    await api.dispose();
  }
});
