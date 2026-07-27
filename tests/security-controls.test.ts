import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("uploads pass through malware scanning before temporary storage", () => {
  const route = read("app/api/reconcile/route.ts");
  assert.match(route, /scanUpload\(sourceBytes/);
  assert.ok(route.indexOf("scanUpload(sourceBytes") < route.indexOf("const response = await withTemporaryUploads"));
  const scanner = read("app/api/security/malware.ts");
  assert.match(scanner, /MALWARE_SCAN_MODE/);
  assert.match(scanner, /NODE_ENV === "production"\) return "required"/);
  assert.match(scanner, /mode === "required"/);
  assert.match(scanner, /MALWARE_DETECTED/);
});

test("security alerts contain safe identifiers rather than uploaded content", () => {
  const monitoring = read("app/api/security/monitoring.ts");
  assert.match(monitoring, /requestId/);
  assert.match(monitoring, /safeCode/);
  assert.doesNotMatch(monitoring, /fileContents|rowContents|emailAddress|sourceBytes|targetBytes/);
});

test("object deletion is verified and failures are reviewable", () => {
  const storage = read("app/api/storage.ts");
  assert.match(storage, /await bucket\.get\(item\.object_key\)/);
  assert.match(storage, /DELETE_VERIFICATION_FAILED/);
  assert.match(storage, /status='cleanup_failed'/);
});

test("scheduled cleanup accepts only protected cron or cleanup credentials", () => {
  const cleanup = read("app/api/internal/cleanup/route.ts");
  assert.match(cleanup, /CRON_SECRET/);
  assert.match(cleanup, /export const GET = POST/);
  assert.match(cleanup, /Bearer/);
  const vercel = JSON.parse(read("vercel.json"));
  assert.equal(vercel.crons[0].path, "/api/internal/cleanup");
});

test("production security headers and release configuration check are present", () => {
  const config = read("next.config.ts");
  for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy"]) assert.match(config, new RegExp(header));
  const script = read("scripts/security-check.ts");
  for (const setting of ["MALWARE_SCAN_MODE", "SECURITY_ALERT_WEBHOOK_URL", "S3_SERVER_SIDE_ENCRYPTION", "CRON_SECRET"]) assert.match(script, new RegExp(setting));
});
