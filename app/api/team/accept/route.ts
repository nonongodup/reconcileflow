import { createHash } from "node:crypto";
import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import { SafeError } from "../../logging";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request), { token } = await request.json() as { token?: string };
    if (!token) throw new SafeError("NOT_FOUND",404);
    const sql = getSql(), tokenHash = createHash("sha256").update(token).digest("hex");
    const invitations = await sql`SELECT i.id,i.workspace_id,i.email,i.role FROM rf_workspace_invitations i JOIN rf_workspaces w ON w.id=i.workspace_id JOIN rf_subscriptions s ON s.user_id=w.owner_user_id WHERE i.token_hash=${tokenHash} AND i.accepted_at IS NULL AND i.expires_at>now() AND s.plan='team' AND s.status IN ('active','trialing')`;
    const invitation = invitations[0];
    if (!invitation || String(invitation.email).toLowerCase() !== user.email.toLowerCase()) throw new SafeError("NOT_FOUND",404);
    const seats = await sql`SELECT count(*)::int AS count FROM rf_workspace_members WHERE workspace_id=${invitation.workspace_id}`; if (Number(seats[0]?.count || 0)>=10) throw new SafeError("SEAT_LIMIT",409);
    await sql`INSERT INTO rf_workspace_members (workspace_id,user_id,role) VALUES (${invitation.workspace_id},${user.id},${invitation.role}) ON CONFLICT DO NOTHING`;
    await sql`UPDATE rf_workspace_invitations SET accepted_at=now() WHERE id=${invitation.id}`;
    return Response.json({ accepted: true });
  } catch (error) { return apiError(error); }
}
