import { writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { SCHEMA_FILE, renderSchema } from "./api-schema.mjs";

await writeFile(SCHEMA_FILE, await renderSchema(), "utf8");
console.log(`API types written to ${relative(process.cwd(), SCHEMA_FILE)}`);
