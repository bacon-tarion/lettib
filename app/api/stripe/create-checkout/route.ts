import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer, getStripe, priceIdToTier } from "@/lib/stripe";

export const runtime = "nodejs";

const LOG = "[stripe/create-checkout]";

const bodySchema = z.object({
  priceId: z.string().min(1),
  planType: z.enum(["monthly", "annual", "lifetime"]),
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

  const { priceId, planType } = parsed.data;
  console.error(`${LOG} request`, { priceId, planType });

  try {
    const tier = priceIdToTier(priceId);
    if (!tier) {
      console.error(`${LOG} step failed: priceIdToTier`, { priceId });
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
    console.error(`${LOG} auth ok`, { userId: user.id });
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
    console.error(`${LOG} stripe client ok`);
  } catch (e) {
    logStepError("get_stripe_client", e);
    const message = e instanceof Error ? e.message : "Stripe is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const tier = priceIdToTier(priceId)!;

  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(user.id, user.email ?? "");
    console.error(`${LOG} customer ok`, { customerId });
  } catch (e) {
    logStepError("customer_lookup_or_create", e);
    const message =
      e instanceof Error ? e.message : "Failed to resolve Stripe customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const isLifetime = planType === "lifetime";

  if (!isLifetime) {
    try {
      const [trialing, active] = await Promise.all([
        stripe.subscriptions.list({
          customer: customerId,
          status: "trialing",
          limit: 1,
        }),
        stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        }),
      ]);
      console.error(`${LOG} subscription list ok`, {
        trialing: trialing.data.length,
        active: active.data.length,
      });
      if (trialing.data.length > 0 || active.data.length > 0) {
        return NextResponse.json({ portal: true });
      }
    } catch (e) {
      logStepError("subscription_list", e);
      const message =
        e instanceof Error ? e.message : "Failed to check existing subscriptions.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
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
        : {
            subscription_data: {
              trial_period_days: 7,
              metadata: {
                supabase_user_id: user.id,
                tier,
              },
            },
          }),
      success_url: `${baseUrl}/settings/subscription?success=1`,
      cancel_url: `${baseUrl}/pricing`,
    });

    if (!session.url) {
      console.error(`${LOG} step failed: checkout_session_create`, {
        reason: "no_session_url",
        sessionId: session.id,
      });
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    console.error(`${LOG} checkout session ok`, { sessionId: session.id });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    logStepError("checkout_session_create", e);
    const message =
      e instanceof Error ? e.message : "Failed to create checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
