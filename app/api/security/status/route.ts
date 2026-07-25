import { getSql } from "../../../../db";
import { apiError, limits, requireApiUser } from "../../server";

export async function GET(request: Request) {
  try {
    await requireApiUser(request); const sql = getSql();
    const state = (await sql`SELECT last_completed_at,last_status,processed_count,failed_count FROM rf_cleanup_state WHERE singleton=true`)[0];
    const failed = (await sql`SELECT count(*)::int AS count FROM rf_storage_objects WHERE status='cleanup_failed'`)[0];
    return Response.json({ authentication: "Clerk application authentication (server-validated sessions)", fileRetentionMinutes: limits.fileRetentionMinutes, resultRetentionHours: limits.resultRetentionHours, reportRetentionHours: limits.reportRetentionHours, cleanupStatus: state?.last_status || "unknown", lastCleanupRun: state?.last_completed_at || null, failedCleanupCount: Number(failed?.count || 0), maxUploadBytes: limits.maxUploadBytes, maxRows: limits.maxRows, maxColumns: limits.maxColumns, maxWorksheets: limits.maxWorksheets, malwareScanning: false, detailedResultsTemporarilyRetained: true, limitations: ["Synthetic or approved non-sensitive data only", "No malware scanning", "Cleanup occurs within the configured cleanup window, not at an exact second", "No enterprise compliance certification or penetration test"] }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
