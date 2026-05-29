import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

const LOG = "[webhook]";

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  const tier = session.metadata?.tier;

  console.log(`${LOG} checkout.session.completed`, {
    sessionId: session.id,
    userId,
    tier,
    mode: session.mode,
  });

  if (!userId || !tier) {
    console.log(`${LOG} missing metadata — skipping profile update`);
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

  let subscriptionStatus = "active";
  if (subscriptionId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    subscriptionStatus = sub.status;
    console.log(`${LOG} subscription status=${subscriptionStatus}`);
  }

  const sc = createServiceClient();
  const { data, error, count } = await sc
    .from("profiles")
    .update({
      tier,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
    })
    .eq("id", userId)
    .select("id");

  console.log(`${LOG} profile updated rows=${count ?? data?.length ?? 0}`, {
    userId,
    tier,
    customerId,
    subscriptionId,
    error: error?.message,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  console.log(`${LOG} customer.subscription.deleted`, {
    subscriptionId: subscription.id,
    customerId,
  });

  if (!customerId) {
    console.log(`${LOG} no customer id — skipping`);
    return;
  }

  const sc = createServiceClient();
  const { data, error, count } = await sc
    .from("profiles")
    .update({
      tier: "free",
      stripe_subscription_id: null,
      subscription_status: "canceled",
    })
    .eq("stripe_customer_id", customerId)
    .select("id");

  console.log(`${LOG} tier reset to free rows=${count ?? data?.length ?? 0}`, {
    customerId,
    error: error?.message,
  });
}

export async function POST(request: Request) {
  console.log(`${LOG} POST received`);

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.log(`${LOG} STRIPE_WEBHOOK_SECRET missing`);
    return NextResponse.json({ received: true });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.log(`${LOG} missing stripe-signature header`);
    return NextResponse.json({ received: true });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    console.log(`${LOG} event verified type=${event.type} id=${event.id}`);
  } catch (e) {
    console.log(`${LOG} signature verification failed`, e);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;
      default:
        console.log(`${LOG} ignored event type=${event.type}`);
    }
  } catch (e) {
    console.log(`${LOG} handler error (returning 200 anyway)`, e);
  }

  return NextResponse.json({ received: true });
}
