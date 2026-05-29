import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription/tier";
import { listApiKeys, getUsageAlertThresholdCents } from "./actions";
import { SettingsContent } from "./settings-content";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; success?: string };
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

  return (
    <SettingsContent
      initialConnections={connections}
      userEmail={userEmail}
      userName={userName}
      initialUsageAlertThresholdCents={thresholdCents}
      subscriptionTier={subscription.tier}
      defaultTab={
        searchParams?.tab === "subscription" ? "subscription" : undefined
      }
      showCheckoutSuccess={searchParams?.success === "1"}
    />
  );
}
