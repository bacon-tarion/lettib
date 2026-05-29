import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getServerStripeCheckoutPrices,
  tierForPriceId,
} from "@/lib/stripe/checkout-config";

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

/** Singleton for API routes that import `stripe` directly. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe();
    const value = client[prop as keyof Stripe];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Map Stripe Price id → profiles.tier (pro, power, lifetime_byok). Uses env + canonical fallbacks. */
export function priceIdToTier(priceId: string): string | null {
  if (!priceId) return null;
  return tierForPriceId(priceId, getServerStripeCheckoutPrices());
}

export function getConfiguredPriceId(
  planType: "monthly" | "annual" | "lifetime",
  tier: "pro" | "power"
): string | null {
  if (planType === "lifetime") {
    return process.env.STRIPE_PRICE_LIFETIME?.trim() || null;
  }
  if (planType === "monthly") {
    if (tier === "pro") return process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null;
    return process.env.STRIPE_PRICE_POWER_MONTHLY?.trim() || null;
  }
  if (tier === "pro") return process.env.STRIPE_PRICE_PRO_ANNUAL?.trim() || null;
  return process.env.STRIPE_PRICE_POWER_ANNUAL?.trim() || null;
}

/**
 * Returns existing Stripe customer id or creates one and persists on profiles.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const sb = createServiceClient();
  const { data: profile, error: readErr } = await sb
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (readErr) {
    throw new Error(`Failed to load profile: ${readErr.message}`);
  }

  const existing = (profile as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;
  if (existing) return existing;

  const stripeClient = getStripe();

  if (email) {
    const byEmail = await stripeClient.customers.list({ email, limit: 1 });
    const matched = byEmail.data[0];
    if (matched) {
      console.log("[stripe] reusing existing Stripe customer by email", {
        userId,
        customerId: matched.id,
      });
      const { error: linkErr } = await sb
        .from("profiles")
        .update({ stripe_customer_id: matched.id })
        .eq("id", userId);
      if (linkErr) {
        throw new Error(
          `Failed to link existing Stripe customer: ${linkErr.message}`
        );
      }
      return matched.id;
    }
  }

  const customer = await stripeClient.customers.create({
    email: email || undefined,
    metadata: { supabase_user_id: userId },
  });

  const { error: updateErr } = await sb
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  if (updateErr) {
    throw new Error(`Failed to save Stripe customer: ${updateErr.message}`);
  }

  return customer.id;
}
