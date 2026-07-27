import { assertSchemaCompatible } from "../../../../db";
import { apiError, runtimeSecret, uploadsBucket } from "../../server";
import { runExpiredCleanup } from "../../storage";

export async function POST(request: Request) {
  try {
    const supplied = request.headers.get("authorization");
    const expected = runtimeSecret("CLEANUP_TOKEN");
    const cronSecret = process.env.CRON_SECRET;
    if ((!expected || supplied !== `Bearer ${expected}`) && (!cronSecret || supplied !== `Bearer ${cronSecret}`)) return Response.json({ error: "Not found." }, { status: 404 });
    await assertSchemaCompatible();
    return Response.json(await runExpiredCleanup(uploadsBucket(), crypto.randomUUID()));
  } catch (error) { return apiError(error); }
}

export const GET = POST;
