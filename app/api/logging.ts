import { getSql } from "../../db/index.ts";

export type AuditEvent =
  | "user_login" | "file_upload_initiated" | "file_upload_completed"
  | "reconciliation_started" | "reconciliation_completed" | "reconciliation_failed"
  | "report_generated" | "report_downloaded" | "template_created"
  | "template_updated" | "template_deleted" | "run_deleted"
  | "cleanup_succeeded" | "cleanup_failed" | "malware_scan_completed"
  | "malware_scan_rejected";

const safeMessages: Record<string, string> = {
  AUTH_REQUIRED: "Authentication required.", NOT_FOUND: "Resource not found.",
  RATE_LIMITED: "Too many requests. Please wait and try again.",
  CONCURRENCY_LIMIT: "A reconciliation is already processing. Please wait for it to finish.",
  TIMEOUT: "Processing exceeded the pilot time limit.",
  INVALID_UPLOAD: "The uploaded file could not be processed safely.",
  SIZE_LIMIT: "The upload exceeds the pilot size limit.",
  ROW_LIMIT: "The upload exceeds the pilot row limit.",
  REPORT_LIMIT: "The generated report exceeds the pilot size limit.",
  PLAN_LIMIT: "Your plan's monthly reconciliation limit has been reached.",
  PLAN_FORMAT: "This file format is not included in your current plan.",
  PLAN_FEATURE: "This feature is not included in your current plan.",
  SEAT_LIMIT: "This team has reached its 10-user limit.",
  BILLING_CONFIGURATION: "Billing is temporarily unavailable.",
  MALWARE_DETECTED: "The upload was rejected by the security scanner.",
  MALWARE_SCANNER_UNAVAILABLE: "File scanning is temporarily unavailable. Please try again later.",
  SCHEMA_OUTDATED: "The service is temporarily unavailable during an update.",
  SCHEMA_UNAVAILABLE: "The database schema could not be verified.",
  INTERNAL: "The request could not be completed.",
};

export class SafeError extends Error {
  code: keyof typeof safeMessages;
  status: number;

  constructor(code: keyof typeof safeMessages, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
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
