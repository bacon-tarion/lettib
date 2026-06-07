import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingStatus = {
  hasApiKey: boolean;
  hasRunCompare: boolean;
  dismissed: boolean;
};

export async function fetchOnboardingStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingStatus> {
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_dismissed")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[onboarding] profile fetch failed:", profileError);
  }

  const dismissed =
    (profileRow as { onboarding_dismissed?: boolean } | null)
      ?.onboarding_dismissed ?? false;

  let hasApiKey = false;
  let hasRunCompare = false;

  if (!dismissed) {
    const [apiKeyResult, compareResult] = await Promise.all([
      supabase
        .from("api_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["connected", "untested"]),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("mode", "compare"),
    ]);

    if (apiKeyResult.error) {
      console.error(
        "[onboarding] api_connections count failed:",
        apiKeyResult.error
      );
    }
    if (compareResult.error) {
      console.error("[onboarding] compare count failed:", compareResult.error);
    }

    hasApiKey = (apiKeyResult.count ?? 0) > 0;
    hasRunCompare = (compareResult.count ?? 0) > 0;
  }

  return { hasApiKey, hasRunCompare, dismissed };
}

export function parseOnboardingStatusPayload(
  data: unknown
): OnboardingStatus | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (
    typeof row.hasApiKey !== "boolean" ||
    typeof row.hasRunCompare !== "boolean" ||
    typeof row.dismissed !== "boolean"
  ) {
    return null;
  }
  return {
    hasApiKey: row.hasApiKey,
    hasRunCompare: row.hasRunCompare,
    dismissed: row.dismissed,
  };
}

/** Keep checklist progress monotonic — stale fetches must not uncheck completed steps. */
export function mergeOnboardingStatus(
  prev: OnboardingStatus,
  next: OnboardingStatus
): OnboardingStatus {
  return {
    hasApiKey: next.hasApiKey || prev.hasApiKey,
    hasRunCompare: next.hasRunCompare || prev.hasRunCompare,
    dismissed: next.dismissed || prev.dismissed,
  };
}
