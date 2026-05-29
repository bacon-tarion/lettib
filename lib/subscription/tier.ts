import { createServiceClient } from "@/lib/supabase/service";
import { maxCompareModelsForSubscriptionTier } from "@/lib/pricing";

export type UserSubscription = {
  tier: string;
  subscription_status: string;
  current_period_end: string | null;
};

/** Read billing tier from `profiles.tier` (updated by Stripe webhook). */
export async function getUserSubscription(
  userId: string
): Promise<UserSubscription> {
  const sc = createServiceClient();
  const { data } = await sc
    .from("profiles")
    .select("tier, subscription_status, current_period_end")
    .eq("id", userId)
    .maybeSingle();

  const row = data as UserSubscription | null;
  return {
    tier: row?.tier ?? "free",
    subscription_status: row?.subscription_status ?? "active",
    current_period_end: row?.current_period_end ?? null,
  };
}

export function maxCompareModelsForUser(tier: string | null | undefined): number {
  return maxCompareModelsForSubscriptionTier(tier);
}

export function tierDisplayName(tier: string | null | undefined): string {
  switch (tier) {
    case "pro":
      return "Pro";
    case "power":
      return "Power";
    case "lifetime_byok":
      return "Lifetime BYOK";
    default:
      return "Free";
  }
}

export function compareModelLimitError(tier: string | null | undefined): string {
  const name = tierDisplayName(tier);
  const n = maxCompareModelsForUser(tier);
  return `Your ${name} plan supports up to ${n} models. Upgrade to select more.`;
}

export function canUseShareLinks(tier: string | null | undefined): boolean {
  return tier === "power" || tier === "lifetime_byok";
}

export function shareLinkTierError(): string {
  return "Shareable links are a Power feature. Upgrade to Power or Lifetime to share synthesis results.";
}

export function synthesisLimitError(): string {
  return "You've used all 10 free syntheses this month. Upgrade to Pro for unlimited synthesis.";
}
