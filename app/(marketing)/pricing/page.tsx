import Link from "next/link";
import { PricingGrid } from "../_components/pricing-grid";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "Pricing — LettiB",
  description:
    "Simple BYOK pricing for the LettiB multi-AI workspace. Free, Pro, and Power plans.",
};

export default function PricingPage() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Simple, BYOK pricing.
          </h1>
          <p className="text-lg text-muted-foreground">
            You bring your provider keys. We bring the workspace. Pay one flat
            monthly fee — zero markup on your AI usage.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <PricingGrid />
          <p className="mt-8 text-center text-xs text-muted-foreground">
            All plans require your own provider API keys (OpenAI, Anthropic,
            Google, xAI). You're billed by the providers for their usage.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">
            Not sure yet?
          </h2>
          <p className="text-muted-foreground mb-6">
            The Free plan never expires. Try every model side by side, generate
            syntheses, and upgrade only when you outgrow it.
          </p>
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Start free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
