import { expect, test, type Page } from "@playwright/test";
import { capture, credentials, expectShell, signIn } from "./helpers";

const node = (page: Page, id: string) => page.getByTestId(`node-${id}`);

async function openCanvas(page: Page) {
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  await expectShell(page);
  await expect(node(page, "fct_ventes")).toBeVisible();
}

const focusedNode = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null,
  );

const zoom = async (page: Page) =>
  Number((await page.getByLabel("Niveau de zoom").innerText()).replace(/\D/g, ""));

test.describe.configure({ mode: "serial" });

test("the canvas is driven with the keyboard", async ({ page }) => {
  await openCanvas(page);
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 820 } });

  // Arrows walk from node to node, in the direction pressed.
  await page.keyboard.press("ArrowDown");
  const first = await focusedNode(page);
  expect(first).not.toBeNull();
  await page.keyboard.press("ArrowRight");
  const second = await focusedNode(page);
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  const before = (await page.locator(`.react-flow__node[data-id="${first}"]`).boundingBox())!;
  const after = (await page.locator(`.react-flow__node[data-id="${second}"]`).boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x);

  // Enter opens the inspector on the focused node, Escape closes it.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`node=${second}`));
  await expect(page.getByTestId("inspector")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/pipeline$/);

  // +, - and 0: zoom in, out, and back to the framing of the whole pipeline.
  const fitted = await zoom(page);
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expect.poll(() => zoom(page)).toBeGreaterThan(fitted);
  await page.waitForTimeout(600);
  const closer = await zoom(page);
  await page.keyboard.press("-");
  await expect.poll(() => zoom(page)).toBeLessThan(closer);
  await page.keyboard.press("0");
  await expect.poll(() => zoom(page)).toBe(fitted);
});

test("a double-click grows the node into its detailed screen", async ({ page }) => {
  await openCanvas(page);
  const box = (await node(page, "dim_clients").boundingBox())!;
  await node(page, "dim_clients").dblclick();
  // The node's card is drawn over itself while the route changes (shared layoutId)…
  const layer = page.locator("div.fixed.z-\\[60\\]");
  await expect(layer).toContainText("dim_clients");
  const start = (await layer.boundingBox())!;
  expect(Math.abs(start.x - box.x)).toBeLessThan(80);
  // …then lands on the model screen, as its header.
  await expect(page).toHaveURL(/\/projects\/[^/]+\/model$/);
  await expect(page.getByTestId("screen-header")).toContainText("Modèle en étoile");
  await expect(layer).toHaveCount(0, { timeout: 5000 });
});
