import Stripe from "stripe";
import type { BillingInterval, PlanKey } from "../plans";

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("BILLING_CONFIGURATION");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function stripePrice(
  plan: Exclude<PlanKey, "free">,
  interval: BillingInterval
) {
  const key = `STRIPE_${plan.toUpperCase()}_${
    interval === "month" ? "MONTHLY" : "ANNUAL"
  }_PRICE_ID`;
  const price = process.env[key];
  if (!price) throw new Error("BILLING_CONFIGURATION");
  return price;
}

export function planForPrice(
  priceId: string
): { plan: Exclude<PlanKey, "free">; interval: BillingInterval } | null {
  const entries: Array<
    [Exclude<PlanKey, "free">, BillingInterval, string | undefined]
  > = [
    ["professional", "month", process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID],
    ["professional", "year", process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID],
    ["team", "month", process.env.STRIPE_TEAM_MONTHLY_PRICE_ID],
    ["team", "year", process.env.STRIPE_TEAM_ANNUAL_PRICE_ID],
  ];
  const match = entries.find((entry) => entry[2] === priceId);
  return match ? { plan: match[0], interval: match[1] } : null;
}
