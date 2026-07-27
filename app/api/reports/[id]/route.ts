import { getSql } from "../../../../db";
import { audit, SafeError } from "../../logging";
import { apiError, requireApiUser, uploadsBucket } from "../../server";
import { consumeTrackedObject, deleteTrackedObject } from "../../storage";
import { getPlanAccess } from "../../plans";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const user = await requireApiUser(request), access = await getPlanAccess(user.id), { id } = await context.params, sql = getSql();
    const rows = access.workspaceId ? await sql`SELECT id,report_key,report_expires_at,report_deleted_at FROM rf_runs WHERE id=${id} AND workspace_id=${access.workspaceId} AND status='completed'` : await sql`SELECT id,report_key,report_expires_at,report_deleted_at FROM rf_runs WHERE id=${id} AND user_id=${user.id} AND workspace_id IS NULL AND status='completed'`;
    const run = rows[0] as { id: string; report_key: string | null; report_expires_at: string | null; report_deleted_at: string | null } | undefined;
    if (!run?.report_key || run.report_deleted_at) throw new SafeError("NOT_FOUND", 404);
    const bucket = uploadsBucket();
    if (!run.report_expires_at || new Date(run.report_expires_at).getTime() <= Date.now()) {
      await deleteTrackedObject(bucket, run.report_key, requestId); if (access.workspaceId) await sql`UPDATE rf_runs SET report_deleted_at=now() WHERE id=${id} AND workspace_id=${access.workspaceId}`; else await sql`UPDATE rf_runs SET report_deleted_at=now() WHERE id=${id} AND user_id=${user.id} AND workspace_id IS NULL`;
      throw new SafeError("NOT_FOUND", 404);
    }
    const bytes = await consumeTrackedObject(bucket, run.report_key, requestId);
    if (!bytes) throw new SafeError("NOT_FOUND", 404);
    if (access.workspaceId) await sql`UPDATE rf_runs SET report_deleted_at=now() WHERE id=${id} AND workspace_id=${access.workspaceId}`; else await sql`UPDATE rf_runs SET report_deleted_at=now() WHERE id=${id} AND user_id=${user.id} AND workspace_id IS NULL`;
    await audit("report_downloaded", requestId, user.id, id, "report");
    return new Response(bytes, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reconcileflow-${id}.csv"`, "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
