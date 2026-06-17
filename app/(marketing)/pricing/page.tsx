import Link from "next/link";
import { PricingCards } from "./pricing-cards";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { PRICING_USD } from "@/lib/pricing";
import { getStripePriceIds } from "@/lib/stripe/prices";

export const metadata = {
  title: "Pricing",
  description:
    "Free forever with BYOK. Pro $15/mo, Power $35/mo, or Lifetime $79 one-time. Compare up to 6 AI models at once and pay providers directly — zero markup.",
};

export default function PricingPage() {
  const priceIds = getStripePriceIds();

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
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <PricingCards priceIds={priceIds} />
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
