"use client";

import type { CheckoutPlanType } from "@/lib/stripe/checkout-config";

export type CheckoutApiResult = {
  error?: string;
  url?: string;
  portal?: boolean;
};

function assertCheckoutUrl(url: string): void {
  if (
    url.includes("billing.stripe.com") ||
    url.includes("/billing_portal") ||
    url.includes("customer_portal")
  ) {
    throw new Error(
      "Expected Stripe Checkout, but received a billing portal URL. Use Manage billing for downgrades."
    );
  }
}

/**
 * Start Stripe Checkout — never opens the billing portal.
 * Upgrades must land on checkout.stripe.com.
 */
export async function startStripeCheckout(
  priceId: string,
  planType: CheckoutPlanType,
  options?: { loginNext?: string; intent?: "upgrade" | "new" }
): Promise<CheckoutApiResult> {
  const res = await fetch("/api/stripe/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      planType,
      intent: options?.intent ?? "new",
    }),
  });

  if (res.status === 401) {
    const next = options?.loginNext ?? "/pricing";
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    return { error: "Sign in required." };
  }

  const data = (await res.json().catch(() => ({}))) as CheckoutApiResult;

  if (!res.ok) {
    throw new Error(data.error ?? "Could not start checkout.");
  }

  if (data.portal) {
    throw new Error(
      "Server returned billing portal instead of checkout. Use Manage billing only for downgrades."
    );
  }

  if (!data.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  assertCheckoutUrl(data.url);
  window.location.href = data.url;

  return data;
}

export async function openStripeBillingPortal(): Promise<void> {
  const res = await fetch("/api/stripe/portal");
  const data = (await res.json().catch(() => ({}))) as CheckoutApiResult;
  if (!res.ok) {
    throw new Error(data.error ?? "Could not open billing portal.");
  }
  if (data.url) {
    window.location.href = data.url;
  }
}
