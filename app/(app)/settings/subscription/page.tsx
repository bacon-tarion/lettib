import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripePriceIds } from "@/lib/stripe/prices";
import { getUserSubscription } from "@/lib/subscription/tier";
import { listApiKeys, getUsageAlertThresholdCents } from "../actions";
import { SettingsContent } from "../settings-content";

export const dynamic = "force-dynamic";

export default async function SubscriptionSettingsPage({
  searchParams,
}: {
  searchParams: { success?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [connections, thresholdCents, subscription] = await Promise.all([
    listApiKeys(),
    getUsageAlertThresholdCents(),
    getUserSubscription(user.id),
  ]);

  const userEmail = user.email ?? "";
  const userName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "User";
  const priceIds = getStripePriceIds();

  return (
    <SettingsContent
      initialConnections={connections}
      userEmail={userEmail}
      userName={userName}
      initialUsageAlertThresholdCents={thresholdCents}
      priceIds={priceIds}
      subscriptionTier={subscription.tier}
      defaultTab="subscription"
      showCheckoutSuccess={searchParams.success === "1"}
    />
  );
}
