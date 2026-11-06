// Manual test campaign, case 1 bis (docs/manual-tests.md, MT-3 to MT-19 and MT-2): one denormalized
// yearly attendance file, generated on the fly (tests/fixtures/attendance.py, never
// committed). The engineer's steps go through the API; the question is asked in the
// interface: « Total des entrées par région en 2023 » is answered without a language
// model, filtered on the year column, with its chart in the conversation and a total
// that matches the fact. The canvas of that project never hides a compartment's title.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, request, test, type APIRequestContext } from "./fixtures";
import { API, adminAccount, captureThemes, expectClear, expectShell, signIn } from "./helpers";

type Expected = {
  path: string;
  year: number;
  total: number;
  top: string;
  top_total: number;
  regions: number;
};

const REPO = join(__dirname, "..", "..", "..");
const QUESTION = "Total des entrées par région en 2023";
const number = new Intl.NumberFormat("fr-FR");

let api: APIRequestContext;
let projectId = "";
let expected: Expected;
let folder = "";

async function waitRun(runId: string) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const run = await (await api.get(`/runs/${runId}`)).json();
    if (!["queued", "running"].includes(run.status)) {
      expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`run ${runId} did not end`);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  folder = mkdtempSync(join(tmpdir(), "forja-case1-"));
  expected = JSON.parse(
    execFileSync("uv", ["run", "python", "-m", "tests.fixtures.attendance", folder], {
      cwd: REPO,
      encoding: "utf8",
    }),
  ) as Expected;
  const admin = await adminAccount();
  const login = await (
    await request.newContext({ baseURL: API })
  ).post("/auth/login", { data: admin });
  const token = (await login.json()).access_token as string;
  api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const project = await (
    await api.post("/projects", { data: { name: `Cas 1 bis ${Date.now()}` } })
  ).json();
  projectId = project.id;
  const [source] = await (
    await api.post(`/projects/${projectId}/sources`, {
      multipart: {
        file: {
          name: "entrees_et_categories_de_public.csv",
          mimeType: "text/csv",
          buffer: readFileSync(expected.path),
        },
      },
    })
  ).json();
  await api.post(`/sources/${source.id}/plan/approve`);
  await waitRun(
    (
      await (
        await api.post(`/projects/${projectId}/runs`, { data: { type: "build_silver" } })
      ).json()
    ).id,
  );
  const proposed = await (
    await api.post(`/projects/${projectId}/gold-plan/propose`, { data: { use_llm: false } })
  ).json();
  await waitRun(proposed.id);
  expect((await api.post(`/projects/${projectId}/gold-plan/approve`)).ok()).toBe(true);
  await waitRun(
    (await (await api.post(`/projects/${projectId}/runs`, { data: { type: "build_gold" } })).json())
      .id,
  );
});

test.afterAll(async () => {
  await api?.dispose();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

test("MT-14, MT-18: the question is answered in the chat, without a language model", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, await adminAccount());
  await expectShell(page);
  await page.goto(`/projects/${projectId}/ask`);
  const composer = page.getByTestId("agent-composer");
  await composer.locator("input").fill(QUESTION);
  await composer.locator("input").press("Enter");

  const answer = page.getByTestId("answer-card");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  const sentence = answer.getByTestId("answer-sentence");
  await expect(sentence).toContainText(`${number.format(expected.total)} entrées`);
  await expect(sentence).toContainText(
    `${expected.top} arrive en tête avec ${number.format(expected.top_total)} entrées`,
  );
  await expect(sentence).not.toContainText("€");
  const bars = answer.getByTestId("answer-bars");
  await expect(bars.locator("li")).toHaveCount(expected.regions);
  await expect(bars.locator("li").first()).toContainText(expected.top);
  await expect(bars.locator("figcaption")).toContainText("Barres de fréquentation par région");

  // The rows unfold; the actions are there.
  await answer.getByTestId("answer-rows").locator("summary").click();
  await expect(answer.getByTestId("answer-table").locator("tbody tr")).toHaveCount(
    expected.regions,
  );
  for (const id of ["answer-open-preview", "answer-validate", "answer-export", "answer-refine"]) {
    await expect(answer.getByTestId(id)).toBeVisible();
  }
  // The whole answer on screen, its actions included, once the run toast has gone.
  await answer.getByTestId("answer-refine").scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  await captureThemes(page, "mt18-chat-answer");

  // What Forja did, read from the API: the parser, the year column, the fact's total.
  const martId = /\/ask\/([^/?]+)/.exec(page.url())![1]!;
  const mart = await (await api.get(`/mart-requests/${martId}`)).json();
  const latest = mart.iterations[mart.iterations.length - 1];
  expect(latest.path).toBe("parser");
  expect(latest.spec.time_dimension).toBe("annee");
  expect(latest.spec.axes).toEqual(["musee.region"]);
  expect(latest.spec.time_grain ?? null).toBeNull();
  expect(latest.summary).toContain("(année de fréquentation)");
  const reconciliation = latest.preview.controls.find(
    (c: { code: string }) => c.code === "reconciliation",
  );
  expect(reconciliation.status).toBe("ok");
  expect(reconciliation.details.mart_total).toBe(expected.total);
  expect(reconciliation.details.fact_total).toBe(expected.total);

  // The refine field speaks of this project, not of the e-commerce demo.
  await expect(composer.locator("input")).not.toHaveAttribute("placeholder", /commandes|T1/);
});

test("MT-2: no compartment title is covered, sidebar open or in its rail", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, await adminAccount());
  await expectShell(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(`/projects/${projectId}/pipeline`);
    await expect(page.getByTestId("lane-sources")).toBeVisible();
    const stage = `${size.width}x${size.height}`;
    const toggle = page.getByTestId("sidebar-toggle");
    const open = (await toggle.getAttribute("aria-expanded")) === "true";
    await expectClear(page, `${stage}, ${open ? "sidebar open" : "rail"}`);
    await toggle.click();
    await expectClear(page, `${stage}, ${open ? "rail" : "sidebar open"}`);
    // A zoom then a visit later: the remembered camera keeps the titles clear.
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByTestId("lane-sources")).toBeVisible();
    await expectClear(page, `${stage}, remembered camera`);
    await page.getByRole("button", { name: "Ajuster à l’écran" }).click();
    await expectClear(page, `${stage}, « Ajuster »`);
    if (size.width === 1440) await captureThemes(page, `mt19-canvas-${stage}`);
    await toggle.click();
  }
});
