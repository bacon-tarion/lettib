/**
 * Canonical LettiB public pricing (marketing, settings copy, checkout deep links).
 * Amounts are in USD.
 */

export const PRICING_USD = {
  free: 0,
  proMonthly: 15,
  powerMonthly: 35,
  lifetimeByok: 79,
} as const;

/** Max models in one Compare (BYOK providers). */
export const COMPARE_MODELS_BY_PLAN = {
  free: 2,
  pro: 4,
  power: 6,
} as const;

/** Max parallel models in Compare for a `profiles.subscription_tier` value. */
export function maxCompareModelsForSubscriptionTier(
  tier: string | null | undefined
): number {
  switch (tier) {
    case "pro":
      return COMPARE_MODELS_BY_PLAN.pro;
    case "power":
    case "lifetime_byok":
      return COMPARE_MODELS_BY_PLAN.power;
    default:
      return COMPARE_MODELS_BY_PLAN.free;
  }
}

/** Stripe Dashboard price lookup keys (Products → Prices). */
export const STRIPE_PRICE_LOOKUP_KEYS = {
  pro: "pro_monthly",
  power: "power_monthly",
  lifetime_byok: "lifetime_byok",
} as const;

export type PaidCheckoutPlan = keyof typeof STRIPE_PRICE_LOOKUP_KEYS;

export type PricingPlan = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  /** Signup / marketing path when no paid checkout. */
  href: string;
  highlight: boolean;
  features: string[];
  /** When set, CTA opens Stripe Checkout (server API) for this tier. */
  paidCheckoutPlan?: PaidCheckoutPlan;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Free",
    price: `$${PRICING_USD.free}`,
    cadence: "/forever",
    blurb: "Bring your own keys. Get the full workspace.",
    cta: "Start free",
    href: "/signup",
    highlight: false,
    features: [
      "BYOK — unlimited providers",
      `Compare up to ${COMPARE_MODELS_BY_PLAN.free} models at once`,
      "5 projects",
      "Synthesis (10 / month)",
      "7-day history",
    ],
  },
  {
    name: "Pro",
    price: `$${PRICING_USD.proMonthly}`,
    cadence: "/month",
    blurb: "For daily power users who live in multi-AI workflows.",
    cta: "Upgrade to Pro",
    href: "/signup?plan=pro",
    paidCheckoutPlan: "pro",
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
    name: "Power",
    price: `$${PRICING_USD.powerMonthly}`,
    cadence: "/month",
    blurb: "Teams and prosumers running heavy comparisons.",
    cta: "Go Power",
    href: "/signup?plan=power",
    paidCheckoutPlan: "power",
    highlight: false,
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
    name: "Lifetime BYOK",
    price: `$${PRICING_USD.lifetimeByok}`,
    cadence: "one-time",
    blurb: "Pay once for ongoing Power-level access — no subscription.",
    cta: "Buy lifetime",
    href: "/signup?plan=lifetime",
    paidCheckoutPlan: "lifetime_byok",
    highlight: false,
    features: [
      "Everything in Power",
      "Single payment — no renewals",
      "BYOK — unlimited providers",
      "Best for long-term solo power users",
    ],
  },
];
