import { createServiceClient } from "@/lib/supabase/service";

export type OnboardingStatus = {
  hasApiKey: boolean;
  hasRunCompare: boolean;
  dismissed: boolean;
};

const ACTIVE_API_KEY_STATUSES = ["connected", "untested"] as const;

/**
 * Load onboarding checklist state for a user. Uses the service-role client
 * (same as listApiKeys) so api_connections rows are visible even when RLS
 * SELECT policies are missing or misconfigured on the user-scoped client.
 */
export async function fetchOnboardingStatus(
  userId: string
): Promise<OnboardingStatus> {
  const serviceClient = createServiceClient();

  const { data: profileRow, error: profileError } = await serviceClient
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
      serviceClient
        .from("api_connections")
        .select("id")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_API_KEY_STATUSES])
        .limit(1),
      serviceClient
        .from("conversations")
        .select("id")
        .eq("user_id", userId)
        .eq("mode", "compare")
        .limit(1),
    ]);

    if (apiKeyResult.error) {
      console.error(
        "[onboarding] api_connections query failed:",
        apiKeyResult.error
      );
    }
    if (compareResult.error) {
      console.error("[onboarding] compare query failed:", compareResult.error);
    }

    hasApiKey = (apiKeyResult.data?.length ?? 0) > 0;
    hasRunCompare = (compareResult.data?.length ?? 0) > 0;
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
