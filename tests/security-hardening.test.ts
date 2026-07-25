import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { paginate } from "../app/api/pagination.ts";
import { csvCell } from "../app/api/report.ts";

test("detailed results are paginated and capped", () => {
  const result = paginate(Array.from({ length: 250 }, (_, index) => index), 2, 1000);
  assert.equal(result.items.length, 100); assert.equal(result.items[0], 100); assert.equal(result.totalPages, 3);
});

test("CSV export prevents spreadsheet formula injection", () => {
  for (const value of ["=cmd()", "+1", "-2", "@SUM(A1)"]) assert.match(csvCell(value), /^"'/);
});

test("resource routes scope database access to the authenticated owner", async () => {
  for (const file of ["../app/api/templates/route.ts", "../app/api/history/route.ts", "../app/api/reconcile/route.ts", "../app/api/reports/[id]/route.ts", "../app/api/runs/[id]/route.ts", "../app/api/runs/[id]/details/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /requireApiUser\(request\)/);
    assert.match(source, /user_id=\$\{user\.id\}|user_id\s*=\s*\$\{user\.id\}|\$\{user\.id\}/);
    assert.doesNotMatch(source, /body\.(userId|ownerId|email)|searchParams\.get\(["'](userId|ownerId|email)/);
  }
});

test("cross-owner lookups return generic not found responses", async () => {
  for (const file of ["../app/api/templates/route.ts", "../app/api/reports/[id]/route.ts", "../app/api/runs/[id]/route.ts", "../app/api/runs/[id]/details/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /SafeError\("NOT_FOUND", 404\)/);
    assert.doesNotMatch(source, /belongs to another|other user|owner email/i);
  }
});

test("Clerk identity is verified server-side and browser identity is ignored", async () => {
  const source = await readFile(new URL("../app/api/server.ts", import.meta.url), "utf8");
  assert.match(source, /authenticateRequest\(request/);
  assert.match(source, /auth\.userId/);
  assert.match(source, /authorizedParties/);
  assert.doesNotMatch(source, /oai-authenticated|body\.(userId|ownerId|email)/);
});

test("account settings reject signed-out requests on the server", async () => {
  const source = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /if \(!state\.isAuthenticated\) redirect/);
  assert.doesNotMatch(source, /useEffect|useAuth/);
});

test("normal application requests do not apply migrations", async () => {
  for (const file of ["../app/api/health/route.ts", "../app/api/server.ts", "../app/api/reconcile/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /ensureSchema|applyMigrations/);
  }
});

test("browser code does not persist detailed data", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /pageSize=25/);
});
