import Stripe from "stripe";

let client: Stripe | null | undefined;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Returns null when STRIPE_SECRET_KEY is unset (dev without payments). */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key
    ? new Stripe(key, {
        apiVersion: "2026-08-27.dahlia" as Stripe.LatestApiVersion,
        typescript: true,
      })
    : null;
  return client;
}

export function requireStripe(): Stripe {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  return s;
}
