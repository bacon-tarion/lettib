export const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  power: 2,
  lifetime_byok: 3,
};

export type PaidTier = "pro" | "power" | "lifetime_byok";

const CANONICAL_PRICE_IDS = {
  proMonthly: "price_1TZQ1E421EGfXaTPadqVJdxD",
  proAnnual: "price_1TcSjX421EGfXaTPkFqKiJiw",
  powerMonthly: "price_1TZQ2H421EGfXaTPYLch9oiY",
  powerAnnual: "price_1TcSlC421EGfXaTPjrvOAofN",
  lifetime: "price_1TZQ4V421EGfXaTPEVSWsRpk",
} as const;

export function getStripePriceIds() {
  return {
    proMonthly:
      process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ||
      CANONICAL_PRICE_IDS.proMonthly,
    proAnnual:
      process.env.STRIPE_PRICE_PRO_ANNUAL?.trim() ||
      CANONICAL_PRICE_IDS.proAnnual,
    powerMonthly:
      process.env.STRIPE_PRICE_POWER_MONTHLY?.trim() ||
      CANONICAL_PRICE_IDS.powerMonthly,
    powerAnnual:
      process.env.STRIPE_PRICE_POWER_ANNUAL?.trim() ||
      CANONICAL_PRICE_IDS.powerAnnual,
    lifetime:
      process.env.STRIPE_PRICE_LIFETIME?.trim() ||
      CANONICAL_PRICE_IDS.lifetime,
  };
}

const ids = getStripePriceIds();

/** Maps Stripe price IDs to subscription tier. */
export const TIER_PRICES: Record<string, PaidTier> = {
  [ids.proMonthly]: "pro",
  [ids.proAnnual]: "pro",
  [ids.powerMonthly]: "power",
  [ids.powerAnnual]: "power",
  [ids.lifetime]: "lifetime_byok",
};

export function priceIdToTier(priceId: string): PaidTier | null {
  return TIER_PRICES[priceId] ?? null;
}

export function isLifetimePriceId(priceId: string): boolean {
  return priceId === getStripePriceIds().lifetime;
}
