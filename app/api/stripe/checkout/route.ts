import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { getStripe } from "@/lib/stripe/client";
import {
  isLifetimePriceId,
  priceIdToTier,
  TIER_RANK,
} from "@/lib/stripe/prices";

export const runtime = "nodejs";

const LOG = "[checkout]";

const bodySchema = z.object({
  priceId: z.string().min(1),
});

function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!raw) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }
  return raw;
}

function subscriptionPriceId(
  sub: import("stripe").Stripe.Subscription
): string | null {
  const priceRef = sub.items.data[0]?.price;
  return typeof priceRef === "string" ? priceRef : (priceRef?.id ?? null);
}

export async function POST(request: Request) {
  console.log(`${LOG} POST received`);

  let json: unknown;
  try {
    json = await request.json();
  } catch (e) {
    console.log(`${LOG} invalid JSON body`, e);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    console.log(`${LOG} body validation failed`, parsed.error.flatten());
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { priceId } = parsed.data;
  console.log(`${LOG} priceId=${priceId}`);

  const tier = priceIdToTier(priceId);
  if (!tier) {
    console.log(`${LOG} unknown priceId`);
    return NextResponse.json({ error: "Unknown price id." }, { status: 400 });
  }
  console.log(`${LOG} resolved tier=${tier}`);

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

  const baseUrl = getAppBaseUrl();
  const stripe = getStripe();
  const isLifetime = isLifetimePriceId(priceId);

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(user.id, user.email ?? "");
    console.log(`${LOG} customerId=${customerId}`);
  } catch (e) {
    console.log(`${LOG} customer lookup failed`, e);
    return NextResponse.json(
      { error: "Failed to resolve Stripe customer." },
      { status: 500 }
    );
  }

  async function createPortalUrl(): Promise<string> {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/settings?tab=subscription`,
    });
    if (!portalSession.url) {
      throw new Error("Stripe did not return a portal URL.");
    }
    return portalSession.url;
  }

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
  const existingSubs = [...activeSubs.data, ...trialingSubs.data];
  console.log(`${LOG} existing subscriptions count=${existingSubs.length}`);

  if (isLifetime && existingSubs.length > 0) {
    for (const sub of existingSubs) {
      console.log(`${LOG} canceling subscription before lifetime checkout`, {
        subscriptionId: sub.id,
      });
      await stripe.subscriptions.cancel(sub.id);
    }
  } else if (!isLifetime && existingSubs.length > 0) {
    for (const sub of existingSubs) {
      const existingPriceId = subscriptionPriceId(sub);
      const existingTier = existingPriceId
        ? priceIdToTier(existingPriceId)
        : null;

      console.log(`${LOG} checking subscription`, {
        subscriptionId: sub.id,
        existingTier,
        requestedTier: tier,
      });

      if (existingTier === tier) {
        console.log(`${LOG} already subscribed to same tier`);
        const portalUrl = await createPortalUrl();
        return NextResponse.json({
          error: "Already subscribed",
          portalUrl,
        });
      }

      if (
        existingTier &&
        TIER_RANK[tier] > TIER_RANK[existingTier]
      ) {
        console.log(`${LOG} upgrade — canceling old subscription`, {
          from: existingTier,
          to: tier,
        });
        await stripe.subscriptions.cancel(sub.id);
      } else if (
        existingTier &&
        TIER_RANK[tier] < TIER_RANK[existingTier]
      ) {
        console.log(`${LOG} downgrade blocked — use portal`, {
          from: existingTier,
          to: tier,
        });
        const portalUrl = await createPortalUrl();
        return NextResponse.json({
          error: "Use portal to downgrade",
          portalUrl,
        });
      }
    }
  }

  const sc = createServiceClient();
  const { data: profile } = await sc
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();
  const currentTier =
    (profile as { tier?: string } | null)?.tier ?? "free";
  const isFree = currentTier === "free";
  console.log(`${LOG} currentTier=${currentTier} isFree=${isFree}`);

  const sessionParams: import("stripe").Stripe.Checkout.SessionCreateParams = {
    mode: isLifetime ? "payment" : "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: {
      supabase_user_id: user.id,
      tier,
      price_id: priceId,
    },
    success_url: `${baseUrl}/settings?tab=subscription&success=1`,
    cancel_url: `${baseUrl}/pricing`,
  };

  if (!isLifetime) {
    sessionParams.subscription_data = {
      metadata: {
        supabase_user_id: user.id,
        tier,
        price_id: priceId,
      },
      ...(isFree ? { trial_period_days: 7 } : {}),
    };
  }

  console.log(`${LOG} creating checkout session mode=${sessionParams.mode}`);
  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      console.log(`${LOG} session.url is null sessionId=${session.id}`);
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    console.log(`${LOG} checkout session created sessionId=${session.id}`);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.log(`${LOG} checkout session creation failed`, e);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
