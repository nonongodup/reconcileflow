import dotenv from "dotenv";
import { applyMigrations, assertSchemaCompatible } from "../db/index.ts";

dotenv.config({ path: ".env.local" });
dotenv.config();

await applyMigrations();
await assertSchemaCompatible();
console.log("ReconcileFlow database migrations are current.");
