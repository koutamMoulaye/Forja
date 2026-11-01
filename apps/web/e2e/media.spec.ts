import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "./fixtures";
import { credentials, signIn } from "./helpers";

// The screenshot and the short journey of the README, on the demo project:
//
//   pnpm exec playwright test --project media
//   uv run --with pillow python ../../scripts/docs_media.py
//
// Frames and the capture go to test-results/media (emptied first); docs_media.py turns
// them into docs/assets/canvas.png and docs/assets/journey.gif. Not part of the e2e run.

const OUT = join(__dirname, "..", "test-results", "media");
const FRAMES = join(OUT, "frames");

type Frame = { file: string; ms: number };

/** Frames of the journey, each shown for its own duration in the GIF. */
class Film {
  frames: Frame[] = [];

  async shot(page: Page, ms: number) {
    const file = `${String(this.frames.length).padStart(3, "0")}.png`;
    await page.screenshot({ path: join(FRAMES, file) });
    this.frames.push({ file, ms });
  }

  /** A few frames while something moves (an entrance, a panel opening). */
  async roll(page: Page, count: number, every = 120) {
    for (let i = 0; i < count; i++) {
      await this.shot(page, every);
      await page.waitForTimeout(every);
    }
  }

  save() {
    writeFileSync(join(OUT, "frames.json"), JSON.stringify(this.frames, null, 2));
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
});

test("canvas screenshot and the journey of the README", { tag: "@media" }, async ({ browser }) => {
  test.setTimeout(240_000);
  const film = new Film();
  const engineer = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await engineer.newPage();
  await signIn(page, credentials().engineer);
  await expect(page).toHaveURL(/\/projects\/[^/]+\/pipeline$/);
  const projectUrl = page.url().replace(/\/pipeline$/, "");
  await expect(page.getByTestId("node-fct_ventes")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500); // entrance and camera settled
  await page.screenshot({ path: join(OUT, "canvas.png"), animations: "disabled" });

  // 1. The pipeline, then a node of the star schema in the inspector.
  await film.shot(page, 1800);
  await page.getByTestId("node-fct_ventes").click();
  await film.roll(page, 5);
  await film.shot(page, 2200);
  await engineer.close();

  // 2. An analyst asks in French; Forja answers with what it understood and a preview.
  const analyst = await browser.newContext({
    locale: "fr-FR",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const home = await analyst.newPage();
  await signIn(home, credentials().analyst);
  await expect(home).toHaveURL(/\/projects\/[^/]+\//);
  await home.goto(`${projectUrl}/home`);
  await expect(home.getByRole("heading", { name: /^Bonjour / })).toBeVisible();
  await home.waitForTimeout(800);
  await film.shot(home, 1200);
  const question = "Chiffre d'affaires par mois en 2024";
  const field = home.getByLabel("Posez une question");
  await field.click();
  for (let i = 3; i <= question.length; i += 3) {
    await field.fill(question.slice(0, i));
    await film.shot(home, 90);
  }
  await field.fill(question);
  await film.shot(home, 700);
  await home.keyboard.press("Enter");
  await expect(home).toHaveURL(/\/ask\/[^/]+$/);
  await film.roll(home, 6, 150);
  await expect(home.getByTestId("ready-card")).toBeVisible({ timeout: 60_000 });
  await home.waitForTimeout(400);
  await film.shot(home, 2000);
  await home.getByRole("link", { name: "Ouvrir l’aperçu" }).click();
  await expect(home.getByTestId("understood")).toBeVisible({ timeout: 30_000 });
  await home.waitForTimeout(800);
  await film.shot(home, 2500);
  await home.mouse.wheel(0, 500);
  await home.waitForTimeout(600);
  await film.shot(home, 3000);
  await analyst.close();
  film.save();
});
