import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { E2E } from "./env.mjs";
import { credentials, expectShell, signIn } from "./helpers";

const API = `http://127.0.0.1:${E2E.apiPort}`;

type Session = { api: APIRequestContext; headers: Record<string, string> };

/** An API session of a demo user, to act while the browser watches another one. */
async function session(who: "analyst" | "engineer"): Promise<Session> {
  const api = await request.newContext({ baseURL: API });
  const login = await api.post("/auth/login", { data: credentials()[who] });
  const token = (await login.json()).access_token as string;
  return { api, headers: { Authorization: `Bearer ${token}` } };
}

/** Asks a question and validates its preview, as the analyst. */
async function validatedMart(question: string): Promise<{ id: string; projectId: string }> {
  const { api, headers } = await session("analyst");
  try {
    const projects = (await (await api.get("/projects", { headers })).json()) as { id: string }[];
    const projectId = projects[0]!.id;
    const asked = await api.post(`/projects/${projectId}/mart-requests`, {
      headers,
      data: { question },
    });
    const id = (await asked.json()).mart_request.id as string;
    await expect
      .poll(
        async () => (await (await api.get(`/mart-requests/${id}`, { headers })).json()).status,
        {
          timeout: 30_000,
        },
      )
      .toBe("previewed");
    const validated = await api.post(`/mart-requests/${id}/validate`, { headers, data: {} });
    expect(validated.ok()).toBe(true);
    return { id, projectId };
  } finally {
    await api.dispose();
  }
}

test.describe.configure({ mode: "serial" });

test("an engineer is told at once that a data mart waits, and opens it", async ({ page }) => {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/pipeline$/);
  await expectShell(page);
  const bell = page.getByTestId("notifications-bell");
  const engineer = await session("engineer");
  const unread = await engineer.api.get("/notifications?limit=1", { headers: engineer.headers });
  const before = (await unread.json()).unread as number;
  await engineer.api.dispose();
  // The panel has loaded what was there before the new notification.
  await expect(bell).toHaveAttribute(
    "aria-label",
    `Notifications${before ? `, ${before} non lues` : ""}`,
  );

  // No reload: the notification arrives through the event stream.
  const mart = await validatedMart("Nombre de commandes par catégorie");
  await expect(bell).toHaveAttribute("aria-label", `Notifications, ${before + 1} non lues`, {
    timeout: 20_000,
  });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  const item = panel.getByText("Un data mart attend votre approbation").first();
  await expect(item).toBeVisible();
  await panel.getByRole("link", { name: "Approuver" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/marts/${mart.id}/preview$`));
  await expect(page.getByTestId("awaiting-approval")).toBeVisible();
  await expect(bell).toHaveAttribute(
    "aria-label",
    `Notifications${before ? `, ${before} non lues` : ""}`,
  );
});

test("an analyst sees the rejection and its reason as it happens", async ({ page }) => {
  await signIn(page, credentials().analyst);
  await expect(page).toHaveURL(/\/home$/);
  await expectShell(page);
  const mart = await validatedMart("Quantité vendue par segment");

  // The engineer rejects from their own session, while the analyst's page stays open.
  const api = await request.newContext({ baseURL: API });
  try {
    const login = await api.post("/auth/login", { data: credentials().engineer });
    const token = (await login.json()).access_token as string;
    const rejected = await api.post(`/mart-requests/${mart.id}/reject`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { reason: "Doublon du data mart mensuel" },
    });
    expect(rejected.ok()).toBe(true);
  } finally {
    await api.dispose();
  }

  const notice = page.getByRole("alert").filter({ hasText: "Data mart rejeté" });
  await expect(notice).toContainText("Doublon du data mart mensuel", { timeout: 20_000 });
  await page.getByTestId("notifications-bell").click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("Doublon du data mart mensuel")).toBeVisible();
  await panel.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await expect(panel.getByRole("button", { name: "Tout marquer comme lu" })).toBeHidden();
});
