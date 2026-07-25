import { createClerkClient } from "@clerk/backend";
import { assertSchemaCompatible, upsertUser } from "../../db";
import { sanitizeError } from "./logging";
import { getObjectStore } from "./object-store";

type RuntimeEnv = {
  APP_URL?: string;
  MAX_UPLOAD_BYTES?: string;
  MAX_ROWS_PER_FILE?: string;
  FILE_RETENTION_MINUTES?: string;
  REPORT_RETENTION_HOURS?: string;
  RESULT_RETENTION_HOURS?: string;
  MAX_REPORT_BYTES?: string;
  MAX_COLUMNS_PER_FILE?: string;
  MAX_WORKSHEETS?: string;
  MAX_CSV_ROW_LENGTH?: string;
  PROCESSING_TIMEOUT_MS?: string;
  MAX_CONCURRENT_RUNS?: string;
  MIGRATION_TOKEN?: string;
  CLEANUP_TOKEN?: string;
  CLERK_SECRET_KEY?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
};

const runtime = () => process.env as RuntimeEnv;
export const limits = {
  get maxUploadBytes() { return Number(runtime().MAX_UPLOAD_BYTES || 10 * 1024 * 1024); },
  get maxRows() { return Number(runtime().MAX_ROWS_PER_FILE || 100000); },
  get fileRetentionMinutes() { return Number(runtime().FILE_RETENTION_MINUTES || 15); },
  get reportRetentionHours() { return Number(runtime().REPORT_RETENTION_HOURS || 24); },
  get resultRetentionHours() { return Number(runtime().RESULT_RETENTION_HOURS || 4); },
  get maxReportBytes() { return Number(runtime().MAX_REPORT_BYTES || 5 * 1024 * 1024); },
  get maxColumns() { return Number(runtime().MAX_COLUMNS_PER_FILE || 250); },
  get maxWorksheets() { return Number(runtime().MAX_WORKSHEETS || 20); },
  get maxCsvRowLength() { return Number(runtime().MAX_CSV_ROW_LENGTH || 100000); },
  get processingTimeoutMs() { return Number(runtime().PROCESSING_TIMEOUT_MS || 30000); },
  get maxConcurrentRuns() { return Number(runtime().MAX_CONCURRENT_RUNS || 1); },
};

export function uploadsBucket() {
  return getObjectStore();
}

export async function requireApiUser(request: Request) {
  await assertSchemaCompatible();
  const runtime = process.env as RuntimeEnv;
  if (!runtime.CLERK_SECRET_KEY || !runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) throw new Error("AUTH_NOT_CONFIGURED");
  const clerk = createClerkClient({ secretKey: runtime.CLERK_SECRET_KEY, publishableKey: runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
  const state = await clerk.authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties: runtime.APP_URL ? [runtime.APP_URL] : undefined,
  });
  if (!state.isAuthenticated) throw new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const auth = state.toAuth();
  if (!auth.userId) throw new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const profile = await clerk.users.getUser(auth.userId);
  const primaryEmail = profile.emailAddresses.find((item) => item.id === profile.primaryEmailAddressId)?.emailAddress;
  if (!primaryEmail) throw new Response(JSON.stringify({ error: "Verified email required." }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return upsertUser(
    auth.userId,
    primaryEmail,
    profile.fullName || profile.username || null,
    new Date(profile.createdAt),
    new Date(profile.lastSignInAt || profile.createdAt),
  );
}

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  const safe = sanitizeError(error);
  return Response.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { "cache-control": "no-store" } });
}

export function runtimeSecret(name: "MIGRATION_TOKEN" | "CLEANUP_TOKEN") { return runtime()[name]; }
