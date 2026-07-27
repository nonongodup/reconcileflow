import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import { stripeClient } from "../stripe";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request), sql = getSql();
    const rows = await sql`SELECT stripe_customer_id FROM rf_subscriptions WHERE user_id=${user.id}`;
    const customer = rows[0]?.stripe_customer_id as string | undefined;
    if (!customer) return Response.json({ error: "No billing account found." }, { status: 404 });
    const session = await stripeClient().billingPortal.sessions.create({ customer, return_url: `${process.env.APP_URL || new URL(request.url).origin}/account` });
    return Response.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
