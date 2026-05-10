import Stripe from "stripe";

/**
 * Server-only Stripe client. Requires STRIPE_SECRET_KEY.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(key);
}
