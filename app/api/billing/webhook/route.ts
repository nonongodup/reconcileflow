import { getSql } from "../../../../db";
import { stripeClient, planForPrice } from "../stripe";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET, signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Not found", { status: 404 });
  let event: Stripe.Event;
  try { event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  const sql = getSql();
  if (["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)) {
    const subscription = event.data.object as Stripe.Subscription;
    const price = subscription.items.data[0]?.price.id, mapped = price ? planForPrice(price) : null;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const userId = subscription.metadata.reconcileflowUserId;
    const target = userId ? await sql`SELECT id FROM rf_users WHERE id=${userId}` : await sql`SELECT user_id AS id FROM rf_subscriptions WHERE stripe_customer_id=${customerId}`;
    if (target[0]) await sql`INSERT INTO rf_subscriptions (user_id,stripe_customer_id,stripe_subscription_id,plan,billing_interval,status,current_period_start,current_period_end,cancel_at_period_end,updated_at)
      VALUES (${target[0].id},${customerId},${subscription.id},${mapped?.plan || "free"},${mapped?.interval || null},${subscription.status},${new Date(subscription.items.data[0]?.current_period_start * 1000).toISOString()},${new Date(subscription.items.data[0]?.current_period_end * 1000).toISOString()},${subscription.cancel_at_period_end},now())
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,stripe_subscription_id=EXCLUDED.stripe_subscription_id,plan=EXCLUDED.plan,billing_interval=EXCLUDED.billing_interval,status=EXCLUDED.status,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=now()`;
  }
  return Response.json({ received: true });
}
