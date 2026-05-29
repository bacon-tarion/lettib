import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/client";
import { priceIdToTier } from "@/lib/stripe/prices";

export const runtime = "nodejs";

const LOG = "[sync]";

function subscriptionPriceId(
  sub: import("stripe").Stripe.Subscription
): string | null {
  const priceRef = sub.items.data[0]?.price;
  return typeof priceRef === "string" ? priceRef : (priceRef?.id ?? null);
}

export async function POST() {
  console.log(`${LOG} POST received`);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log(`${LOG} unauthorized`, authError?.message);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log(`${LOG} userId=${user.id}`);

  const sc = createServiceClient();
  const { data: profile } = await sc
    .from("profiles")
    .select("stripe_customer_id, tier")
    .eq("id", user.id)
    .maybeSingle();

  const row = profile as {
    stripe_customer_id: string | null;
    tier: string;
  } | null;

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    console.log(`${LOG} no stripe_customer_id — returning free`);
    return NextResponse.json({ tier: "free" });
  }
  console.log(`${LOG} customerId=${customerId}`);

  const stripe = getStripe();
  const [activeSubs, trialingSubs] = await Promise.all([
    stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    }),
    stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 10,
    }),
  ]);

  const subs = [...activeSubs.data, ...trialingSubs.data];
  console.log(`${LOG} active/trialing subscriptions count=${subs.length}`);

  let tier = row?.tier ?? "free";
  let subscriptionId: string | null = null;
  let subscriptionStatus = "active";

  if (subs.length > 0) {
    const sub = subs[0];
    subscriptionId = sub.id;
    subscriptionStatus = sub.status;
    const priceId = subscriptionPriceId(sub);
    const resolved = priceId ? priceIdToTier(priceId) : null;
    if (resolved) {
      tier = resolved;
    }
    console.log(`${LOG} resolved tier from subscription`, {
      subscriptionId,
      priceId,
      tier,
      status: subscriptionStatus,
    });
  } else if (tier !== "lifetime_byok") {
    tier = "free";
    subscriptionId = null;
    subscriptionStatus = "active";
    console.log(`${LOG} no active subscription — tier set to free`);
  } else {
    console.log(`${LOG} lifetime_byok preserved (no active subscription)`);
  }

  const { data, error, count } = await sc
    .from("profiles")
    .update({
      tier,
      stripe_subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
    })
    .eq("id", user.id)
    .select("tier");

  console.log(`${LOG} profile updated rows=${count ?? data?.length ?? 0}`, {
    tier,
    error: error?.message,
  });

  return NextResponse.json({ tier });
}
