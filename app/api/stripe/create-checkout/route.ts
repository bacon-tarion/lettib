import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer, getStripe, priceIdToTier } from "@/lib/stripe";

export const runtime = "nodejs";

const bodySchema = z.object({
  priceId: z.string().min(1),
  planType: z.enum(["monthly", "annual", "lifetime"]),
});

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
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { priceId, planType } = parsed.data;
  const tier = priceIdToTier(priceId);
  if (!tier) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(
      user.id,
      user.email ?? ""
    );

    const isLifetime = planType === "lifetime";
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
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create checkout session.";
    console.error("[stripe/create-checkout]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
