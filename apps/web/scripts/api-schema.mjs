// Renders the TypeScript types of the Forja API from docs/openapi.json.
// Shared by `pnpm api:generate` and the test that checks the committed file is current.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

export const OPENAPI_FILE = fileURLToPath(new URL("../../../docs/openapi.json", import.meta.url));
export const SCHEMA_FILE = fileURLToPath(new URL("../src/lib/api/schema.d.ts", import.meta.url));

const HEADER = `/**
 * Types of the Forja API, generated from docs/openapi.json by \`pnpm api:generate\`.
 * Do not edit by hand: regenerate after \`forja openapi\`.
 */

`;

export async function renderSchema() {
  const document = JSON.parse(await readFile(OPENAPI_FILE, "utf8"));
  const ast = await openapiTS(document, { alphabetize: true, exportType: true });
  return HEADER + astToString(ast);
}
