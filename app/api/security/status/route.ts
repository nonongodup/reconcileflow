import { getSql } from "../../../../db";
import { apiError, limits, requireApiUser } from "../../server";
import { malwareScanningEnabled, malwareScanningRequired } from "../malware";

export async function GET(request: Request) {
  try {
    await requireApiUser(request); const sql = getSql();
    const state = (await sql`SELECT last_completed_at,last_status,processed_count,failed_count FROM rf_cleanup_state WHERE singleton=true`)[0];
    const failed = (await sql`SELECT count(*)::int AS count FROM rf_storage_objects WHERE status='cleanup_failed'`)[0];
    return Response.json({ authentication: "Clerk application authentication (server-validated sessions)", fileRetentionMinutes: limits.fileRetentionMinutes, resultRetentionHours: limits.resultRetentionHours, reportRetentionHours: limits.reportRetentionHours, cleanupStatus: state?.last_status || "unknown", lastCleanupRun: state?.last_completed_at || null, failedCleanupCount: Number(failed?.count || 0), maxUploadBytes: limits.maxUploadBytes, maxRows: limits.maxRows, maxColumns: limits.maxColumns, maxWorksheets: limits.maxWorksheets, malwareScanning: malwareScanningEnabled(), malwareScanFailClosed: malwareScanningRequired(), securityAlerting: Boolean(process.env.SECURITY_ALERT_WEBHOOK_URL), deletionVerification: true, detailedResultsTemporarilyRetained: true, limitations: ["Use only data approved by your organization until independent security and compliance reviews are completed", "Malware scanning requires an approved external or self-hosted scanner", "Cleanup occurs within the configured cleanup window, not at an exact second", "No enterprise compliance certification or penetration test"] }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
