import { getSql } from "../../../db";
import { apiError, requireApiUser, uploadsBucket } from "../server";
import { runExpiredCleanup } from "../storage";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request); const sql = getSql();
    await runExpiredCleanup(uploadsBucket(), request.headers.get("x-request-id") || crypto.randomUUID(), 25);
    const rows = await sql`SELECT id,name,status,source_name,target_name,source_rows,target_rows,summary,failure_message,created_at,completed_at,report_expires_at,report_deleted_at FROM rf_runs WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 50`;
    return Response.json({ runs: rows });
  } catch (error) { return apiError(error); }
}
