import { createServiceClient } from "@/lib/supabase/service";
import { synthesisLimitError } from "@/lib/subscription/tier";
import { FREE_SYNTHESIS_LIMIT } from "@/lib/usage/limits";

type ProfileUsageRow = {
  tier: string;
  messages_used_this_month: number | null;
};

export async function checkSynthesisQuota(
  userId: string
): Promise<{ allowed: boolean; error?: string }> {
  const sc = createServiceClient();
  const { data, error } = await sc
    .from("profiles")
    .select("tier, messages_used_this_month")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { allowed: false, error: "Could not verify synthesis quota." };
  }

  const row = data as ProfileUsageRow;
  if (row.tier !== "free") {
    return { allowed: true };
  }

  const used = row.messages_used_this_month ?? 0;
  if (used >= FREE_SYNTHESIS_LIMIT) {
    return { allowed: false, error: synthesisLimitError() };
  }

  return { allowed: true };
}

export async function incrementSynthesisUsage(userId: string): Promise<void> {
  const sc = createServiceClient();
  const { data } = await sc
    .from("profiles")
    .select("tier, messages_used_this_month")
    .eq("id", userId)
    .maybeSingle();

  const row = data as ProfileUsageRow | null;
  if (!row || row.tier !== "free") {
    return;
  }

  const used = row.messages_used_this_month ?? 0;
  await sc
    .from("profiles")
    .update({ messages_used_this_month: used + 1 })
    .eq("id", userId)
    .eq("tier", "free");
}
