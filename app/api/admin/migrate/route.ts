import { applyMigrations } from "../../../../db";
import { apiError, runtimeSecret } from "../../server";

export async function POST(request: Request) {
  try {
    if (!runtimeSecret("MIGRATION_TOKEN") || request.headers.get("authorization") !== `Bearer ${runtimeSecret("MIGRATION_TOKEN")}`) return Response.json({ error: "Not found." }, { status: 404 });
    await applyMigrations();
    return Response.json({ status: "migrated" }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
