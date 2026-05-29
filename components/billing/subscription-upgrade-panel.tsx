"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import {
  getDowngradeOptions,
  getUpgradeOptions,
  type BillingInterval,
  type StripeCheckoutPrices,
} from "@/lib/stripe/checkout-config";
import {
  openStripeBillingPortal,
  startStripeCheckout,
} from "@/lib/stripe/checkout-client";

export function SubscriptionUpgradePanel({
  currentTier,
  checkoutPrices,
}: {
  currentTier: string;
  checkoutPrices: StripeCheckoutPrices;
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrades = getUpgradeOptions(currentTier, interval, checkoutPrices);
  const downgrades = getDowngradeOptions(currentTier);
  const isLifetime = currentTier === "lifetime_byok";

  async function handleUpgrade(priceId: string, planType: "monthly" | "annual" | "lifetime") {
    setError(null);
    setLoadingId(priceId);
    try {
      await startStripeCheckout(priceId, planType, {
        loginNext: "/settings?tab=subscription",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setLoadingId(null);
    }
  }

  async function handlePortal() {
    setError(null);
    setPortalLoading(true);
    try {
      await openStripeBillingPortal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  if (isLifetime) {
    return (
      <p className="text-sm text-muted-foreground">
        You have lifetime access. No plan changes needed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {upgrades.length > 0 && (
        <div className="space-y-3">
          <BillingIntervalToggle value={interval} onChange={setInterval} />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {upgrades.map((opt) => (
              <Button
                key={`${opt.targetTier}-${opt.planType}`}
                type="button"
                variant={
                  opt.targetTier === "lifetime_byok" ? "default" : "outline"
                }
                disabled={loadingId !== null || portalLoading || !opt.priceId}
                onClick={() =>
                  void handleUpgrade(opt.priceId, opt.planType)
                }
              >
                {loadingId === opt.priceId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Redirecting…
                  </>
                ) : (
                  opt.label
                )}
              </Button>
            ))}
          </div>
        </div>
      )}

      {downgrades.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Downgrades and cancellations are handled in Stripe.
          </p>
          {downgrades.map((d) => (
            <div key={d.label} className="space-y-1">
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                disabled={portalLoading || loadingId !== null}
                onClick={() => void handlePortal()}
              >
                {portalLoading ? "Opening…" : d.label}
              </Button>
              <p className="text-[11px] text-muted-foreground pl-1">
                {d.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {(currentTier === "pro" || currentTier === "power") && (
        <Button
          type="button"
          variant="outline"
          disabled={portalLoading || loadingId !== null}
          onClick={() => void handlePortal()}
        >
          {portalLoading ? "Opening…" : "Manage billing"}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
