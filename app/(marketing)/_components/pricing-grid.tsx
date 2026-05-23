"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PRICING_PLANS,
  type PaidCheckoutPlan,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

async function startCheckout(plan: PaidCheckoutPlan) {
  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });

  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
    return;
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "Could not start checkout.");
  }

  if (data.url) {
    window.location.href = data.url;
  }
}

export function PricingGrid({
  currentTier,
}: {
  dark?: boolean;
  currentTier?: string;
}) {
  const [loadingPlan, setLoadingPlan] = useState<PaidCheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map((p) => (
          <Card
            key={p.name}
            className={cn(
              "border-border bg-card text-card-foreground transition-colors hover:border-primary/40 hover:bg-elevated",
              currentTier &&
                ((p.paidCheckoutPlan === "pro" && currentTier === "pro") ||
                  (p.paidCheckoutPlan === "power" && currentTier === "power") ||
                  (p.paidCheckoutPlan === "lifetime_byok" &&
                    currentTier === "lifetime_byok"))
                ? "border-primary shadow-md relative ring-2 ring-primary"
                : p.highlight
                  ? "border-primary shadow-md relative"
                  : undefined
            )}
          >
            {p.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="secondary" className="rounded-full">
                  Most popular
                </Badge>
              </div>
            )}
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    {p.price}
                  </span>
                  <span className="text-sm whitespace-nowrap text-muted-foreground">
                    {p.cadence}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{p.blurb}</p>
              </div>
              {p.paidCheckoutPlan ? (
                <Button
                  type="button"
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                  disabled={loadingPlan !== null}
                  onClick={async () => {
                    setError(null);
                    setLoadingPlan(p.paidCheckoutPlan!);
                    try {
                      await startCheckout(p.paidCheckoutPlan!);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Checkout failed."
                      );
                    } finally {
                      setLoadingPlan(null);
                    }
                  }}
                >
                  {loadingPlan === p.paidCheckoutPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Redirecting…
                    </>
                  ) : (
                    p.cta
                  )}
                </Button>
              ) : (
                <Button
                  asChild
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                >
                  <Link href={p.href}>{p.cta}</Link>
                </Button>
              )}
              <ul className="space-y-2 pt-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
                    <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
