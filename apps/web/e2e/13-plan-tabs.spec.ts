import { expect, request, test } from "./fixtures";
import { E2E } from "./env.mjs";
import { credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

type Plan = {
  version: number;
  columns: { source_column: string; included: boolean }[];
  primary_key: { columns: string[] } | null;
};

// A plan open in a tab while it changes elsewhere (another tab, another engineer): the
// decision taken on the version shown is refused, the tab says so and reloads the plan.
test("a plan changed in another tab is reloaded, not overwritten", async ({ page }) => {
  const engineer = credentials().engineer;
  const api = await request.newContext({ baseURL: API });
  const login = await api.post("/auth/login", { data: engineer });
  const headers = { Authorization: `Bearer ${(await login.json()).access_token as string}` };
  try {
    const [project] = (await (await api.get("/projects", { headers })).json()) as { id: string }[];
    const sources = (await (
      await api.get(`/projects/${project!.id}/sources`, { headers })
    ).json()) as { id: string; name: string }[];
    const source = sources.find((s) => s.name === "produits")!;
    const planUrl = `/sources/${source.id}/plan`;
    const plan = (await (await api.get(planUrl, { headers })).json()) as Plan;
    const key = new Set(plan.primary_key?.columns ?? []);
    const column = plan.columns.find((c) => c.included && !key.has(c.source_column))!;
    const toggle = async (included: boolean) => {
      const response = await api.patch(planUrl, {
        headers,
        data: { columns: { [column.source_column]: { included } } },
      });
      expect(response.ok(), await response.text()).toBe(true);
    };

    // A draft to review, opened in this tab.
    await toggle(false);
    await signIn(page, engineer);
    await expectShell(page);
    await page.goto(`/projects/${project!.id}/sources/${source.id}/plan`);
    await expect(page.getByTestId("plan-review")).toBeVisible();
    const pending = page.getByTestId("rule-list").locator('[data-decision="pending"]').first();
    await expect(pending).toBeVisible();

    // Meanwhile, the plan moves on elsewhere.
    await toggle(true);
    await pending.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Le plan a changé entre-temps" }),
    ).toBeVisible();

    // Reloaded on the latest version, the same decision goes through.
    const validated = page.getByTestId("rule-list").locator('[data-decision="validated"]');
    const before = await validated.count();
    const again = page.getByTestId("rule-list").locator('[data-decision="pending"]').first();
    await again.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(validated).toHaveCount(before + 1);
    await page.reload();
    await expect(validated).toHaveCount(before + 1);
  } finally {
    await api.dispose();
  }
});
