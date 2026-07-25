import { getSql } from "../../db";

export type AuditEvent =
  | "user_login" | "file_upload_initiated" | "file_upload_completed"
  | "reconciliation_started" | "reconciliation_completed" | "reconciliation_failed"
  | "report_generated" | "report_downloaded" | "template_created"
  | "template_updated" | "template_deleted" | "run_deleted"
  | "cleanup_succeeded" | "cleanup_failed";

const safeMessages: Record<string, string> = {
  AUTH_REQUIRED: "Authentication required.", NOT_FOUND: "Resource not found.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  CONCURRENCY_LIMIT: "A reconciliation is already processing. Please wait for it to finish.",
  TIMEOUT: "Processing exceeded the pilot time limit.",
  INVALID_UPLOAD: "The uploaded file could not be processed safely.",
  SIZE_LIMIT: "The upload exceeds the pilot size limit.",
  ROW_LIMIT: "The upload exceeds the pilot row limit.",
  REPORT_LIMIT: "The generated report exceeds the pilot size limit.",
  SCHEMA_OUTDATED: "The service is temporarily unavailable during an update.",
  SCHEMA_UNAVAILABLE: "The database schema could not be verified.",
  INTERNAL: "The request could not be completed.",
};

export class SafeError extends Error {
  constructor(public code: keyof typeof safeMessages, public status = 400) { super(code); }
}

export function sanitizeError(error: unknown) {
  const code = error instanceof SafeError ? error.code : error instanceof Error && error.message in safeMessages ? error.message : "INTERNAL";
  return { code, message: safeMessages[code] || safeMessages.INTERNAL, status: error instanceof SafeError ? error.status : 500 };
}

export async function audit(eventType: AuditEvent, requestId: string, userId: string | null, runId: string | null, stage: string, safeCode?: string) {
  const sql = getSql();
  await sql`INSERT INTO rf_audit_log (id,user_id,run_id,request_id,event_type,stage,safe_code)
    VALUES (${crypto.randomUUID()},${userId},${runId},${requestId},${eventType},${stage},${safeCode || null})`;
}
