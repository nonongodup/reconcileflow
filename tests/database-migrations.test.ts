import assert from "node:assert/strict";
import test from "node:test";
import { migrations } from "../db/migrations.ts";

test("database migrations are ordered, unique, and non-destructive", () => {
  const versions = migrations.map((migration) => migration.version);
  assert.deepEqual(versions, [...new Set(versions)].sort((a, b) => a - b));
  const statements = migrations.flatMap((migration) => migration.statements);
  const sql = statements.join("\n");
  for (const statement of statements) assert.doesNotMatch(statement.trim(), /^(DROP|TRUNCATE|DELETE)\b/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rf_templates/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rf_runs/i);
});
