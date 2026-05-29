import { tierRank } from "@/lib/pricing";

export type BillingInterval = "monthly" | "annual";

export type StripeCheckoutPrices = {
  proMonthly: string;
  proAnnual: string;
  powerMonthly: string;
  powerAnnual: string;
  lifetime: string;
};

/** Annual totals and savings vs paying monthly for 12 months. */
export const ANNUAL_BILLING = {
  pro: { yearly: 144, monthlyEquivalent: 180, savings: 36, percent: 20 },
  power: { yearly: 336, monthlyEquivalent: 420, savings: 84, percent: 20 },
} as const;

export function getServerStripeCheckoutPrices(): StripeCheckoutPrices {
  return {
    proMonthly:
      process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ||
      "price_1TZQ1E421EGfXaTPadqVJdxD",
    proAnnual:
      process.env.STRIPE_PRICE_PRO_ANNUAL?.trim() ||
      "price_1TcSjX421EGfXaTPkFqKiJiw",
    powerMonthly:
      process.env.STRIPE_PRICE_POWER_MONTHLY?.trim() ||
      "price_1TZQ2H421EGfXaTPYLch9oiY",
    powerAnnual:
      process.env.STRIPE_PRICE_POWER_ANNUAL?.trim() ||
      "price_1TcSlC421EGfXaTPjrvOAofN",
    lifetime:
      process.env.STRIPE_PRICE_LIFETIME?.trim() ||
      "price_1TZQ4V421EGfXaTPEVSWsRpk",
  };
}

export type CheckoutPlanType = "monthly" | "annual" | "lifetime";

export type UpgradeTargetTier = "pro" | "power" | "lifetime_byok";

export function planTypeForPriceId(
  priceId: string,
  prices: StripeCheckoutPrices
): CheckoutPlanType {
  if (priceId === prices.lifetime) return "lifetime";
  if (priceId === prices.proAnnual || priceId === prices.powerAnnual) {
    return "annual";
  }
  return "monthly";
}

export function priceIdForTarget(
  target: UpgradeTargetTier,
  interval: BillingInterval,
  prices: StripeCheckoutPrices
): string {
  switch (target) {
    case "pro":
      return interval === "annual" ? prices.proAnnual : prices.proMonthly;
    case "power":
      return interval === "annual" ? prices.powerAnnual : prices.powerMonthly;
    case "lifetime_byok":
      return prices.lifetime;
  }
}

export function isDowngradeTarget(
  currentTier: string,
  targetTier: UpgradeTargetTier | "free"
): boolean {
  const current = tierRank(currentTier);
  const target =
    targetTier === "free" ? 0 : tierRank(targetTier);
  return target < current;
}

export type UpgradeOption = {
  targetTier: UpgradeTargetTier;
  label: string;
  priceId: string;
  planType: CheckoutPlanType;
};

/** Valid upgrade paths from current tier (excludes current tier). */
export function getUpgradeOptions(
  currentTier: string,
  interval: BillingInterval,
  prices: StripeCheckoutPrices
): UpgradeOption[] {
  const current = tierRank(currentTier);
  const options: UpgradeOption[] = [];
  const intervalLabel = interval === "annual" ? "Annual" : "Monthly";

  if (current < tierRank("pro")) {
    options.push({
      targetTier: "pro",
      label: `Upgrade to Pro (${intervalLabel})`,
      priceId: priceIdForTarget("pro", interval, prices),
      planType: interval === "annual" ? "annual" : "monthly",
    });
  }
  if (current < tierRank("power")) {
    options.push({
      targetTier: "power",
      label: `Upgrade to Power (${intervalLabel})`,
      priceId: priceIdForTarget("power", interval, prices),
      planType: interval === "annual" ? "annual" : "monthly",
    });
  }
  if (current < tierRank("lifetime_byok")) {
    options.push({
      targetTier: "lifetime_byok",
      label: "Get Lifetime BYOK — $79",
      priceId: prices.lifetime,
      planType: "lifetime",
    });
  }

  return options;
}

export type DowngradeOption = {
  label: string;
  description: string;
};

export function getDowngradeOptions(currentTier: string): DowngradeOption[] {
  if (currentTier === "power") {
    return [
      {
        label: "Downgrade to Pro or Free",
        description:
          "Change or cancel your subscription in the Stripe billing portal.",
      },
    ];
  }
  if (currentTier === "pro") {
    return [
      {
        label: "Downgrade to Free",
        description:
          "Cancel your subscription in the Stripe billing portal.",
      },
    ];
  }
  return [];
}
