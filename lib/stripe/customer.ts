import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/client";

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const sc = createServiceClient();
  const { data: profile } = await sc
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const existing = (profile as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;

  if (existing) {
    console.log("[customer] reusing profile stripe_customer_id", {
      userId,
      customerId: existing,
    });
    return existing;
  }

  const stripe = getStripe();

  if (email) {
    const byEmail = await stripe.customers.list({ email, limit: 1 });
    const matched = byEmail.data[0];
    if (matched) {
      console.log("[customer] linking existing Stripe customer by email", {
        userId,
        customerId: matched.id,
      });
      await sc
        .from("profiles")
        .update({ stripe_customer_id: matched.id })
        .eq("id", userId);
      return matched.id;
    }
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { supabase_user_id: userId },
  });

  console.log("[customer] created new Stripe customer", {
    userId,
    customerId: customer.id,
  });

  await sc
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
