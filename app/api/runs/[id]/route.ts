import { getSql } from "../../../../db";
import { audit, SafeError } from "../../logging";
import { apiError, requireApiUser, uploadsBucket } from "../../server";
import { deleteTrackedObject } from "../../storage";
import { getPlanAccess } from "../../plans";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const user = await requireApiUser(request), access = await getPlanAccess(user.id), { id } = await context.params, sql = getSql();
    const owned = access.workspaceId ? await sql`SELECT id FROM rf_runs WHERE id=${id} AND workspace_id=${access.workspaceId}` : await sql`SELECT id FROM rf_runs WHERE id=${id} AND user_id=${user.id} AND workspace_id IS NULL`; if (!owned[0]) throw new SafeError("NOT_FOUND", 404);
    const objects = await sql`SELECT id FROM rf_storage_objects WHERE run_id=${id} AND user_id=${user.id} AND status!='deleted'`;
    for (const item of objects) await deleteTrackedObject(uploadsBucket(), String(item.id), requestId);
    await audit("run_deleted", requestId, user.id, id, "run");
    if (access.workspaceId) await sql`DELETE FROM rf_runs WHERE id=${id} AND workspace_id=${access.workspaceId}`; else await sql`DELETE FROM rf_runs WHERE id=${id} AND user_id=${user.id} AND workspace_id IS NULL`;
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
