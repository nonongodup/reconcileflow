import { createHash, randomBytes } from "node:crypto";
import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import { getPlanAccess } from "../../plans";
import { SafeError } from "../../logging";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request),
      access = await getPlanAccess(user.id);
    if (access.plan !== "team" || !access.workspaceId)
      throw new SafeError("PLAN_FEATURE", 403);
    const sql = getSql();
    const members =
      await sql`SELECT u.id,u.email,u.display_name,m.role,m.joined_at FROM rf_workspace_members m JOIN rf_users u ON u.id=m.user_id WHERE m.workspace_id=${access.workspaceId} ORDER BY m.joined_at`;
    const invitations =
      access.role === "owner" || access.role === "admin"
        ? await sql`SELECT id,email,role,expires_at,created_at FROM rf_workspace_invitations WHERE workspace_id=${access.workspaceId} AND accepted_at IS NULL AND expires_at>now()`
        : [];
    return Response.json(
      { members, invitations, limit: 10 },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request),
      access = await getPlanAccess(user.id);
    if (
      access.plan !== "team" ||
      !access.workspaceId ||
      !["owner", "admin"].includes(access.role)
    )
      throw new SafeError("PLAN_FEATURE", 403);
    const body = (await request.json()) as {
      email?: string;
      role?: "admin" | "member";
    };
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new SafeError("NOT_FOUND", 400);
    const sql = getSql();
    const seats =
      await sql`SELECT (SELECT count(*) FROM rf_workspace_members WHERE workspace_id=${access.workspaceId}) + (SELECT count(*) FROM rf_workspace_invitations WHERE workspace_id=${access.workspaceId} AND accepted_at IS NULL AND expires_at>now()) AS count`;
    if (Number(seats[0]?.count || 0) >= access.entitlements.seats)
      throw new SafeError("SEAT_LIMIT", 409);
    const token = randomBytes(32).toString("hex"),
      id = crypto.randomUUID(),
      expires = new Date(Date.now() + 7 * 86400000);
    await sql`INSERT INTO rf_workspace_invitations (id,workspace_id,email,token_hash,role,expires_at) VALUES (${id},${
      access.workspaceId
    },${email},${hash(token)},${
      body.role === "admin" ? "admin" : "member"
    },${expires.toISOString()}) ON CONFLICT (workspace_id,lower(email)) WHERE accepted_at IS NULL DO UPDATE SET token_hash=EXCLUDED.token_hash,role=EXCLUDED.role,expires_at=EXCLUDED.expires_at,created_at=now()`;
    const origin = process.env.APP_URL || new URL(request.url).origin;
    return Response.json(
      {
        invitationUrl: `${origin}/account?invite=${token}`,
        expiresAt: expires.toISOString(),
      },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
