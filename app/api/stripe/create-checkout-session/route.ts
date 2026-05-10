import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import {
  type PaidCheckoutPlan,
  STRIPE_PRICE_LOOKUP_KEYS,
} from "@/lib/pricing";

const bodySchema = z.object({
  plan: z.enum(["pro", "power", "lifetime_byok"]),
});

function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!raw) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }
  return raw;
}

async function resolvePriceId(
  stripe: ReturnType<typeof getStripe>,
  plan: PaidCheckoutPlan
): Promise<string> {
  const lookupKey = STRIPE_PRICE_LOOKUP_KEYS[plan];
  const { data } = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const id = data[0]?.id;
  if (!id) {
    throw new Error(
      `No active Stripe price found for lookup_key "${lookupKey}".`
    );
  }
  return id;
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
      { error: "Invalid plan.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { plan } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required to subscribe." },
      { status: 401 }
    );
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
    const priceId = await resolvePriceId(stripe, plan);
    const mode =
      plan === "lifetime_byok" ? ("payment" as const) : ("subscription" as const);

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
      success_url: `${baseUrl}/settings?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancel`,
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
    console.error("[create-checkout-session]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
