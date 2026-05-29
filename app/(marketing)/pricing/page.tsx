import Link from "next/link";
import { PricingGrid } from "../_components/pricing-grid";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { PRICING_USD } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Pricing — LettiB",
  description: `Simple BYOK pricing for the LettiB multi-AI workspace. Free ($${PRICING_USD.free} forever), Pro ($${PRICING_USD.proMonthly}/mo), Power ($${PRICING_USD.powerMonthly}/mo), and Lifetime BYOK ($${PRICING_USD.lifetimeByok} one-time).`,
};

/** Optional: current tier for logged-in users only; never throws. */
async function getCurrentTierOptional(): Promise<string | undefined> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key) return undefined;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return undefined;

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return undefined;

    return (data as { tier: string } | null)?.tier;
  } catch (e) {
    console.error("[pricing] optional auth/tier lookup failed:", e);
    return undefined;
  }
}

export default async function PricingPage() {
  const currentTier = await getCurrentTierOptional();

  const checkoutPrices = {
    proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ?? "",
    powerMonthly: process.env.STRIPE_PRICE_POWER_MONTHLY?.trim() ?? "",
    lifetime: process.env.STRIPE_PRICE_LIFETIME?.trim() ?? "",
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground">
            Bring your own API keys. Pay only for the workspace.
          </p>
          {/* TODO(post-launch): annual billing toggle — show $144/yr Pro and $336/yr Power */}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <PricingGrid
            currentTier={currentTier}
            checkoutPrices={checkoutPrices}
          />
          <p className="mt-8 text-center text-xs text-muted-foreground">
            All plans require your own provider API keys (OpenAI, Anthropic,
            Google, xAI (Grok)). You&apos;re billed by the providers for their
            usage.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">
            Not sure yet?
          </h2>
          <p className="text-muted-foreground mb-6">
            The Free plan never expires. Try every model side by side, generate
            syntheses, and upgrade only when you outgrow it.
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
