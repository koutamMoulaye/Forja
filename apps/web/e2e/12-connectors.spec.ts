import { readFileSync } from "node:fs";
import { join } from "node:path";
import { E2E } from "./env.mjs";
import { expect, test, type Page } from "./fixtures";
import { capture, credentials, expectShell, signIn } from "./helpers";

/** What e2e/start-api.mjs could start beside the API. */
function services(): { postgres: boolean } {
  return JSON.parse(readFileSync(join(__dirname, ".data", "services.json"), "utf8")) as {
    postgres: boolean;
  };
}

async function openSources(page: Page): Promise<string> {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  const projectId = /projects\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/projects/${projectId}/sources`);
  await expect(page.getByTestId("sources-screen")).toBeVisible();
  return projectId;
}

async function openWizard(page: Page, kind: "database" | "api") {
  await page.getByTestId("add-source").click();
  const dialog = page.getByTestId("add-source-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`add-source-${kind}`).click();
  return dialog;
}

/** The connection reaches its first load's end on the connections screen. */
async function expectLoaded(page: Page, name: string) {
  await expect(page).toHaveURL(/\/sources\/connections$/);
  const card = page.getByTestId(`connection-${name}`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Active", { exact: true })).toBeVisible({ timeout: 60_000 });
  return card;
}

test.describe.configure({ mode: "serial" });

test("database wizard: connection, test, tables, incremental mode, schedule", async ({ page }) => {
  test.skip(!services().postgres, "the test PostgreSQL needs Docker");
  test.setTimeout(150_000);
  const projectId = await openSources(page);
  const dialog = await openWizard(page, "database");

  await dialog.getByLabel("Hôte").fill("127.0.0.1");
  await dialog.getByLabel("Port").fill(String(E2E.postgresPort));
  await dialog.getByLabel("Base de données").fill("shop");
  await dialog.getByLabel("Nom de la connexion").fill("Boutique PostgreSQL");
  await dialog.getByLabel("Utilisateur").fill("forja_reader");
  await dialog.getByLabel("Mot de passe", { exact: true }).fill("reader-Pass-2026");
  await expect(dialog.getByText("lecture seule", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(dialog.getByTestId("connection-test")).toContainText("Connexion réussie");
  await dialog.getByRole("button", { name: "Choisir les tables" }).click();

  const orders = dialog.getByTestId("table-orders");
  await expect(orders).toBeVisible();
  await orders.getByRole("checkbox").check();
  // The modification date is proposed as the cursor: incremental by default.
  await expect(orders.getByRole("button", { name: "Incrémental" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(orders.getByText("Date de modification")).toBeVisible();
  await dialog.getByTestId("table-customers").getByRole("checkbox").check();
  await capture(page, "connectors-database-tables");
  await dialog.getByRole("button", { name: /Continuer avec 2 tables/ }).click();

  await dialog.getByTestId("schedule-input").fill("tous les jours à 6 h");
  await expect(dialog.getByTestId("schedule-interpretation")).toContainText(
    "Tous les jours à 06:00",
  );
  await dialog.getByRole("button", { name: "Importer et charger" }).click();

  const card = await expectLoaded(page, "Boutique PostgreSQL");
  await expect(card.getByTestId("next-load")).toContainText("Tous les jours à 06:00");
  await card.getByRole("button", { name: /sources alimentées/ }).click();
  await expect(card.getByRole("cell", { name: "Incrémental sur updated_at" })).toBeVisible();

  await page.goto(`/projects/${projectId}/sources`);
  const row = page.getByTestId("source-row-orders");
  await expect(row).toContainText("Base de données");
  await expect(row).toContainText("Boutique PostgreSQL · sales.orders");
});

test("API wizard: endpoint, pagination, preview with child tables, load", async ({ page }) => {
  test.setTimeout(150_000);
  await openSources(page);
  const dialog = await openWizard(page, "api");

  await dialog.getByLabel("URL de base").fill(`http://127.0.0.1:${E2E.fakeApiPort}/v1`);
  await dialog.getByLabel("Nom", { exact: true }).fill("Boutique API");
  await dialog.getByLabel("Authentification").click();
  await page.getByRole("option", { name: "Jeton Bearer" }).click();
  await dialog.getByLabel("Jeton").fill(E2E.fakeApiToken);
  await dialog.getByRole("button", { name: "Tester la connexion" }).click();
  await expect(dialog.getByTestId("connection-test")).toContainText("Connexion réussie");
  await dialog.getByRole("button", { name: "Configurer l’endpoint" }).click();

  await dialog.getByLabel("Chemin de l’endpoint").fill("/page/orders");
  await dialog.getByLabel("Nom de la source").fill("boutique_api");
  await dialog.getByLabel("Pagination").click();
  await page.getByRole("option", { name: "Numéro de page" }).click();
  await dialog.getByLabel("Taille de page").fill("5");
  await dialog.getByText("Chargement incrémental").click();
  await dialog.getByRole("button", { name: "Voir l’aperçu" }).click();

  const preview = dialog.getByTestId("api-preview");
  await expect(preview).toContainText("5 enregistrements sur la première page");
  await expect(preview).toContainText("data (détecté)");
  await expect(preview).toContainText("boutique_api__items");
  await expect(preview).toContainText("boutique_api_id");
  await capture(page, "connectors-api-preview");
  await dialog.getByRole("button", { name: "Planifier" }).click();
  await dialog.getByRole("button", { name: "Manuel" }).click();
  await expect(dialog.getByTestId("schedule-interpretation")).toContainText("Manuel");
  await dialog.getByRole("button", { name: "Enregistrer et charger" }).click();

  const card = await expectLoaded(page, "Boutique API");
  await expect(card.getByTestId("next-load")).toContainText("manuel");
  await card.getByRole("button", { name: /sources alimentées/ }).click();
  await expect(card.getByText("boutique_api__items", { exact: true })).toBeVisible();
});

