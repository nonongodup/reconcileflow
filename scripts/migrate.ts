import { applyMigrations, assertSchemaCompatible } from "../db/index.ts";

await applyMigrations();
await assertSchemaCompatible();
console.log("ReconcileFlow database migrations are current.");
