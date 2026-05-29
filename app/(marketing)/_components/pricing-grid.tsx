"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { PRICING_PLANS, PRICING_USD, tierRank } from "@/lib/pricing";
import {
  ANNUAL_BILLING,
  planTypeForPriceId,
  priceIdForTarget,
  type BillingInterval,
  type StripeCheckoutPrices,
} from "@/lib/stripe/checkout-config";
import {
  openStripeBillingPortal,
  startStripeCheckout,
} from "@/lib/stripe/checkout-client";
import { cn } from "@/lib/utils";

type PlanKey = "free" | "pro" | "power" | "lifetime_byok";

const PLAN_TIER: Record<string, PlanKey> = {
  Free: "free",
  Pro: "pro",
  Power: "power",
  "Lifetime BYOK": "lifetime_byok",
};

function displayForPlan(
  planTier: PlanKey,
  interval: BillingInterval
): { price: string; cadence: string; savings?: string } {
  if (planTier === "free") {
    return { price: `$${PRICING_USD.free}`, cadence: "/forever" };
  }
  if (planTier === "lifetime_byok") {
    return {
      price: `$${PRICING_USD.lifetimeByok}`,
      cadence: "one-time",
    };
  }
  if (planTier === "pro") {
    if (interval === "annual") {
      return {
        price: `$${ANNUAL_BILLING.pro.yearly}`,
        cadence: "/year",
        savings: `Save $${ANNUAL_BILLING.pro.savings} (~${ANNUAL_BILLING.pro.percent}%) vs monthly`,
      };
    }
    return { price: `$${PRICING_USD.proMonthly}`, cadence: "/month" };
  }
  if (interval === "annual") {
    return {
      price: `$${ANNUAL_BILLING.power.yearly}`,
      cadence: "/year",
      savings: `Save $${ANNUAL_BILLING.power.savings} (~${ANNUAL_BILLING.power.percent}%) vs monthly`,
    };
  }
  return { price: `$${PRICING_USD.powerMonthly}`, cadence: "/month" };
}

export function PricingGrid({
  currentTier,
  checkoutPrices,
}: {
  currentTier?: string;
  checkoutPrices: StripeCheckoutPrices;
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePaidCta(
    planTier: PlanKey,
    action: "checkout" | "portal" | "signup"
  ) {
    if (action === "signup") return;
    setError(null);
    setLoadingKey(planTier);
    try {
      if (action === "portal") {
        await openStripeBillingPortal();
        return;
      }
      const target =
        planTier === "pro"
          ? "pro"
          : planTier === "power"
            ? "power"
            : "lifetime_byok";
      const priceId =
        planTier === "lifetime_byok"
          ? checkoutPrices.lifetime
          : priceIdForTarget(target, interval, checkoutPrices);
      const planType = planTypeForPriceId(priceId, checkoutPrices);
      await startStripeCheckout(priceId, planType, { loginNext: "/pricing" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <BillingIntervalToggle value={interval} onChange={setInterval} />

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map((p) => {
          const planTier = PLAN_TIER[p.name] ?? "free";
          const isLifetime = planTier === "lifetime_byok";
          const isCurrent =
            currentTier != null && tierRank(currentTier) === tierRank(planTier);
          const current = tierRank(currentTier ?? "free");
          const target = tierRank(planTier);
          const isDowngrade = currentTier != null && current > target;
          const isUpgrade = currentTier != null && current < target;
          const display = displayForPlan(planTier, interval);

          let buttonLabel = p.cta;
          let action: "checkout" | "portal" | "signup" = "checkout";
          let disabled = false;

          if (planTier === "free") {
            buttonLabel = currentTier ? "Downgrade via billing" : "Get started free";
            action = currentTier ? "portal" : "signup";
            disabled = !!currentTier && current === 0;
            if (isCurrent) {
              buttonLabel = "Current plan";
              disabled = true;
            }
          } else if (isCurrent) {
            buttonLabel = "Current plan";
            disabled = true;
          } else if (isDowngrade) {
            buttonLabel = "Downgrade";
            action = "portal";
          } else if (isUpgrade || !currentTier) {
            if (planTier === "pro") {
              buttonLabel = currentTier ? "Upgrade to Pro" : "Start 7-day free trial";
            } else if (planTier === "power") {
              buttonLabel = currentTier ? "Upgrade to Power" : "Start 7-day free trial";
            } else {
              buttonLabel = currentTier
                ? "Upgrade to Lifetime"
                : "Get lifetime access — $79";
            }
            action = "checkout";
          }

          const priceId =
            planTier === "pro"
              ? interval === "annual"
                ? checkoutPrices.proAnnual
                : checkoutPrices.proMonthly
              : planTier === "power"
                ? interval === "annual"
                  ? checkoutPrices.powerAnnual
                  : checkoutPrices.powerMonthly
                : planTier === "lifetime_byok"
                  ? checkoutPrices.lifetime
                  : null;

          return (
            <Card
              key={p.name}
              className={cn(
                "border-border bg-card text-card-foreground transition-colors hover:border-primary/40",
                isLifetime &&
                  "border-amber-500/60 shadow-md ring-1 ring-amber-500/30 bg-elevated",
                isCurrent && "ring-2 ring-primary border-primary",
                !isLifetime &&
                  p.highlight &&
                  !isCurrent &&
                  "border-primary shadow-md relative"
              )}
            >
              {isLifetime && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="rounded-full bg-amber-500/90 text-amber-950 hover:bg-amber-500/90">
                    Best value
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-3">
                  <Badge variant="secondary" className="rounded-full">
                    Current plan
                  </Badge>
                </div>
              )}
              {p.highlight && !isLifetime && !isCurrent && (
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
                  <p className="text-sm text-muted-foreground">{p.blurb}</p>
                </div>

                {action === "signup" ? (
                  <Button
                    asChild
                    className="w-full"
                    variant="outline"
                    disabled={disabled}
                  >
                    <Link href={disabled ? "#" : "/signup"}>{buttonLabel}</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className={cn(
                      "w-full",
                      isDowngrade && "opacity-80"
                    )}
                    variant={
                      isLifetime
                        ? "default"
                        : p.highlight && !isDowngrade
                          ? "default"
                          : "outline"
                    }
                    disabled={
                      disabled || loadingKey !== null || (!priceId && action === "checkout")
                    }
                    onClick={() => void handlePaidCta(planTier, action)}
                  >
                    {loadingKey === planTier ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Redirecting…
                      </>
                    ) : (
                      buttonLabel
                    )}
                  </Button>
                )}

                <ul className="space-y-2 pt-2">
                  {p.features.map((f) => (
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
