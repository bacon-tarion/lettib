import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { tierRank } from "@/lib/pricing";
import {
  getServerStripeCheckoutPrices,
  planTypeForPriceId,
  tierForPriceId,
} from "@/lib/stripe/checkout-config";
import { getOrCreateStripeCustomer, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const LOG = "[stripe/create-checkout]";

const bodySchema = z.object({
  priceId: z.string().min(1),
  planType: z.enum(["monthly", "annual", "lifetime"]),
  intent: z.enum(["upgrade", "new"]).optional().default("new"),
});

function logStepError(step: string, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  const stack = e instanceof Error ? e.stack : undefined;
  console.error(`${LOG} step failed: ${step}`, { message, stack, error: e });
}

function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!raw) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }
  return raw;
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch (e) {
    logStepError("parse_json_body", e);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    console.error(`${LOG} step failed: validate_body`, parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { priceId, planType: planTypeBody, intent } = parsed.data;
  const prices = getServerStripeCheckoutPrices();
  const planType = planTypeForPriceId(priceId, prices);
  if (planTypeBody !== planType) {
    return NextResponse.json(
      { error: "planType does not match priceId." },
      { status: 400 }
    );
  }

  try {
    const tier = tierForPriceId(priceId, prices);
    if (!tier) {
      console.error(`${LOG} step failed: tierForPriceId`, { priceId });
      return NextResponse.json({ error: "Unknown price id." }, { status: 400 });
    }
    if (planType === "lifetime" && tier !== "lifetime_byok") {
      return NextResponse.json(
        { error: "Lifetime checkout requires the lifetime price." },
        { status: 400 }
      );
    }
    if (planType !== "lifetime" && tier === "lifetime_byok") {
      return NextResponse.json(
        { error: "Lifetime price cannot be used for a subscription." },
        { status: 400 }
      );
    }
  } catch (e) {
    logStepError("validate_price_tier", e);
    return NextResponse.json({ error: "Price validation failed." }, { status: 500 });
  }

  let user: { id: string; email?: string | null };
  try {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error(`${LOG} step failed: auth_getUser`, {
        message: authError.message,
        status: authError.status,
      });
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }
    if (!data.user) {
      console.error(`${LOG} step failed: auth_check`, { reason: "no_user" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
  } catch (e) {
    logStepError("auth_check", e);
    const message = e instanceof Error ? e.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (e) {
    logStepError("get_app_base_url", e);
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch (e) {
    logStepError("get_stripe_client", e);
    const message = e instanceof Error ? e.message : "Stripe is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tier = tierForPriceId(priceId, prices)!;
  const isLifetime = planType === "lifetime";

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(user.id, user.email ?? "");
  } catch (e) {
    logStepError("customer_lookup_or_create", e);
    const message =
      e instanceof Error ? e.message : "Failed to resolve Stripe customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let skipTrial = intent === "upgrade";
  try {
    const sc = createServiceClient();
    const { data: profile } = await sc
      .from("profiles")
      .select("tier, stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();
    const row = profile as {
      tier?: string;
      stripe_subscription_id?: string | null;
    } | null;
    const currentTier = row?.tier ?? "free";
    skipTrial =
      intent === "upgrade" ||
      !!row?.stripe_subscription_id ||
      tierRank(tier) > tierRank(currentTier) ||
      tierRank(currentTier) > tierRank("free");
  } catch (e) {
    logStepError("profile_tier_lookup", e);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        plan_type: planType,
        tier,
      },
      ...(isLifetime
        ? {}
        : skipTrial
          ? {
              subscription_data: {
                metadata: {
                  supabase_user_id: user.id,
                  tier,
                },
              },
            }
          : {
              subscription_data: {
                trial_period_days: 7,
                metadata: {
                  supabase_user_id: user.id,
                  tier,
                },
              },
            }),
      success_url: `${baseUrl}/settings?tab=subscription&success=1`,
      cancel_url: `${baseUrl}/pricing`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    logStepError("checkout_session_create", e);
    const message =
      e instanceof Error ? e.message : "Failed to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
