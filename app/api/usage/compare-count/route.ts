import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { FREE_COMPARE_LIMIT } from "@/lib/usage/limits";
import { getUserSubscription } from "@/lib/subscription/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/compare-count
 *
 * Returns this calendar month's compare count, free-tier limit, and whether
 * the user is subject to the cap. Paid tiers are exempt. Free users with any
 * non-Groq BYOK connection are also exempt (Groq is server-funded only).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const serviceClient = createServiceClient();
  const { tier } = await getUserSubscription(user.id);
  const isPaidTier = tier !== "free";

  const [{ count, error: countError }, { data: byokConns }] = await Promise.all([
    serviceClient
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "compare")
      .gte("created_at", monthStart.toISOString()),
    serviceClient
      .from("api_connections")
      .select("provider")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"])
      .neq("provider", "groq"),
  ]);

  if (countError) {
    return NextResponse.json({ error: "Failed to load compare usage" }, { status: 500 });
  }

  const hasByokKeys = (byokConns?.length ?? 0) > 0;
  const isFreeTier = !isPaidTier && !hasByokKeys;
  const used = count ?? 0;
  const limit = FREE_COMPARE_LIMIT;
  const remaining = Math.max(0, limit - used);

  return NextResponse.json({
    used,
    limit,
    remaining,
    is_free_tier: isFreeTier,
    blocked: isFreeTier && used >= limit,
  });
}
