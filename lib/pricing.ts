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

export type PricingPlan = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  href: string;
  highlight: boolean;
  features: string[];
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
      "Compare up to 3 models at once",
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
    highlight: true,
    features: [
      "Everything in Free",
      "Compare up to 6 models at once",
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
    highlight: false,
    features: [
      "Everything in Pro",
      "Compare up to 12 models at once",
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
    highlight: false,
    features: [
      "Everything in Power",
      "Single payment — no renewals",
      "BYOK — unlimited providers",
      "Best for long-term solo power users",
    ],
  },
];
