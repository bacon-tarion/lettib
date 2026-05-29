"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING_USD, COMPARE_MODELS_BY_PLAN } from "@/lib/pricing";
import { getStripePriceIds } from "@/lib/stripe/prices";
import { cn } from "@/lib/utils";

const PRICES = getStripePriceIds();

type BillingInterval = "monthly" | "annual";

const ANNUAL = {
  pro: { yearly: 144, savings: 36, percent: 20 },
  power: { yearly: 336, savings: 84, percent: 20 },
} as const;

const TIERS = [
  {
    key: "free",
    name: "Free",
    features: [
      "BYOK — unlimited providers",
      `Compare up to ${COMPARE_MODELS_BY_PLAN.free} models at once`,
      "5 projects",
      "Synthesis (10 / month)",
      "7-day history",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    highlight: true,
    features: [
      "Everything in Free",
      `Compare up to ${COMPARE_MODELS_BY_PLAN.pro} models at once`,
      "Unlimited projects",
      "Unlimited Synthesis",
      "Project Memory",
      "Unlimited history & search",
    ],
  },
  {
    key: "power",
    name: "Power",
    features: [
      "Everything in Pro",
      `Compare up to ${COMPARE_MODELS_BY_PLAN.power} models at once`,
      "Custom AI Teams",
      "Shareable synthesis links",
      "Priority synthesis queue",
      "Priority support",
    ],
  },
  {
    key: "lifetime",
    name: "Lifetime BYOK",
    features: [
      "Everything in Power",
      "Single payment — no renewals",
      "BYOK — unlimited providers",
      "Best for long-term solo power users",
    ],
  },
] as const;

function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
        <button
          type="button"
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            value === "monthly"
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground"
          }`}
          onClick={() => onChange("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            value === "annual"
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground"
          }`}
          onClick={() => onChange("annual")}
        >
          Annual
        </button>
      </div>
    </div>
  );
}

export function PricingCards() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handleCheckout(priceId: string, key: string) {
    setLoadingKey(key);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        portalUrl?: string;
      };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
        return;
      }
      toast.error(data.error ?? "Checkout failed.");
    } catch {
      toast.error("Checkout failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  function priceForTier(key: string): {
    price: string;
    cadence: string;
    savings?: string;
    label?: string;
  } {
    if (key === "free") {
      return { price: `$${PRICING_USD.free}`, cadence: "/forever" };
    }
    if (key === "lifetime") {
      return {
        price: `$${PRICING_USD.lifetimeByok}`,
        cadence: "one-time",
      };
    }
    if (key === "pro") {
      if (interval === "annual") {
        return {
          price: `$${ANNUAL.pro.yearly}`,
          cadence: "/year",
          savings: `Save $${ANNUAL.pro.savings} (~${ANNUAL.pro.percent}%) vs monthly`,
          label: "Pro Annual",
        };
      }
      return {
        price: `$${PRICING_USD.proMonthly}`,
        cadence: "/month",
        label: "Pro Monthly",
      };
    }
    if (interval === "annual") {
      return {
        price: `$${ANNUAL.power.yearly}`,
        cadence: "/year",
        savings: `Save $${ANNUAL.power.savings} (~${ANNUAL.power.percent}%) vs monthly`,
        label: "Power Annual",
      };
    }
    return {
      price: `$${PRICING_USD.powerMonthly}`,
      cadence: "/month",
      label: "Power Monthly",
    };
  }

  function priceIdForTier(key: string): string | null {
    if (key === "pro") {
      return interval === "annual" ? PRICES.proAnnual : PRICES.proMonthly;
    }
    if (key === "power") {
      return interval === "annual" ? PRICES.powerAnnual : PRICES.powerMonthly;
    }
    if (key === "lifetime") return PRICES.lifetime;
    return null;
  }

  return (
    <div className="space-y-6">
      <IntervalToggle value={interval} onChange={setInterval} />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => {
          const display = priceForTier(tier.key);
          const priceId = priceIdForTier(tier.key);
          const isLifetime = tier.key === "lifetime";
          const isFree = tier.key === "free";
          const cardName =
            display.label ?? tier.name;

          return (
            <Card
              key={tier.key}
              className={cn(
                "border-border bg-card text-card-foreground transition-colors hover:border-primary/40 relative",
                isLifetime &&
                  "border-amber-500/60 shadow-md ring-1 ring-amber-500/30",
                "highlight" in tier &&
                  tier.highlight &&
                  !isLifetime &&
                  "border-primary shadow-md"
              )}
            >
              {isLifetime && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="rounded-full bg-amber-500/90 text-amber-950 hover:bg-amber-500/90">
                    Best value
                  </Badge>
                </div>
              )}
              {"highlight" in tier && tier.highlight && !isLifetime && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="secondary" className="rounded-full">
                    Most popular
                  </Badge>
                </div>
              )}
              <CardContent className="pt-6 pb-6 space-y-5">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">{cardName}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {display.price}
                    </span>
                    <span className="text-sm whitespace-nowrap text-muted-foreground">
                      {display.cadence}
                    </span>
                  </div>
                  {display.savings && (
                    <p className="text-xs font-medium text-green-600 dark:text-green-500">
                      {display.savings}
                    </p>
                  )}
                </div>

                {isFree ? (
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/signup">Start free</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    variant={
                      isLifetime || ("highlight" in tier && tier.highlight)
                        ? "default"
                        : "outline"
                    }
                    disabled={loadingKey !== null || !priceId}
                    onClick={() =>
                      priceId && void handleCheckout(priceId, tier.key)
                    }
                  >
                    {loadingKey === tier.key ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Redirecting…
                      </>
                    ) : tier.key === "lifetime" ? (
                      "Buy lifetime"
                    ) : (
                      "Start 7-day free trial"
                    )}
                  </Button>
                )}

                <ul className="space-y-2 pt-2">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-foreground/90"
                    >
                      <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
