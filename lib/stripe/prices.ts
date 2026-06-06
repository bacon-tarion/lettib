export const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  power: 2,
  lifetime_byok: 3,
};

export type PaidTier = "pro" | "power" | "lifetime_byok";

export const PRICES = {
  proMonthly:
    process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_1TZQ1E421EGfXaTPadqVJdxD",
  proAnnual:
    process.env.STRIPE_PRICE_PRO_ANNUAL ?? "price_1TcSjX421EGfXaTPkFqKiJiw",
  powerMonthly:
    process.env.STRIPE_PRICE_POWER_MONTHLY ?? "price_1TZQ2H421EGfXaTPYLch9oiY",
  powerAnnual:
    process.env.STRIPE_PRICE_POWER_ANNUAL ?? "price_1TcSlC421EGfXaTPjrvOAofN",
  lifetime:
    process.env.STRIPE_PRICE_LIFETIME ?? "price_1TZQ4V421EGfXaTPEVSWsRpk",
};

export function getStripePriceIds() {
  return PRICES;
}

/** Maps Stripe price IDs to subscription tier. */
export const TIER_PRICES: Record<string, PaidTier> = {
  [PRICES.proMonthly]: "pro",
  [PRICES.proAnnual]: "pro",
  [PRICES.powerMonthly]: "power",
  [PRICES.powerAnnual]: "power",
  [PRICES.lifetime]: "lifetime_byok",
};

export function priceIdToTier(priceId: string): PaidTier | null {
  return TIER_PRICES[priceId] ?? null;
}

export function isLifetimePriceId(priceId: string): boolean {
  return priceId === PRICES.lifetime;
}
