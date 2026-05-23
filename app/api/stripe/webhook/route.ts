import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function tierFromMetadata(plan: string | null | undefined): string | null {
  if (plan === "pro" || plan === "power" || plan === "lifetime_byok") {
    return plan;
  }
  return null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId =
    session.metadata?.supabase_user_id ?? session.client_reference_id;
  const tier = tierFromMetadata(session.metadata?.plan);

  if (!userId || !tier) {
    console.error(
      "[stripe webhook] checkout.session.completed missing user or plan",
      { userId: !!userId, tier }
    );
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  const sb = createServiceClient();
  const { error } = await sb
    .from("profiles")
    .update({
      subscription_tier: tier,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: tier === "lifetime_byok" ? "active" : "active",
      current_period_end:
        tier === "lifetime_byok"
          ? null
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("[stripe webhook] profiles update failed", error);
    throw error;
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("id, subscription_tier")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    console.error("[stripe webhook] no profile for customer", customerId);
    return;
  }

  const status = sub.status;
  const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number })
    .current_period_end
    ? new Date(
        (sub as Stripe.Subscription & { current_period_end: number })
          .current_period_end * 1000
      ).toISOString()
    : null;

  let tier = (profile as { subscription_tier: string }).subscription_tier;
  if (status === "active" || status === "trialing") {
    const item = sub.items.data[0];
    const lookup = item?.price?.lookup_key;
    if (lookup === "pro_monthly") tier = "pro";
    else if (lookup === "power_monthly") tier = "power";
  } else if (status === "canceled" || status === "unpaid") {
    tier = "free";
  }

  const { error } = await sb
    .from("profiles")
    .update({
      subscription_tier: tier,
      stripe_subscription_id: sub.id,
      subscription_status: status,
      current_period_end: periodEnd,
    })
    .eq("id", (profile as { id: string }).id);

  if (error) {
    console.error("[stripe webhook] subscription update failed", error);
    throw error;
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const sb = createServiceClient();
  const { error } = await sb
    .from("profiles")
    .update({
      subscription_tier: "free",
      subscription_status: "canceled",
      stripe_subscription_id: null,
      current_period_end: null,
    })
    .eq("stripe_customer_id", customerId)
    .neq("subscription_tier", "lifetime_byok");

  if (error) {
    console.error("[stripe webhook] subscription deleted failed", error);
    throw error;
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid payload";
    console.error("[stripe webhook] verify failed", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] handler error", e);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
