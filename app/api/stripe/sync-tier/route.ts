import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, priceIdToTier } from "@/lib/stripe";

export const runtime = "nodejs";

const LOG = "[stripe/sync-tier]";

function subscriptionPeriodEnd(
  sub: import("stripe").Stripe.Subscription
): string | null {
  const periodEndUnix = (
    sub as import("stripe").Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  return periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sc = createServiceClient();
  const { data: profile, error: profileError } = await sc
    .from("profiles")
    .select("stripe_customer_id, tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`${LOG} profile read failed`, profileError);
    return NextResponse.json(
      { error: "Failed to load billing profile." },
      { status: 500 }
    );
  }

  const row = profile as {
    stripe_customer_id: string | null;
    tier: string;
  } | null;

  if (row?.tier === "lifetime_byok") {
    return NextResponse.json({
      tier: "lifetime_byok",
      subscription_id: null,
      period_end: null,
    });
  }

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const [active, trialing] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: "active", limit: 10 }),
    stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 10,
    }),
  ]);

  const subs = [...active.data, ...trialing.data];
  if (subs.length === 0) {
    const { error: clearError } = await sc
      .from("profiles")
      .update({
        tier: "free",
        stripe_subscription_id: null,
        subscription_status: "canceled",
        current_period_end: null,
      })
      .eq("id", user.id);

    if (clearError) {
      console.error(`${LOG} clear profile failed`, clearError);
      return NextResponse.json(
        { error: "Failed to update profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tier: "free",
      subscription_id: null,
      period_end: null,
    });
  }

  const sub = subs[0];
  const priceRef = sub.items.data[0]?.price;
  const priceId =
    typeof priceRef === "string" ? priceRef : priceRef?.id ?? null;

  if (!priceId) {
    return NextResponse.json(
      { error: "Subscription has no price id." },
      { status: 502 }
    );
  }

  const tier = priceIdToTier(priceId);
  if (!tier) {
    console.error(`${LOG} unknown price id`, { priceId });
    return NextResponse.json(
      { error: "Unknown subscription price." },
      { status: 502 }
    );
  }

  const periodEnd = subscriptionPeriodEnd(sub);
  const subscriptionStatus = sub.status === "trialing" ? "trialing" : sub.status;

  const { error: updateError } = await sc
    .from("profiles")
    .update({
      tier,
      stripe_subscription_id: sub.id,
      subscription_status: subscriptionStatus,
      current_period_end: periodEnd,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error(`${LOG} profile update failed`, updateError);
    return NextResponse.json(
      { error: "Failed to sync tier." },
      { status: 500 }
    );
  }

  console.log(`${LOG} synced tier`, {
    userId: user.id,
    tier,
    subscriptionId: sub.id,
  });

  return NextResponse.json({
    tier,
    subscription_id: sub.id,
    period_end: periodEnd,
  });
}