test("schedule typed in plain French, next load on the canvas", async ({ page }) => {
  const projectId = await openSources(page);
  await page.goto(`/projects/${projectId}/sources/connections`);
  const card = page.getByTestId("connection-Boutique API");
  await card.getByRole("button", { name: "Planifier" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("schedule-input").fill("du lundi au vendredi à 7h30");
  await expect(dialog.getByTestId("schedule-interpretation")).toContainText(
    "Du lundi au vendredi à 07:30",
  );
  await expect(dialog.getByTestId("schedule-interpretation")).toContainText(
    "Prochains chargements",
  );
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByTestId("next-load")).toContainText("Du lundi au vendredi à 07:30");

  await page.goto(`/projects/${projectId}/pipeline`);
  await page.getByTestId("node-src_boutique_api").click();
  await expect(page.getByTestId("inspector-next-load")).toContainText("Prochain chargement");
  await expect(page.getByTestId("inspector-next-load")).toContainText("07:30");
});

test("large file sent in chunks resumes after a cut", async ({ page }) => {
  test.setTimeout(120_000);
  const projectId = await openSources(page);
  // 3.5 MB: four chunks of 1 MB (FORJA_UPLOAD_CHUNK_MB=1 in e2e/start-api.mjs).
  const lines = ["id;ville;montant"];
  for (let i = 0; i < 160_000; i += 1) lines.push(`${i};Ville ${i % 9};${(i * 1.5).toFixed(2)}`);
  const buffer = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  expect(buffer.length).toBeGreaterThan(3 * 1024 * 1024);

  let cut = false;
  await page.route("**/api/forja/uploads/*/chunks*", (route) => {
    if (
      !cut &&
      route
        .request()
        .url()
        .includes(`offset=${1024 * 1024}`)
    ) {
      cut = true;
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("add-source").click();
  await page.getByTestId("add-source-file").click();
  await (await chooser).setFiles({ name: "volume.csv", mimeType: "text/csv", buffer });
  await expect(page.getByTestId("add-source")).toContainText(/Envoi|reprise|Lecture/);
  await expect(page.getByText("volume.csv chargé")).toBeVisible({ timeout: 90_000 });
  expect(cut).toBe(true);
  await page.goto(`/projects/${projectId}/sources`);
  await expect(page.getByTestId("source-row-volume")).toContainText("160 000");
});
