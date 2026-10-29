import { expect, request, test, type Page } from "./fixtures";
import { E2E } from "./env.mjs";
import { capture, credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

/** Both themes of the same state, for the comparison with ForjaApp. */
async function captureThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(300);
    await capture(page, `${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** The demo project, opened as the engineer; returns its id. */
async function asEngineer(page: Page): Promise<string> {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  return /projects\/([^/]+)/.exec(page.url())![1]!;
}

/** The administrator, whose initial password an earlier test may have changed. */
async function adminPassword(): Promise<string> {
  const api = await request.newContext({ baseURL: API });
  try {
    const changed = await api.post("/auth/login", {
      data: { email: E2E.admin.email, password: E2E.admin.newPassword },
    });
    if (changed.ok()) return E2E.admin.newPassword;
    const first = await api.post("/auth/login", {
      data: { email: E2E.admin.email, password: E2E.admin.initialPassword },
    });
    const token = (await first.json()).access_token as string;
    await api.post("/auth/password", {
      headers: { Authorization: `Bearer ${token}` },
      data: { current_password: E2E.admin.initialPassword, new_password: E2E.admin.newPassword },
    });
    return E2E.admin.newPassword;
  } finally {
    await api.dispose();
  }
}

async function bearer(account: { email: string; password: string }) {
  const api = await request.newContext({ baseURL: API });
  const login = await api.post("/auth/login", { data: account });
  const token = (await login.json()).access_token as string;
  return { api, headers: { Authorization: `Bearer ${token}` } };
}

test.describe.configure({ mode: "serial" });

test("Silver plan: edit a rule, validate, approve, clean, see the quarantine", async ({ page }) => {
  test.setTimeout(240_000);
  await asEngineer(page);
  await page.getByRole("link", { name: "Sources" }).first().click();
  await expect(page.getByTestId("sources-screen")).toBeVisible();
  await captureThemes(page, "sources");
  await page.getByTestId("source-row-clients").click();
  await expect(page.getByTestId("quality-card")).toBeVisible();
  await captureThemes(page, "source-detail");
  await page.getByRole("link", { name: /Plan de nettoyage|Revoir le plan/ }).click();
  await expect(page.getByTestId("plan-review")).toBeVisible();

  // Edit a rule of the applied plan: a new draft, every rule back to review.
  const cast = page.getByTestId("rule-cast:date_inscription");
  await expect(cast.getByTestId("before-after")).toBeVisible();
  await cast.getByRole("button", { name: "Modifier" }).click();
  await cast.getByRole("combobox", { name: "Valeur invalide" }).click();
  await page.getByRole("option", { name: "Mettre à vide et garder la ligne" }).click();
  await cast.getByRole("button", { name: "Appliquer la modification" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Plan modifié, version/ })).toBeVisible();
  await expect(page.getByTestId("action-bar")).toContainText("règles en attente");
  await captureThemes(page, "silver-plan");

  // High-confidence rules at once, then the rest one by one.
  const pendingBefore = await page.locator('[data-decision="pending"]').count();
  await page.getByRole("button", { name: "Valider les règles à confiance élevée" }).click();
  await expect
    .poll(() => page.locator('[data-decision="pending"]').count())
    .toBeLessThan(pendingBefore);
  const list = page.getByTestId("rule-list");
  while ((await list.locator('[data-decision="pending"]').count()) > 0) {
    await list
      .locator('[data-decision="pending"]')
      .first()
      .getByRole("button", { name: "Valider", exact: true })
      .click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId("decision-meter")).toContainText(/(\d+) sur \1 décidées/);

  await page.getByRole("button", { name: "Approuver le plan" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Plan approuvé/ })).toBeVisible();
  await page.getByRole("button", { name: "Lancer le nettoyage" }).click();
  await expect(page.getByTestId("action-bar")).toContainText("Nettoyage en cours");
  await expect(page.getByTestId("action-bar")).toContainText("Nettoyage terminé", {
    timeout: 180_000,
  });
  await expect(
    page.getByTestId("quarantine").or(page.getByText("Aucune ligne en quarantaine")),
  ).toBeVisible();
  await captureThemes(page, "quarantine");
});

test("model: confirm a relation, validate the model, build it", async ({ page }) => {
  test.setTimeout(240_000);
  const projectId = await asEngineer(page);
  await page.goto(`/projects/${projectId}/model`);
  await expect(page.getByTestId("star-schema")).toBeVisible();
  await captureThemes(page, "model");

  // Reject a confirmed relation: the live validation asks for it in « À résoudre ».
  await page.getByRole("button", { name: "Relations" }).click();
  const row = page.locator('[data-testid^="relation-"]').first();
  await row.getByRole("button", { name: "Rejeter" }).click();
  await expect(row).toContainText("Rejetée");
  await page.getByRole("button", { name: "Schéma" }).click();
  const aside = page.getByTestId("model-aside");
  await expect(aside.getByRole("button", { name: "Confirmer la relation" }).first()).toBeVisible();
  await captureThemes(page, "model-to-resolve");
  await aside.getByRole("button", { name: "Confirmer la relation" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Relation confirmée" })).toBeVisible();
  await expect(aside).toContainText("Rien à résoudre");

  // A change of historization makes a new draft to validate, then to build.
  await page.getByTestId("star-dim_produits").click();
  const scd = aside.getByRole("group", { name: "Historisation de dim_produits" });
  const current = await scd.locator('[aria-pressed="true"]').innerText();
  await scd
    .getByRole("button", { name: current.includes("SCD2") ? "SCD1, écrasée" : "SCD2, historisée" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: /Modèle modifié/ })).toBeVisible();
  await page.getByTestId("validate-model").click();
  await expect(page.getByRole("status").filter({ hasText: "Modèle validé" })).toBeVisible();
  await page.getByTestId("build-model").click();
  await expect(page.getByTestId("build-model")).toContainText("Construction en cours");
  await expect(page.getByTestId("build-model")).toContainText("Construire", { timeout: 180_000 });
  await expect(page.getByTestId("model-footer")).toContainText("Modèle construit");
});

test("runs: the detail of a real run, its log and its tests", async ({ page }) => {
  const projectId = await asEngineer(page);
  await page.goto(`/projects/${projectId}/runs`);
  await expect(page.getByTestId("runs-screen")).toBeVisible();
  const build = page
    .locator('[data-testid^="run-row-"]')
    .filter({ hasText: "Construction du modèle" })
    .first();
  await build.click();
  await expect(page).toHaveURL(/\/runs\/[^/]+$/);
  const detail = page.getByTestId("run-detail").filter({ visible: true });
  await expect(detail).toContainText("Réussi");
  await expect(detail.getByText("Étapes")).toBeVisible();
  await expect(detail.getByTestId("run-figures")).toContainText("Membre inconnu");
  await expect(detail.getByText("Tests dbt")).toBeVisible();
  await detail.getByRole("button", { name: /Journal/ }).click();
  await expect(detail.getByTestId("run-logs")).toContainText("dbt");
  await detail.getByLabel("Rechercher dans le journal").fill("dbt build");
  await expect(detail.getByTestId("run-logs")).toContainText("dbt build");
  await captureThemes(page, "runs");
  await page.getByRole("button", { name: "Échecs" }).click();
});

test("semantic layer: edit a metric, validate a proposed synonym", async ({ page }) => {
  const analyst = await bearer(credentials().analyst);
  const projectId = await asEngineer(page);
  const proposed = await analyst.api.post(
    `/projects/${projectId}/semantic-layer/synonym-proposals`,
    { headers: analyst.headers, data: { target: "metric:montant", synonym: "recettes" } },
  );
  expect(proposed.ok()).toBeTruthy();
  await analyst.api.dispose();

  await page.goto(`/projects/${projectId}/semantic?metric=montant`);
  const panel = page.getByTestId("semantic-panel");
  await expect(panel).toBeVisible();
  const label = page.getByLabel("Libellé métier");
  await label.fill("Chiffre d’affaires HT");
  await page.getByLabel("Nouveau synonyme").fill("CA HT");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Métrique enregistrée" })).toBeVisible();
  await expect(page.getByTestId("semantic-row-montant")).toContainText("Chiffre d’affaires HT");

  const queue = page.getByTestId("synonym-queue");
  const item = queue.getByTestId("synonym-recettes");
  await item.getByRole("button", { name: "Valider" }).click();
  await expect(item).toContainText("Validé");
  await captureThemes(page, "semantic");
});

test("settings: create then revoke a personal API key", async ({ page }) => {
  const password = await adminPassword();
  await signIn(page, { email: E2E.admin.email, password });
  await expectShell(page);
  const projectId = /projects\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/projects/${projectId}/settings`);
  await expect(page.getByTestId("provider")).toContainText("Aucun");
  await page.getByRole("button", { name: "Créer une clé" }).click();
  await page.getByLabel("Nom de la clé").fill("CI e2e");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  const secret = page.getByTestId("secret-value");
  await expect(secret).toHaveText(/^fja_/);
  await captureThemes(page, "settings-key");
  await page.getByRole("button", { name: "J’ai conservé la valeur" }).click();
  const key = page.getByTestId("api-key-CI e2e");
  await expect(key).toBeVisible();
  await expect(page.getByTestId("secret-value")).toHaveCount(0);
  await captureThemes(page, "settings");
  await key.getByRole("button", { name: "Révoquer" }).click();
  await page.getByRole("button", { name: "Révoquer la clé" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Clé révoquée" })).toBeVisible();
  await expect(key).toHaveCount(0);

  await page.goto(`/projects/${projectId}/governance`);
  await page.getByRole("button", { name: "Journal d’audit" }).click();
  // The rules decided in the first test are in the project's log.
  await page.getByLabel("Rechercher dans le journal").fill("silver_plan.review");
  await expect(page.getByTestId("audit-log")).toContainText("Règles décidées");
  await captureThemes(page, "governance");
});

test("serving: export a table, see how to connect a BI tool", async ({ page }) => {
  const projectId = await asEngineer(page);
  await page.goto(`/projects/${projectId}/serving`);
  const row = page.getByTestId("serving-row-dim_clients");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("serving-path")).toContainText(".duckdb");
  await row.getByRole("button", { name: "Exporter" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exporter en CSV" }).click();
  expect((await download).suggestedFilename()).toBe("dim_clients.csv");
  await page.getByRole("button", { name: "Superset" }).click();
  await expect(page.getByTestId("connect-panel")).toContainText("duckdb:////forja/serving/");
  await captureThemes(page, "serving");
});

test("an analyst never opens the engineer screens", async ({ page }) => {
  await signIn(page, credentials().analyst);
  await expectShell(page);
  const projectId = /projects\/([^/]+)/.exec(page.url())![1]!;
  for (const section of ["model", "runs", "sources", "semantic", "governance", "settings"]) {
    await page.goto(`/projects/${projectId}/${section}`);
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/home$`));
  }
});
