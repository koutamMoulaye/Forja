import { expect, request, test, type Browser, type Page } from "./fixtures";
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

async function asAnalyst(page: Page): Promise<string> {
  await signIn(page, credentials().analyst);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/home$/);
  await expectShell(page);
  return /projects\/([^/]+)/.exec(page.url())![1]!;
}

async function asEngineer(page: Page): Promise<string> {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  return /projects\/([^/]+)/.exec(page.url())![1]!;
}

/** A fresh browser context for another user, closed by the caller. */
async function otherUser(browser: Browser) {
  const context = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

/** Asks from the home page and lands on the conversation. */
async function ask(page: Page, question: string) {
  await page.getByLabel("Posez une question").fill(question);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ask\/[^/]+$/);
}

async function openPreview(page: Page) {
  await page.getByRole("link", { name: "Ouvrir l’aperçu" }).click();
  await expect(page).toHaveURL(/\/marts\/[^/]+\/preview$/);
  await expect(page.getByTestId("understood")).toBeVisible();
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

test.describe.configure({ mode: "serial" });

test("home: greeting, freshness, suggestions the agent answers at once", async ({ page }) => {
  await asAnalyst(page);
  await expect(page.getByRole("heading", { name: /^Bonjour / })).toBeVisible();
  await expect(page.getByTestId("freshness")).toContainText(/mis à jour/);
  const chips = page.getByTestId("suggestions").getByRole("button");
  await expect(chips.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("recent-questions")).toContainText("Publié");
  await expect(page.getByTestId("home-indicators")).toContainText(/Chiffre d.affaires/);
  await captureThemes(page, "analyst-home");

  // A suggestion goes straight to a preview: the parser understands it alone.
  await chips.first().click();
  await expect(page).toHaveURL(/\/ask\/[^/]+$/);
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("preparation-meta")).toContainText("Réponse immédiate");
  await expect(page.getByTestId("recent-conversations")).toBeVisible();
});

test("an engineer's simple question: preview, CSV destination, approved by another, published", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const projectId = await asEngineer(page);
  await page.goto(`/projects/${projectId}/home`);
  await ask(page, "Quantité vendue par catégorie");
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
  await openPreview(page);
  await page.getByRole("radio", { name: /Fichier CSV/ }).click();
  await page.getByRole("button", { name: "Valider et publier" }).click();
  // Shared instance: an engineer's own request waits for someone else
  // (FORJA_MART_ALLOW_SELF_APPROVAL is false in multi mode); the administrator approves.
  await expect(page.getByTestId("awaiting-approval")).toBeVisible();
  const martId = /marts\/([^/]+)\/preview/.exec(page.url())![1]!;
  const api = await request.newContext({ baseURL: API });
  try {
    const login = await api.post("/auth/login", {
      data: { email: E2E.admin.email, password: await adminPassword() },
    });
    const token = (await login.json()).access_token as string;
    const approved = await api.post(`/mart-requests/${martId}/approve`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(approved.ok()).toBe(true);
  } finally {
    await api.dispose();
  }
  await expect(page.getByTestId("published")).toContainText("Fichier CSV", { timeout: 90_000 });
  const steps = page.getByTestId("publication-steps");
  await expect(steps).toContainText("En attente d’approbation");
  await expect(steps.locator("[data-step=approved]")).toContainText(E2E.admin.email);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^mart_.*\.csv$/);
});

