"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tierDisplayName } from "@/lib/subscription/tier";

type StripePriceIds = {
  proMonthly: string;
  proAnnual: string;
  powerMonthly: string;
  powerAnnual: string;
  lifetime: string;
};

type BillingInterval = "monthly" | "annual";

async function postCheckout(priceId: string) {
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
  throw new Error(data.error ?? "Checkout failed.");
}

async function postPortal() {
  const res = await fetch("/api/stripe/portal", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (data.url) {
    window.location.href = data.url;
    return;
  }
  throw new Error(data.error ?? "Could not open billing portal.");
}

async function postSync() {
  const res = await fetch("/api/stripe/sync", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as {
    tier?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "Could not sync billing.");
  }
  return data.tier ?? "free";
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
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
  );
}

export function SubscriptionTab({
  priceIds,
  subscriptionTier = "free",
  showCheckoutSuccess = false,
}: {
  priceIds: StripePriceIds;
  subscriptionTier?: string;
  showCheckoutSuccess?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const checkoutSuccess =
    showCheckoutSuccess || searchParams.get("success") === "1";

  useEffect(() => {
    if (checkoutSuccess) {
      toast.success(`Welcome to ${tierDisplayName(subscriptionTier)}!`);
    }
  }, [checkoutSuccess, subscriptionTier]);

  async function handleCheckout(priceId: string, key: string) {
    setLoadingKey(key);
    try {
      await postCheckout(priceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed.");
      setLoadingKey(null);
    }
  }

  async function handlePortal() {
    setLoadingKey("portal");
    try {
      await postPortal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portal failed.");
      setLoadingKey(null);
    }
  }

  async function handleSync() {
    setSyncLoading(true);
    try {
      const tier = await postSync();
      toast.success(`Billing synced — plan is now ${tierDisplayName(tier)}.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncLoading(false);
    }
  }

  const tierLabel = tierDisplayName(subscriptionTier);
  const isFree = subscriptionTier === "free";
  const isPro = subscriptionTier === "pro";
  const isPower = subscriptionTier === "power";
  const isLifetime = subscriptionTier === "lifetime_byok";

  const proPriceId =
    interval === "annual" ? priceIds.proAnnual : priceIds.proMonthly;
  const powerPriceId =
    interval === "annual" ? priceIds.powerAnnual : priceIds.powerMonthly;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">
          Current plan
        </span>
        <Badge className="text-sm px-3 py-1">{tierLabel}</Badge>
      </div>

      {isLifetime && (
        <p className="text-sm text-muted-foreground">
          Lifetime — no billing actions
        </p>
      )}

      {isFree && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock more compare models, unlimited projects, and
            synthesis.
          </p>
          <IntervalToggle value={interval} onChange={setInterval} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(proPriceId, "pro")}
            >
              {loadingKey === "pro" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Upgrade to Pro ({interval})
            </Button>
            <Button
              variant="outline"
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(powerPriceId, "power")}
            >
              {loadingKey === "power" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Upgrade to Power ({interval})
            </Button>
            <Button
              variant="secondary"
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(priceIds.lifetime, "lifetime")}
            >
              {loadingKey === "lifetime" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Buy Lifetime
            </Button>
          </div>
          <Button variant="link" className="px-0" asChild>
            <Link href="/pricing">View all plans</Link>
          </Button>
        </div>
      )}

      {isPro && (
        <div className="space-y-4">
          <IntervalToggle value={interval} onChange={setInterval} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(powerPriceId, "power")}
            >
              {loadingKey === "power" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Upgrade to Power ({interval})
            </Button>
            <Button
              variant="secondary"
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(priceIds.lifetime, "lifetime")}
            >
              {loadingKey === "lifetime" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Upgrade to Lifetime
            </Button>
            <Button
              variant="outline"
              disabled={loadingKey !== null}
              onClick={() => void handlePortal()}
            >
              {loadingKey === "portal" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Manage Billing
            </Button>
          </div>
        </div>
      )}

      {isPower && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loadingKey !== null}
              onClick={() => void handleCheckout(priceIds.lifetime, "lifetime")}
            >
              {loadingKey === "lifetime" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Upgrade to Lifetime
            </Button>
            <Button
              variant="outline"
              disabled={loadingKey !== null}
              onClick={() => void handlePortal()}
            >
              {loadingKey === "portal" && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Manage Billing
            </Button>
          </div>
        </div>
      )}

      {!isLifetime && (
        <div className="pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncLoading}
            onClick={() => void handleSync()}
          >
            {syncLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Billing
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            If your plan looks wrong after checkout, sync from Stripe.
          </p>
        </div>
      )}
    </div>
  );
}
