// Manual test campaign, case 1 bis, second batch (docs/manual-tests.md, MT-20 to MT-43):
// the real questions asked on the museums file, answered in the chat without a language
// model, on the synthetic yearly attendance file (tests/fixtures/attendance.py, generated
// on the fly, never committed). Each answer is captured in both themes for review.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, request, test, type APIRequestContext } from "./fixtures";
import { API, adminAccount, captureThemes, expectShell, signIn } from "./helpers";
import type { Page } from "@playwright/test";

const REPO = join(__dirname, "..", "..", "..");

let api: APIRequestContext;
let projectId = "";
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

async function send(page: Page, text: string) {
  const input = page.getByTestId("agent-composer").locator("input");
  await input.fill(text);
  await input.press("Enter");
}

async function latestIteration(page: Page) {
  const martId = /\/ask\/([^/?]+)/.exec(page.url())![1]!;
  const mart = await (await api.get(`/mart-requests/${martId}`)).json();
  return { mart, latest: mart.iterations[mart.iterations.length - 1] };
}

async function settle(page: Page, name: string) {
  await page.waitForTimeout(3500); // the run toast goes away before the capture
  await captureThemes(page, name);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  folder = mkdtempSync(join(tmpdir(), "forja-case1-batch2-"));
  const written = JSON.parse(
    execFileSync("uv", ["run", "python", "-m", "tests.fixtures.attendance", folder], {
      cwd: REPO,
      encoding: "utf8",
    }),
  ) as { path: string };
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
    await api.post("/projects", { data: { name: `Cas 1 bis lot 2 ${Date.now()}` } })
  ).json();
  projectId = project.id;
  const [source] = await (
    await api.post(`/projects/${projectId}/sources`, {
      multipart: {
        file: {
          name: "entrees_et_categories_de_public.csv",
          mimeType: "text/csv",
          buffer: readFileSync(written.path),
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

test.beforeEach(async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, await adminAccount());
  await expectShell(page);
  await page.goto(`/projects/${projectId}/ask`);
});

test("Q1 Fréquentation totale par région en 2023", async ({ page }) => {
  await send(page, "Fréquentation totale par région en 2023");
  const answer = page.getByTestId("answer-card");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer.getByTestId("answer-bars").locator("li")).toHaveCount(4);
  const { latest } = await latestIteration(page);
  expect(latest.path).toBe("parser");
  expect(latest.spec.name).toBe("frequentation_par_region_2023");
  await settle(page, "batch2-q1-region-2023");
});

test("Q2 ce cas parle de quoi ? et donne-moi la météo actuelle à Paris (MT-23)", async ({
  page,
}) => {
  await send(page, "ce cas parle de quoi ? et donne-moi la météo actuelle à Paris");
  const answer = page.getByTestId("data-answer");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer).toContainText("entrees_et_categories_de_public.csv");
  await expect(answer).toContainText("Je laisse de côté « donne-moi la météo actuelle à Paris »");
  await expect(page.getByTestId("clarification")).toHaveCount(0);
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  await settle(page, "batch2-q2-about-and-weather");
});

test("Q3 Évolution de la fréquentation payante et gratuite par année (MT-25, MT-26)", async ({
  page,
}) => {
  await send(page, "Évolution de la fréquentation payante et gratuite par année");
  const answer = page.getByTestId("answer-card");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer.getByTestId("answer-legend").locator("li")).toHaveCount(2);
  await expect(answer.getByTestId("answer-series")).toHaveCount(2);
  await expect(answer.getByTestId("answer-sentence")).toContainText("point bas");
  const { latest } = await latestIteration(page);
  expect(latest.spec.metrics).toEqual(["payant", "gratuit"]);
  await settle(page, "batch2-q3-paying-and-free");
});

test("Q4 Top 10 then a new question in the same conversation (MT-20, MT-22)", async ({ page }) => {
  await send(page, "Top 10 des musées les plus visités en 2023");
  const answer = page.getByTestId("answer-card");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer.getByTestId("answer-bars").locator("li")).toHaveCount(10);
  const first = await latestIteration(page);
  expect(first.latest.spec.filters).toEqual([]);
  expect(first.latest.spec.limit).toBe(10);
  await settle(page, "batch2-q4-top-10");

  // Q6: a complete sentence in the same conversation is a new question.
  await send(page, "Nombre de musées par région");
  await expect
    .poll(async () => (await latestIteration(page)).latest.status, { timeout: 60_000 })
    .toBe("previewed");
  const { latest } = await latestIteration(page);
  expect(latest.kind).toBe("question");
  expect(latest.spec.metrics).toEqual(["nb_musees"]);
  expect(latest.spec.period ?? null).toBeNull();
  expect(latest.spec.limit ?? null).toBeNull();
  await expect(
    page.getByTestId("answer-card").last().getByTestId("answer-bars").locator("li"),
  ).toHaveCount(4);
  await settle(page, "batch2-q6-new-question");
});

test("Q5 Nombre de musées labellisés par année (MT-21)", async ({ page }) => {
  await send(page, "Nombre de musées labellisés par année");
  const clarification = page.getByTestId("clarification");
  await expect(clarification).toBeVisible({ timeout: 60_000 });
  await expect(clarification).toContainText("labellisés");
  await expect(clarification.getByTestId("clarify-option").first()).toContainText(
    "Avec une date d'appellation renseignée",
  );
  await settle(page, "batch2-q5-labellises");
});

test("An empty result explains itself and cannot be published (MT-24)", async ({ page }) => {
  await send(page, "Fréquentation par région en 2030");
  const answer = page.getByTestId("answer-card");
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer.getByTestId("answer-blocking")).toContainText("de 2013 à 2023");
  await expect(answer.getByTestId("answer-validate")).toBeDisabled();
  await settle(page, "batch2-empty-result");
});
