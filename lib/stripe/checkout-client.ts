"use client";

import type { CheckoutPlanType } from "@/lib/stripe/checkout-config";

export type CheckoutApiResult = {
  error?: string;
  url?: string;
  portal?: boolean;
};

export async function startStripeCheckout(
  priceId: string,
  planType: CheckoutPlanType,
  options?: { loginNext?: string }
): Promise<CheckoutApiResult> {
  const res = await fetch("/api/stripe/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId, planType }),
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

  if (data.url) {
    window.location.href = data.url;
  }

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
