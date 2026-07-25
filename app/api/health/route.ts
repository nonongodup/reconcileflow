import { assertSchemaCompatible, verifyDatabaseConnection } from "../../../db";
import { apiError } from "../server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertSchemaCompatible();
    const database = await verifyDatabaseConnection();
    return Response.json({ status: "ok", database: database.connected ? "connected" : "unavailable" }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
