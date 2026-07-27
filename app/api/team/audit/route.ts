import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import { getPlanAccess } from "../../plans";
import { SafeError } from "../../logging";

export async function GET(request: Request) {
  try {
    const user=await requireApiUser(request), access=await getPlanAccess(user.id);
    if(access.plan!=="team"||!access.workspaceId) throw new SafeError("PLAN_FEATURE",403);
    const sql=getSql();
    const rows=await sql`SELECT a.id,a.event_type,a.stage,a.safe_code,a.created_at,a.run_id,u.display_name,u.email FROM rf_audit_log a LEFT JOIN rf_users u ON u.id=a.user_id WHERE a.run_id IN (SELECT id FROM rf_runs WHERE workspace_id=${access.workspaceId}) OR a.user_id IN (SELECT user_id FROM rf_workspace_members WHERE workspace_id=${access.workspaceId}) ORDER BY a.created_at DESC LIMIT 200`;
    return Response.json({events:rows},{headers:{"cache-control":"no-store"}});
  } catch(error){return apiError(error);}
}
