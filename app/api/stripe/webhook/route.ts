import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, priceIdToTier } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const LOG = "[stripe webhook]";

function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const periodEndUnix = (
    sub as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  return periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;
}

function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  const priceRef = sub.items.data[0]?.price;
  return typeof priceRef === "string" ? priceRef : priceRef?.id ?? null;
}

function isKnownTier(tier: string | null | undefined): tier is string {
  return tier === "pro" || tier === "power" || tier === "lifetime_byok";
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  stripe: Stripe
) {
  console.log(`${LOG} checkout.session.completed received`, {
    sessionId: session.id,
    mode: session.mode,
    metadata: session.metadata ?? {},
  });

  const userId =
    session.metadata?.supabase_user_id ?? session.client_reference_id;
  if (!userId) {
    console.error(`${LOG} checkout.session.completed missing user id`, {
      metadata: session.metadata ?? {},
      clientReferenceId: session.client_reference_id,
    });
    return;
  }
  console.log(`${LOG} user id resolved`, { userId });

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const sb = createServiceClient();

  if (session.mode === "payment") {
    console.log(`${LOG} lifetime payment checkout`, { userId, customerId });
    const { data, error } = await sb
      .from("profiles")
      .update({
        tier: "lifetime_byok",
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        subscription_status: "active",
        current_period_end: null,
      })
      .eq("id", userId)
      .select("id");

    if (error) {
      console.error(`${LOG} lifetime checkout update failed`, { userId, error });
      throw error;
    }
    console.log(`${LOG} lifetime checkout update success`, {
      userId,
      affectedRows: data?.length ?? 0,
    });
    return;
  }

  if (session.mode === "subscription") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    console.log(`${LOG} subscription checkout`, {
      userId,
      customerId,
      subscriptionId,
      metadataTier: session.metadata?.tier ?? null,
    });

    let tier: string | null = session.metadata?.tier?.trim() ?? null;
    if (tier && !isKnownTier(tier)) {
      console.warn(`${LOG} metadata tier invalid, falling back to price lookup`, {
        metadataTier: tier,
      });
      tier = null;
    }

    let periodEnd: string | null = null;
    let subscriptionStatus = "active";

    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        subscriptionStatus = sub.status === "trialing" ? "trialing" : sub.status;
        periodEnd = subscriptionPeriodEnd(sub);

        if (!tier) {
          const priceId = subscriptionPriceId(sub);
          console.log(`${LOG} resolving tier from subscription price`, {
            subscriptionId,
            priceId,
          });
          tier = priceId ? priceIdToTier(priceId) : null;
          if (!tier) {
            console.error(`${LOG} could not resolve tier from price id`, {
              priceId,
            });
          }
        }
      } catch (e) {
        console.error(`${LOG} failed to retrieve subscription for tier`, {
          subscriptionId,
          error: e instanceof Error ? e.message : e,
        });
      }
    } else if (!tier) {
      console.error(`${LOG} no subscription id and no metadata tier`, {
        userId,
      });
    }

    if (!tier) {
      console.error(`${LOG} tier unresolved for subscription checkout`, {
        userId,
        subscriptionId,
        metadata: session.metadata ?? {},
      });
      return;
    }

    console.log(`${LOG} tier resolved`, { userId, tier, subscriptionStatus });

    const { data, error } = await sb
      .from("profiles")
      .update({
        tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: subscriptionStatus,
        current_period_end: periodEnd,
      })
      .eq("id", userId)
      .select("id");

    if (error) {
      console.error(`${LOG} subscription checkout update failed`, {
        userId,
        tier,
        error,
      });
      throw error;
    }

    console.log(`${LOG} subscription checkout update success`, {
      userId,
      tier,
      affectedRows: data?.length ?? 0,
    });
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  console.log(`${LOG} customer.subscription.updated received`, {
    subscriptionId: sub.id,
    status: sub.status,
  });

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) {
    console.error(`${LOG} subscription.updated missing customer id`);
    return;
  }

  const sb = createServiceClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`${LOG} no profile for customer`, { customerId });
    return;
  }

  const priceId = subscriptionPriceId(sub);
  console.log(`${LOG} subscription.updated metadata extracted`, {
    customerId,
    profileId: (profile as { id: string }).id,
    priceId,
  });

  if (!priceId) {
    console.error(`${LOG} subscription.updated missing items.data[0].price id`);
    return;
  }

  const tier = priceIdToTier(priceId);
  if (!tier) {
    console.error(`${LOG} subscription.updated unknown price id`, { priceId });
    return;
  }

  console.log(`${LOG} tier resolved`, { tier, priceId });

  const periodEnd = subscriptionPeriodEnd(sub);
  const subscriptionStatus =
    sub.status === "trialing" ? "trialing" : sub.status;

  const { data, error } = await sb
    .from("profiles")
    .update({
      tier,
      stripe_subscription_id: sub.id,
      subscription_status: subscriptionStatus,
      current_period_end: periodEnd,
    })
    .eq("id", (profile as { id: string }).id)
    .select("id");

  if (error) {
    console.error(`${LOG} subscription update failed`, { error });
    throw error;
  }

  console.log(`${LOG} subscription update success`, {
    profileId: (profile as { id: string }).id,
    tier,
    affectedRows: data?.length ?? 0,
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  console.log(`${LOG} customer.subscription.deleted received`, {
    subscriptionId: sub.id,
  });

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) {
    console.error(`${LOG} subscription.deleted missing customer id`);
    return;
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("profiles")
    .update({
      tier: "free",
      subscription_status: "canceled",
      stripe_subscription_id: null,
      current_period_end: null,
    })
    .eq("stripe_customer_id", customerId)
    .neq("tier", "lifetime_byok")
    .select("id");

  if (error) {
    console.error(`${LOG} subscription deleted failed`, { error });
    throw error;
  }

  console.log(`${LOG} subscription deleted update success`, {
    customerId,
    affectedRows: data?.length ?? 0,
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error(`${LOG} STRIPE_WEBHOOK_SECRET is not set`);
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
    console.error(`${LOG} verify failed`, msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  console.log(`${LOG} event received`, { type: event.type, id: event.id });

  try {
    const stripe = getStripe();
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, stripe);
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
        console.log(`${LOG} unhandled event type`, { type: event.type });
        break;
    }
  } catch (e) {
    console.error(`${LOG} handler error`, e);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
