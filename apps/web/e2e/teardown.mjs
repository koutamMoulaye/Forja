// After the end-to-end run: the test PostgreSQL started by e2e/start-api.mjs is removed
// (Playwright stops the web servers without letting them clean up).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default function teardown() {
  const services = fileURLToPath(new URL("./.data/services.json", import.meta.url));
  if (!existsSync(services) || process.env.FORJA_TEST_DB_KEEP === "1") return;
  const { postgres } = JSON.parse(readFileSync(services, "utf8"));
  if (!postgres) return;
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "docker/compose.test-db.yml",
      "--profile",
      "test-db",
      "down",
      "-v",
      "--remove-orphans",
    ],
    { cwd: repo, stdio: "ignore", timeout: 120_000 },
  );
}
