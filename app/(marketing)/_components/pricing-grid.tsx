"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING_PLANS, tierRank } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type PricingCheckoutPrices = {
  proMonthly: string;
  powerMonthly: string;
  lifetime: string;
};

type PlanKey = "free" | "pro" | "power" | "lifetime_byok";

const PLAN_TIER: Record<string, PlanKey> = {
  Free: "free",
  Pro: "pro",
  Power: "power",
  "Lifetime BYOK": "lifetime_byok",
};

async function startCheckout(priceId: string, planType: "monthly" | "lifetime") {
  const res = await fetch("/api/stripe/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId, planType }),
  });

  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
    return;
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    portal?: boolean;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "Could not start checkout.");
  }

  if (data.portal) {
    const portalRes = await fetch("/api/stripe/portal");
    const portalData = (await portalRes.json().catch(() => ({}))) as {
      error?: string;
      url?: string;
    };
    if (!portalRes.ok) {
      throw new Error(portalData.error ?? "Could not open billing portal.");
    }
    if (portalData.url) {
      window.location.href = portalData.url;
    }
    return;
  }

  if (data.url) {
    window.location.href = data.url;
  }
}

function ctaLabel(
  planTier: PlanKey,
  currentTier: string | undefined,
  defaultCta: string
): { label: string; disabled: boolean; variant: "current" | "downgrade" | "upgrade" | "default" } {
  if (!currentTier) {
    return { label: defaultCta, disabled: false, variant: "default" };
  }
  const current = tierRank(currentTier);
  const target = tierRank(planTier);
  if (current === target) {
    return { label: "Current plan", disabled: true, variant: "current" };
  }
  if (current > target) {
    return { label: "Downgrade", disabled: true, variant: "downgrade" };
  }
  return {
    label: planTier === "free" ? defaultCta : "Upgrade",
    disabled: false,
    variant: "upgrade",
  };
}

export function PricingGrid({
  currentTier,
  checkoutPrices,
}: {
  currentTier?: string;
  checkoutPrices: PricingCheckoutPrices;
}) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
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
          const { label, disabled, variant } = ctaLabel(
            planTier,
            currentTier,
            p.cta
          );

          const freeCta = "Get started free";
          const proCta = "Start 7-day free trial";
          const powerCta = "Start 7-day free trial";
          const lifetimeCta = "Get lifetime access — $79";

          const buttonLabel =
            planTier === "free"
              ? currentTier
                ? label
                : freeCta
              : planTier === "pro"
                ? currentTier
                  ? label
                  : proCta
                : planTier === "power"
                  ? currentTier
                    ? label
                    : powerCta
                  : currentTier
                    ? label
                    : lifetimeCta;

          const priceId =
            planTier === "pro"
              ? checkoutPrices.proMonthly
              : planTier === "power"
                ? checkoutPrices.powerMonthly
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
              {p.highlight && !isLifetime && (
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

                {planTier === "free" ? (
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
                      variant === "downgrade" && "opacity-60"
                    )}
                    variant={
                      isLifetime
                        ? "default"
                        : p.highlight
                          ? "default"
                          : "outline"
                    }
                    disabled={
                      disabled || loadingKey !== null || !priceId
                    }
                    onClick={async () => {
                      if (!priceId || disabled) return;
                      setError(null);
                      setLoadingKey(planTier);
                      try {
                        await startCheckout(
                          priceId,
                          planTier === "lifetime_byok" ? "lifetime" : "monthly"
                        );
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Checkout failed."
                        );
                      } finally {
                        setLoadingKey(null);
                      }
                    }}
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
