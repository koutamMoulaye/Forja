// Starts the real Forja API for the end-to-end tests: a fresh workspace, the
// demonstration project (`forja demo`), then `forja serve` with a simulated language
// model for the business agent (tests/e2e_server.py). Shared-instance mode, so that
// invitations work, and data marts wait for an engineer's approval. The accounts created
// by the demo are written to e2e/.data/credentials.json for the tests.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { E2E } from "./env.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const dataDir = fileURLToPath(new URL("./.data/", import.meta.url));
const workspace = `${dataDir}workspace`;

rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });

const env = {
  ...process.env,
  FORJA_DATA_DIR: workspace,
  FORJA_API_HOST: "127.0.0.1",
  FORJA_API_PORT: String(E2E.apiPort),
  FORJA_AUTH_MODE: "multi",
  FORJA_MART_REQUIRE_APPROVAL: "true",
  FORJA_AUTH_BOOTSTRAP_EMAIL: E2E.admin.email,
  FORJA_AUTH_BOOTSTRAP_PASSWORD: E2E.admin.initialPassword,
  FORJA_AUTH_TRUST_FORWARDED_FOR: "true",
  FORJA_LLM_PROVIDER: "",
  FORJA_LOG_FORMAT: "console",
  FORJA_LOG_LEVEL: "WARNING",
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
};

const demo = spawnSync("uv", ["run", "forja", "demo"], { cwd: repo, env, encoding: "utf8" });
if (demo.status !== 0) {
  process.stderr.write(demo.stdout + demo.stderr);
  process.exit(demo.status ?? 1);
}

const accounts = {};
for (const line of demo.stdout.split(/\r?\n/)) {
  const match = /^\s+(\S+@\S+)\s+(\S+)\s*$/.exec(line);
  if (match) accounts[match[1]] = match[2];
}
const credentials = {
  admin: { email: E2E.admin.email, password: E2E.admin.initialPassword },
  engineer: { email: E2E.engineerEmail, password: accounts[E2E.engineerEmail] },
  analyst: { email: E2E.analystEmail, password: accounts[E2E.analystEmail] },
};
if (!credentials.engineer.password || !credentials.analyst.password) {
  process.stderr.write(`demo accounts not found in:\n${demo.stdout}`);
  process.exit(1);
}
writeFileSync(`${dataDir}credentials.json`, JSON.stringify(credentials, null, 2));

// Each dbt model stays « running » a moment, so the tests can see a run in progress; the
// simulated model takes a few seconds, as a long job the interface must follow.
const api = spawn("uv", ["run", "python", "-m", "tests.e2e_server"], {
  cwd: repo,
  env: { ...env, FORJA_TEST_MODEL_DELAY_SECONDS: "1.5", FORJA_E2E_LLM_DELAY_SECONDS: "6" },
  stdio: "inherit",
});
const stop = () => api.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api.on("exit", (code) => process.exit(code ?? 0));