test("ambiguous question: options with counts, a term corrected, a refinement, approval, export", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const projectId = await asAnalyst(page);
  await ask(page, "ventes par ville");

  // The agent stops on the ambiguous word; each option says what it covers.
  const options = page.getByTestId("clarify-option");
  await expect(options).toHaveCount(2, { timeout: 30_000 });
  await expect(options.first()).toContainText("€");
  await expect(page.getByTestId("preparation-card")).toContainText("Une précision est nécessaire");
  await captureThemes(page, "agent-clarification");
  await options.filter({ hasText: /Chiffre d.affaires/ }).click();
  await expect(page.getByTestId("synonym-offer")).toBeVisible();
  await page.getByRole("button", { name: "Proposer ce synonyme" }).click();
  await expect(page.getByTestId("synonym-offer")).toHaveCount(0);
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
  await captureThemes(page, "agent-ready");
  await openPreview(page);
  await captureThemes(page, "preview");

  // A term corrected: « par ville » becomes « par segment », the preview is recomputed.
  await page.getByRole("button", { name: "par ville : corriger" }).click();
  await page.getByTestId("term-options").getByRole("button", { name: "par segment" }).click();
  await expect(page.getByTestId("understood")).toContainText("par segment", { timeout: 30_000 });
  await expect(page.getByText(/version 3/)).toBeVisible();

  // Refined in French; every version stays in the conversation.
  await page.getByRole("button", { name: "Affiner" }).click();
  await page.getByLabel("Changement à apporter").fill("seulement le T1 2024");
  await page.getByRole("button", { name: "Recalculer l’aperçu" }).click();
  await expect(page.getByTestId("understood")).toContainText("T1", { timeout: 30_000 });
  await expect(page.getByTestId("controls").getByRole("button").first()).toBeVisible();

  await page.getByRole("button", { name: "Valider et publier" }).click();
  await expect(page.getByTestId("awaiting-approval")).toBeVisible();
  const martUrl = page.url();
  await page.goto(martUrl.replace(/\/marts\/([^/]+)\/preview$/, "/ask/$1"));
  await expect(page.getByTestId("user-message")).toHaveCount(4);
  await expect(page.getByTestId("request-status")).toContainText("En attente d’approbation");

  // The engineer approves from the queue, with the same preview.
  const engineer = await otherUser(browser);
  try {
    await asEngineer(engineer.page);
    const queue = engineer.page.getByTestId("nav-approvals");
    await expect(queue.getByLabel(/à revoir/)).toBeVisible();
    await queue.click();
    const waiting = engineer.page.getByTestId("approval-row").filter({ hasText: "segment" });
    await expect(waiting).toHaveCount(1);
    await captureThemes(engineer.page, "approvals");
    await waiting.getByRole("link", { name: "Vérifier" }).click();
    await expect(engineer.page.getByTestId("understood")).toContainText("par segment");
    await expect(engineer.page.getByTestId("summary-term")).toHaveCount(0);
    await engineer.page.getByRole("button", { name: "Approuver et publier" }).click();
    await expect(engineer.page.getByTestId("published")).toBeVisible({ timeout: 90_000 });
  } finally {
    await engineer.context.close();
  }

  // Published: in « Mes data marts », exported from there.
  await page.goto(`/projects/${projectId}/marts`);
  await page.getByRole("button", { name: /^Publiés/ }).click();
  const row = page.getByTestId("mart-row").filter({ hasText: "segment" });
  await expect(row).toBeVisible();
  await captureThemes(page, "marts");
  await row.getByRole("button", { name: "Exporter" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter en Parquet" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.parquet$/);
});

test("an engineer rejects with a reason; the analyst reads it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await asAnalyst(page);
  await ask(page, "Panier moyen par segment");
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
  await openPreview(page);
  await page.getByRole("button", { name: "Valider et publier" }).click();
  await expect(page.getByTestId("awaiting-approval")).toBeVisible();
  const previewUrl = page.url();

  const engineer = await otherUser(browser);
  try {
    await asEngineer(engineer.page);
    await engineer.page.goto(previewUrl);
    await engineer.page.getByRole("button", { name: "Rejeter" }).click();
    await engineer.page.getByLabel("Motif du rejet").fill("Déjà publié dans le rapport mensuel");
    await engineer.page.getByRole("dialog").getByRole("button", { name: "Rejeter" }).click();
    await expect(engineer.page.getByText("Data mart rejeté").first()).toBeVisible();
  } finally {
    await engineer.context.close();
  }
  await page.reload();
  await expect(page.getByText("Déjà publié dans le rapport mensuel")).toBeVisible();
});

test("out of scope: a clean refusal, with what Forja can measure", async ({ page }) => {
  test.setTimeout(90_000);
  await asAnalyst(page);
  await ask(page, "Quelle sera la météo à Lyon demain ?");
  const refusal = page.getByTestId("refusal");
  await expect(refusal).toBeVisible({ timeout: 40_000 });
  await expect(refusal).toContainText("Ce que Forja sait mesurer");
  await expect(refusal).toContainText(/Chiffre d.affaires/);
  await captureThemes(page, "agent-refusal");
  await refusal.getByTestId("suggestions").getByRole("button").first().click();
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
});

