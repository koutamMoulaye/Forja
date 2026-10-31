// JavaScript size budget per route, checked after `pnpm build`.
//
// For every page of the App Router, the first load is the framework's root files plus the
// chunks of the page and its layouts (its client reference manifest). Their gzip size is
// compared with js-budget.json. Code loaded later by dynamic import (the canvas, ELK) is
// not part of it. Exits 1 when a route goes over its budget.
//
//   node scripts/js-budget.mjs            check
//   node scripts/js-budget.mjs --json     the measures, for docs/benchmarks.md
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const next = join(root, ".next");
const budgets = JSON.parse(readFileSync(join(root, "js-budget.json"), "utf8"));

if (!existsSync(join(next, "build-manifest.json"))) {
  console.error("No build: run `pnpm build` first.");
  process.exit(2);
}

const sizes = new Map();
/** Gzip size of a file of .next/static, in bytes (cached). */
function gzipped(file) {
  const path = join(next, file.replace(/^\/?_next\//, ""));
  if (!sizes.has(path)) sizes.set(path, gzipSync(readFileSync(path), { level: 9 }).length);
  return sizes.get(path);
}

const build = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8"));
const rootFiles = [...build.polyfillFiles, ...build.rootMainFiles];

function manifests(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return manifests(path);
    return name === "page_client-reference-manifest.js" ? [path] : [];
  });
}

/** The route of a manifest: /projects/[projectId]/pipeline. */
function routeOf(path) {
  const folder = relative(join(next, "server", "app"), path)
    .split(sep)
    .slice(0, -1);
  return "/" + folder.filter((part) => !/^\(.*\)$/.test(part)).join("/");
}

function load(path) {
  const scope = {};
  new Function("globalThis", readFileSync(path, "utf8"))(scope);
  return Object.values(scope.__RSC_MANIFEST)[0];
}

const routes = [];
for (const path of manifests(join(next, "server", "app"))) {
  const manifest = load(path);
  const files = new Set(rootFiles);
  for (const chunks of Object.values(manifest.entryJSFiles ?? {})) {
    for (const file of chunks) files.add(file);
  }
  const route = routeOf(path);
  const firstLoad = [...files].reduce((total, file) => total + gzipped(file), 0);
  const budget = budgets.routes[route] ?? budgets.default;
  routes.push({ route, firstLoad, budget });
}
routes.sort((a, b) => b.firstLoad - a.firstLoad);

const kb = (bytes) => Math.round(bytes / 1024);
if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      routes.map((r) => ({
        route: r.route,
        first_load_kb: kb(r.firstLoad),
        budget_kb: r.budget,
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}

let over = 0;
console.log("route".padEnd(52), "first load", "  budget");
for (const r of routes) {
  const late = r.firstLoad > r.budget * 1024;
  if (late) over++;
  console.log(
    `${late ? "✗" : " "} ${r.route.padEnd(50)} ${String(kb(r.firstLoad)).padStart(6)} kB ${String(r.budget).padStart(6)} kB`,
  );
}
if (over) {
  console.error(`\n${over} route(s) over their JavaScript budget (gzip, js-budget.json).`);
  process.exit(1);
}
console.log(`\n${routes.length} routes within their JavaScript budget (gzip).`);
