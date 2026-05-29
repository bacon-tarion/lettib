import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";

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

/** Map Stripe Price id → profiles.tier (pro, power, lifetime_byok). */
export function priceIdToTier(priceId: string): string | null {
  if (!priceId) return null;
  const lifetime = process.env.STRIPE_PRICE_LIFETIME?.trim();
  const proMonthly = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  const proAnnual = process.env.STRIPE_PRICE_PRO_ANNUAL?.trim();
  const powerMonthly = process.env.STRIPE_PRICE_POWER_MONTHLY?.trim();
  const powerAnnual = process.env.STRIPE_PRICE_POWER_ANNUAL?.trim();

  if (lifetime && priceId === lifetime) return "lifetime_byok";
  if (
    (proMonthly && priceId === proMonthly) ||
    (proAnnual && priceId === proAnnual)
  ) {
    return "pro";
  }
  if (
    (powerMonthly && priceId === powerMonthly) ||
    (powerAnnual && priceId === powerAnnual)
  ) {
    return "power";
  }
  return null;
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
