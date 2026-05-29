import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

const LOG = "[portal]";

function getAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!raw) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }
  return raw;
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
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = (profile as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;

  if (!customerId) {
    console.log(`${LOG} no stripe_customer_id on profile`);
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a paid plan first." },
      { status: 400 }
    );
  }
  console.log(`${LOG} customerId=${customerId}`);

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppBaseUrl()}/settings?tab=subscription`,
  });

  if (!session.url) {
    console.log(`${LOG} session.url is null`);
    return NextResponse.json(
      { error: "Stripe did not return a portal URL." },
      { status: 502 }
    );
  }

  console.log(`${LOG} portal session created`);
  return NextResponse.json({ url: session.url });
}
