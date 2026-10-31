import { expect, request, test, type Page } from "./fixtures";
import { E2E } from "./env.mjs";
import { capture, credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

const node = (page: Page, id: string) => page.getByTestId(`node-${id}`);

async function openCanvas(page: Page) {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  await expect(node(page, "fct_ventes")).toBeVisible();
}

/** Both themes of the same state, for the comparison with ForjaApp. */
async function captureThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForTimeout(300);
    await capture(page, `${name}-${theme}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** Centre of a node on screen, relative to the free area of the canvas. */
async function offCentre(page: Page, id: string, inspector: boolean) {
  const box = (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!;
  const area = { left: 84, width: 1440 - 84 - 28 - (inspector ? 404 : 0) };
  return Math.abs(box.x + box.width / 2 - (area.left + area.width / 2));
}

test.describe.configure({ mode: "serial" });

// Production build (the e2e servers run `next start`), in Google Chrome (the « chrome »
// project of playwright.config.ts): the pipeline page shows its nodes within 5 s, whether
// ELK has to rank the graph (nothing remembered in this browser) or the ranking of the
// last visit is reused; past 800 ms without ELK, a quick ranking is drawn in its place. The graph is asked for as soon as the address
// is known; the canvas code, the layout worker and ELK load while it is fetched.
test("the canvas shows its nodes within 5 seconds", { tag: "@perf" }, async ({ page }) => {
  // Pipeline nodes, not the lanes (React Flow nodes too).
  const nodes = page.locator(".react-flow__node-pipeline");
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expect(nodes.first()).toBeVisible();
  const cases = [
    { name: "ranked by ELK", forget: true },
    { name: "ranking reused", forget: false },
  ];
  for (const { name, forget } of cases) {
    if (forget) {
      await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith("forja.ranking."))
          .forEach((key) => localStorage.removeItem(key)),
      );
    }
    const started = Date.now();
    await page.reload();
    await expect(nodes.first(), name).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: "canvas load", description: `${name}: ${elapsed} ms` });
    expect(elapsed, `${name}, in ms`).toBeLessThan(5000);
  }
  // Once shown, they stay shown: none is left hidden by a later render.
  await page.waitForTimeout(1500);
  const hidden = await nodes.evaluateAll(
    (all) => all.filter((n) => getComputedStyle(n).visibility === "hidden").length,
  );
  expect(hidden, "pipeline nodes left hidden").toBe(0);
});

test("the canvas draws the demo pipeline", async ({ page }) => {
  await openCanvas(page);
  for (const lane of ["sources", "cleaning", "star_schema", "serving"]) {
    await expect(page.getByTestId(`lane-${lane}`)).toBeVisible();
  }
  // fct_ventes sits in the star schema, right of its dimensions.
  const lane = (await page.getByTestId("lane-star_schema").boundingBox())!;
  const fact = (await node(page, "fct_ventes").boundingBox())!;
  const dim = (await node(page, "dim_clients").boundingBox())!;
  expect(fact.x).toBeGreaterThan(lane.x);
  expect(fact.x + fact.width).toBeLessThan(lane.x + lane.width);
  expect(fact.x).toBeGreaterThan(dim.x + dim.width);
  // « Ajuster »: every node is on screen.
  for (const id of ["src_clients", "dest_exports", "dim_date", "dim_produits"]) {
    const box = (await node(page, id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  }
  await expect(page.getByTestId("canvas-minimap")).toBeVisible();
  await captureThemes(page, "canvas");
});

test("selecting dim_clients opens the inspector on its columns, in the URL", async ({ page }) => {
  await openCanvas(page);
  await node(page, "dim_clients").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByRole("heading", { name: "dim_clients" })).toBeVisible();
  await inspector.getByRole("tab", { name: "Colonnes" }).click();
  await expect(page).toHaveURL(/\?node=dim_clients&tab=columns$/);
  await expect(inspector.getByText("client_key")).toBeVisible();
  await expect(inspector.getByText("Pseudonymisé").first()).toBeVisible();
  // Out of the lineage, nodes fade; the minimap steps aside for the inspector.
  await expect(node(page, "dim_produits")).toHaveCSS("opacity", "0.28");
  await expect(page.getByTestId("canvas-minimap")).toHaveCSS("opacity", "0");
  await captureThemes(page, "selection");

  // The address is shareable: it reopens the same panel.
  await page.reload();
  await expect(inspector.getByText("client_key")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/pipeline$/);
});

test("⌘K « cli » finds the nodes and moves the camera to the one chosen", async ({ page }) => {
  await openCanvas(page);
  // Start away from dim_clients.
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(400);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("cli");
  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "dim_clients" })).toBeVisible();
  await expect(options.filter({ hasText: "clients.csv" })).toBeVisible();
  await captureThemes(page, "palette");
  await options.filter({ hasText: "dim_clients" }).click();
  await expect(page).toHaveURL(/node=dim_clients/);
  await page.waitForTimeout(700);
  expect(await offCentre(page, "dim_clients", true)).toBeLessThan(40);
});

test("the « À revoir » filter fades what needs nothing", async ({ page }) => {
  await openCanvas(page);
  await page.getByRole("radio", { name: /À revoir/ }).click();
  await expect(page.getByRole("radio", { name: /À revoir/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Everything of the demo is applied: every node fades.
  await expect(node(page, "fct_ventes")).toHaveCSS("opacity", "0.28");
  await page.getByRole("radio", { name: "Tout" }).click();
  await expect(node(page, "fct_ventes")).toHaveCSS("opacity", "1");
});

test("a Silver run moves the cleaned tables from waiting to done", async ({ page }) => {
  // dbt starts, parses the project, then builds four tables held « running » 1.5 s each.
  test.setTimeout(240_000);
  await openCanvas(page);
  await page.getByRole("button", { name: "Lancer un run" }).click();
  await page.getByRole("menuitem", { name: /^Nettoyage/ }).click();
  const cleaning = ["stg_clients", "stg_commandes", "stg_produits", "stg_lignes_commande"];
  // Each table goes through « En attente » or « En cours » before « Réussi ».
  await expect(page.locator('[data-state="running"], [data-state="pending"]').first()).toBeVisible({
    timeout: 30_000,
  });
  // The test API holds each dbt model « running » (FORJA_TEST_MODEL_DELAY_SECONDS): the node
  // shows « En cours » and the flow runs along its incoming link. dbt itself takes up to
  // 30 s to start and parse the project on a Windows workstation.
  await expect(page.locator('[data-state="running"]').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("edge-flow").first()).toBeAttached();
  await captureThemes(page, "run-in-progress");
  for (const id of cleaning) {
    await expect(node(page, id)).toHaveAttribute("data-state", "applied", { timeout: 120_000 });
  }
  await expect(page.getByText("Réussi").first()).toBeVisible();
  // The toast, at the top centre, besides the top bar pill.
  await expect(page.getByRole("status").filter({ hasText: "Nettoyage terminé" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("run-announcer")).toContainText("réussi");
});

test("a new project starts with the drop zone, a CSV becomes a source node", async ({ page }) => {
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
  const headers = { Authorization: `Bearer ${token}` };
  const project = await (
    await api.post("/projects", { headers, data: { name: `Nouveau ${Date.now()}` } })
  ).json();
  const users = (await (await api.get("/auth/users", { headers })).json()) as {
    id: string;
    email: string;
  }[];
  const engineer = users.find((u) => u.email === E2E.engineerEmail)!;
  await api.put(`/projects/${project.id}/members/${engineer.id}`, {
    headers,
    data: { role: "engineer" },
  });

  await signIn(page, credentials().engineer);
  await expectShell(page);
  await page.goto(`/projects/${project.id}/pipeline`);
  await expect(page.getByTestId("drop-zone")).toBeVisible();
  await expect(page.getByText("Déposez vos fichiers")).toBeVisible();
  await expect(page.getByText("Ouvrir le projet de démo")).toBeVisible();
  await captureThemes(page, "first-launch");

  await page.getByTestId("upload-input").setInputFiles({
    name: "ventes_magasin.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "id;magasin;date;montant\n1;Lyon;03/01/2025;12,50\n2;Paris;04/01/2025;8,00\n3;Lille;05/01/2025;21,90\n",
    ),
  });
  await expect(node(page, "src_ventes_magasin")).toBeVisible({ timeout: 60_000 });
  await expect(node(page, "stg_ventes_magasin")).toHaveAttribute("data-state", "review");
  await expect(page.getByTestId("drop-zone")).toHaveCount(0);
  await api.dispose();
});
