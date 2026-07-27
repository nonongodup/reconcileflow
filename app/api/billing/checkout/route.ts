import { getSql } from "../../../../db";
import { apiError, requireApiUser } from "../../server";
import type { BillingInterval, PlanKey } from "../../plans";
import { stripeClient, stripePrice } from "../stripe";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = (await request.json()) as {
      plan?: PlanKey;
      interval?: BillingInterval;
    };
    if (
      (body.plan !== "professional" && body.plan !== "team") ||
      (body.interval !== "month" && body.interval !== "year")
    )
      return Response.json({ error: "Invalid plan." }, { status: 400 });
    const sql = getSql(),
      stripe = stripeClient();
    const rows =
      await sql`SELECT stripe_customer_id,status FROM rf_subscriptions WHERE user_id=${user.id}`;
    let customerId = rows[0]?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.display_name || undefined,
        metadata: { reconcileflowUserId: user.id },
      });
      customerId = customer.id;
      await sql`UPDATE rf_subscriptions SET stripe_customer_id=${customerId},updated_at=now() WHERE user_id=${user.id}`;
    }
    const origin = process.env.APP_URL || new URL(request.url).origin;
    if (["active", "trialing"].includes(String(rows[0]?.status))) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/account`,
      });
      return Response.json(
        { url: portal.url },
        { headers: { "cache-control": "no-store" } }
      );
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        { price: stripePrice(body.plan, body.interval), quantity: 1 },
      ],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/#pricing`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      client_reference_id: user.id,
      metadata: {
        reconcileflowUserId: user.id,
        plan: body.plan,
        interval: body.interval,
      },
      subscription_data: {
        metadata: {
          reconcileflowUserId: user.id,
          plan: body.plan,
          interval: body.interval,
        },
      },
    });
    return Response.json(
      { url: session.url },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
