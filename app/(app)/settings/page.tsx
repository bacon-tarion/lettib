import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listApiKeys, getUsageAlertThresholdCents } from "./actions";
import { SettingsContent } from "./settings-content";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [connections, thresholdCents, profileRes] = await Promise.all([
    listApiKeys(),
    getUsageAlertThresholdCents(),
    createServiceClient()
      .from("profiles")
      .select("subscription_tier, subscription_status, current_period_end")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as {
    subscription_tier: string;
    subscription_status: string;
    current_period_end: string | null;
  } | null;

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
      subscriptionTier={profile?.subscription_tier ?? "free"}
      subscriptionStatus={profile?.subscription_status ?? "active"}
      currentPeriodEnd={profile?.current_period_end ?? null}
    />
  );
}
