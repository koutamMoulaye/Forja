import AxeBuilder from "@axe-core/playwright";
import { E2E } from "./env.mjs";
import { expect, request, test, type Page } from "./fixtures";
import { credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

/** No serious or critical WCAG 2.2 AA violation on the screen as it stands. */
async function audit(page: Page, name: string, scope?: string) {
  await page.evaluate(() => document.fonts.ready);
  const builder = new AxeBuilder({ page });
  // A panel over the page: the text seen through its glass is not what is audited.
  if (scope) builder.include(scope);
  const results = await builder
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${name}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    );
  expect(blocking, `axe on ${name}`).toEqual([]);
}

async function visit(page: Page, path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await ready();
  await page.waitForLoadState("networkidle");
}

/** Ids of real objects of the demo project, read through the API as the engineer. */
async function demoIds() {
  const api = await request.newContext({ baseURL: API });
  try {
    const login = await api.post("/auth/login", { data: credentials().engineer });
    const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
    const [project] = (await (await api.get("/projects", { headers })).json()) as { id: string }[];
    const get = async (path: string) => (await api.get(path, { headers })).json();
    const sources = (await get(`/projects/${project!.id}/sources`)) as { id: string }[];
    const runs = await get(`/projects/${project!.id}/runs`);
    const marts = await get(`/projects/${project!.id}/mart-requests`);
    const items = <T>(page: T[] | { items: T[] }) => (Array.isArray(page) ? page : page.items);
    return {
      projectId: project!.id,
      sourceId: sources[0]!.id,
      runId: items(runs as { id: string }[])[0]!.id,
      martId: items(marts as { id: string; status: string }[]).find(
        (m) => m.status === "published",
      )!.id,
    };
  } finally {
    await api.dispose();
  }
}

test.describe.configure({ mode: "serial" });

test("sign-in screens", async ({ page }) => {
  await visit(page, "/auth/login", () => expect(page.getByLabel("Adresse e-mail")).toBeVisible());
  await audit(page, "login");
});

test("engineer screens", async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await demoIds();
  await signIn(page, credentials().engineer);
  await expectShell(page);
  const base = `/projects/${ids.projectId}`;
  const screens: [string, string][] = [
    ["pipeline", `${base}/pipeline`],
    ["sources", `${base}/sources`],
    ["connections", `${base}/sources/connections`],
    ["source", `${base}/sources/${ids.sourceId}`],
    ["plan", `${base}/sources/${ids.sourceId}/plan`],
    ["cleaning", `${base}/cleaning`],
    ["model", `${base}/model`],
    ["serving", `${base}/serving`],
    ["approvals", `${base}/approvals`],
    ["runs", `${base}/runs`],
    ["run", `${base}/runs/${ids.runId}`],
    ["semantic", `${base}/semantic`],
    ["preview", `${base}/marts/${ids.martId}/preview`],
  ];
  for (const [name, path] of screens) {
    await visit(page, path, () => expectShell(page));
    await audit(page, name);
  }
  // The add-source wizards, on their first step.
  await visit(page, `${base}/sources`, () => expectShell(page));
  for (const kind of ["database", "api"]) {
    await page.getByTestId("add-source").click();
    await page.getByTestId(`add-source-${kind}`).click();
    await expect(page.getByRole("button", { name: "Tester la connexion" })).toBeVisible();
    await audit(page, `wizard-${kind}`, '[data-testid="add-source-dialog"]');
    await page.keyboard.press("Escape");
  }
  await visit(page, "/page-inconnue", () => expect(page.getByTestId("status-404")).toBeVisible());
  await audit(page, "404");
  await page.goto(`${base}/runs?panel=notifications`);
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  await audit(page, "notifications", '[role="dialog"][aria-label="Notifications"]');
});

test("analyst screens", async ({ page }) => {
  test.setTimeout(120_000);
  const ids = await demoIds();
  await signIn(page, credentials().analyst);
  await expectShell(page);
  const base = `/projects/${ids.projectId}`;
  for (const [name, path] of [
    ["home", `${base}/home`],
    ["ask", `${base}/ask`],
    ["conversation", `${base}/ask/${ids.martId}`],
    ["marts", `${base}/marts`],
    ["indicators", `${base}/indicators`],
  ] as const) {
    await visit(page, path, () => expectShell(page));
    await audit(page, name);
  }
});

test("administration screens", async ({ page }) => {
  test.setTimeout(120_000);
  const ids = await demoIds();
  await signIn(page, { email: E2E.admin.email, password: E2E.admin.newPassword });
  await expectShell(page);
  for (const section of ["governance", "settings"]) {
    await visit(page, `/projects/${ids.projectId}/${section}`, () => expectShell(page));
    await audit(page, section);
  }
});
