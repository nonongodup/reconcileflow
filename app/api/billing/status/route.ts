import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import { getPlanAccess } from "../../plans";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request), access = await getPlanAccess(user.id), sql = getSql();
    const usage = await sql`SELECT reconciliation_count FROM rf_plan_usage WHERE scope_id=${access.scopeId} AND period_start=date_trunc('month',now())::date`;
    const members = access.workspaceId ? await sql`SELECT count(*)::int AS count FROM rf_workspace_members WHERE workspace_id=${access.workspaceId}` : [{ count: 1 }];
    return Response.json({ plan: access.plan, entitlements: access.entitlements, usage: { reconciliations: Number(usage[0]?.reconciliation_count || 0), members: Number(members[0]?.count || 1) }, subscription: access.subscription }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
