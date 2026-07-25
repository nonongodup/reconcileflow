import { assertSchemaCompatible } from "../../../../db";
import { apiError, runtimeSecret, uploadsBucket } from "../../server";
import { runExpiredCleanup } from "../../storage";

export async function POST(request: Request) {
  try {
    if (!runtimeSecret("CLEANUP_TOKEN") || request.headers.get("authorization") !== `Bearer ${runtimeSecret("CLEANUP_TOKEN")}`) return Response.json({ error: "Not found." }, { status: 404 });
    await assertSchemaCompatible();
    return Response.json(await runExpiredCleanup(uploadsBucket(), crypto.randomUUID()));
  } catch (error) { return apiError(error); }
}
