import { getSql } from "../../../../../db";
import { SafeError } from "../../../logging";
import { apiError, requireApiUser, uploadsBucket } from "../../../server";
import type { Result } from "../../../../reconciliation";
import { paginate } from "../../../pagination";
import { getPlanAccess } from "../../../plans";

const allowed = [
  "differences",
  "missing",
  "extra",
  "duplicateKeys",
  "invalidKeys",
] as const;
type DetailType = (typeof allowed)[number];
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiUser(request),
      access = await getPlanAccess(user.id),
      { id } = await context.params,
      url = new URL(request.url);
    const type = url.searchParams.get("type") as DetailType;
    if (!allowed.includes(type)) throw new SafeError("NOT_FOUND", 404);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize") || 25))
    );
    const sql = getSql();
    const rows = access.workspaceId
      ? await sql`SELECT s.object_key,s.expires_at FROM rf_storage_objects s JOIN rf_runs r ON r.id=s.run_id WHERE r.id=${id} AND r.workspace_id=${access.workspaceId} AND s.kind='result' AND s.status='active'`
      : await sql`SELECT s.object_key,s.expires_at FROM rf_storage_objects s JOIN rf_runs r ON r.id=s.run_id WHERE r.id=${id} AND r.user_id=${user.id} AND r.workspace_id IS NULL AND s.user_id=${user.id} AND s.kind='result' AND s.status='active'`;
    const item = rows[0] as
      | { object_key: string; expires_at: string }
      | undefined;
    if (!item || new Date(item.expires_at).getTime() <= Date.now())
      throw new SafeError("NOT_FOUND", 404);
    const object = await uploadsBucket().get(item.object_key);
    if (!object) throw new SafeError("NOT_FOUND", 404);
    const result = JSON.parse(
      new TextDecoder().decode(await object.arrayBuffer())
    ) as Result;
    const collection = result[type] as unknown[];
    return Response.json(paginate(collection, page, pageSize), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