test("a long job: progress, leaving the screen, a notice at the end", async ({ page }) => {
  test.setTimeout(90_000);
  await asAnalyst(page);
  await ask(page, "Chiffre d'affaires par ville des clients pro");
  const card = page.getByTestId("preparation-card");
  await expect(card).toContainText("Analyse approfondie", { timeout: 15_000 });
  const meta = page.getByTestId("preparation-meta");
  const before = await meta.textContent();
  await expect(meta).not.toHaveText(before ?? "", { timeout: 5_000 });
  await card.getByRole("button", { name: "Me prévenir à la fin" }).click();
  await expect(card.getByRole("button", { name: "Notification à la fin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Away from the conversation (client-side, as a user would): the shell still watches.
  await page.getByTestId("nav-indicators").click();
  await expect(page.getByTestId("indicators-screen")).toBeVisible();
  const notice = page.getByRole("status").filter({ hasText: "Aperçu prêt à vérifier" });
  await expect(notice).toBeVisible({ timeout: 40_000 });
  await notice.getByRole("button", { name: "Ouvrir" }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByTestId("understood")).toContainText("professionnel");
});

test("indicators: business catalogue, search, a question from an indicator", async ({ page }) => {
  await asAnalyst(page);
  await page.getByRole("link", { name: "Indicateurs" }).first().click();
  await expect(page.getByTestId("indicators-screen")).toBeVisible();
  await expect(page.getByTestId("indicator").first()).toBeVisible();
  await captureThemes(page, "indicators");
  await page.getByLabel("Rechercher un indicateur").fill("ticket");
  await expect(page.getByTestId("indicator")).toHaveCount(1);
  await expect(page.getByTestId("indicator")).toContainText("Panier moyen");
  await page.getByRole("link", { name: "Poser une question avec cet indicateur" }).click();
  await expect(page.getByTestId("agent-composer").getByRole("textbox")).toHaveValue(
    /^Panier moyen/,
  );
});

test("tablet: the agent and the preview at 1024 px, dark (S9)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.emulateMedia({ colorScheme: "dark" });
  await asAnalyst(page);
  await ask(page, "ventes par catégorie");
  await expect(page.getByTestId("clarify-option")).toHaveCount(2, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await capture(page, "tablet-agent-dark");
  await page.getByTestId("clarify-option").first().click();
  await expect(page.getByTestId("ready-card")).toBeVisible({ timeout: 30_000 });
  await openPreview(page);
  const box = await page.getByTestId("destinations").boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(1024);
  await capture(page, "tablet-preview-dark");
});

test("registration by invitation: the link creates the account and signs in", async ({
  page,
  browser,
}) => {
  const password = await adminPassword();
  await signIn(page, { email: E2E.admin.email, password });
  await expectShell(page);
  const projectId = /projects\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/projects/${projectId}/settings`);
  const invite = async (email: string) => {
    await page.getByRole("button", { name: "Inviter" }).click();
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("dialog").getByRole("button", { name: "Inviter" }).click();
    const link = (await page.getByTestId("secret-value").textContent())!.trim();
    expect(link).toMatch(/\/auth\/invite\/[\w-]+$/);
    await page.getByRole("button", { name: "J’ai conservé la valeur" }).click();
    return link;
  };
  const link = await invite("nora.nouvelle@exemple.fr");
  const revoked = await invite("erreur@exemple.fr");
  await page
    .getByTestId("invitation-erreur@exemple.fr")
    .getByRole("button", { name: "Révoquer" })
    .click();
  await expect(page.getByTestId("invitations")).not.toContainText("erreur@exemple.fr");

  const guest = await otherUser(browser);
  try {
    const visitor = guest.page;
    await visitor.goto(revoked);
    await expect(visitor.getByTestId("invite-problem")).toBeVisible();
    await expect(visitor.getByRole("heading", { name: "Invitation révoquée" })).toBeVisible();
    await visitor.goto(revoked.replace(/[^/]+$/, "inconnu"));
    await expect(visitor.getByRole("heading", { name: "Lien d’invitation inconnu" })).toBeVisible();

    await visitor.goto(link);
    await expect(visitor.getByLabel("Adresse e-mail")).toHaveValue("nora.nouvelle@exemple.fr");
    await capture(visitor, "invite-light");
    await visitor.getByLabel("Nom").fill("Nora Nouvelle");
    await visitor.getByLabel("Mot de passe", { exact: true }).fill("Bienvenue-Forja-2026");
    await visitor.getByLabel("Confirmation").fill("Bienvenue-Forja-2026");
    await visitor.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(visitor).toHaveURL(/\/projects\/[^/]+\/home$/);
    await expect(visitor.getByRole("heading", { name: "Bonjour Nora" })).toBeVisible();
    // The link is spent.
    await visitor.goto(link);
    await expect(visitor.getByRole("heading", { name: "Invitation déjà utilisée" })).toBeVisible();
  } finally {
    await guest.context.close();
  }
});
