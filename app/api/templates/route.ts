import { getSql } from "../../../db";
import { enforceRateLimit } from "../controls";
import { audit, SafeError } from "../logging";
import { apiError, requireApiUser } from "../server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const user = await requireApiUser(request), sql = getSql(); await enforceRateLimit(user.id, "templates", 60); const rows = await sql`SELECT id,name,description,mappings,rules,created_at,updated_at FROM rf_templates WHERE user_id=${user.id} ORDER BY updated_at DESC`; return Response.json({ templates: rows }, { headers: { "cache-control": "no-store" } }); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try { const user = await requireApiUser(request), body = await request.json() as { name?: string; description?: string; mappings?: unknown; rules?: unknown }; if (!body.name?.trim()) throw new SafeError("NOT_FOUND", 400); const sql = getSql(), id = crypto.randomUUID(); const rows = await sql`INSERT INTO rf_templates (id,user_id,name,description,mappings,rules) VALUES (${id},${user.id},${body.name.trim().slice(0,120)},${body.description?.trim().slice(0,500) || ""},${JSON.stringify(body.mappings || [])}::jsonb,${JSON.stringify(body.rules || {})}::jsonb) RETURNING id,name,description,mappings,rules,created_at,updated_at`; await audit("template_created", requestId, user.id, null, "template"); return Response.json({ template: rows[0] }, { status: 201 }); } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try { const user = await requireApiUser(request), body = await request.json() as { id?: string; name?: string }; if (!body.id || !body.name?.trim()) throw new SafeError("NOT_FOUND", 404); const sql = getSql(); const rows = await sql`UPDATE rf_templates SET name=${body.name.trim().slice(0,120)},updated_at=now() WHERE id=${body.id} AND user_id=${user.id} RETURNING id,name,description,mappings,rules,created_at,updated_at`; if (!rows[0]) throw new SafeError("NOT_FOUND", 404); await audit("template_updated", requestId, user.id, null, "template"); return Response.json({ template: rows[0] }); } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try { const user = await requireApiUser(request), id = new URL(request.url).searchParams.get("id"); if (!id) throw new SafeError("NOT_FOUND", 404); const sql = getSql(); const rows = await sql`DELETE FROM rf_templates WHERE id=${id} AND user_id=${user.id} RETURNING id`; if (!rows[0]) throw new SafeError("NOT_FOUND", 404); await audit("template_deleted", requestId, user.id, null, "template"); return new Response(null, { status: 204 }); } catch (error) { return apiError(error); }
}
