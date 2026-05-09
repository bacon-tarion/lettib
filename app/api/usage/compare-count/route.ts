import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FREE_COMPARE_LIMIT } from "@/lib/usage/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/compare-count
 *
 * Returns this calendar month's compare count for the current user, plus the
 * free-tier limit and whether the user is on the free tier (no paid api
 * connections of their own — "paid" means any provider other than `groq`,
 * which is server-funded).
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

  const [{ count, error: countError }, { data: paidConns }] = await Promise.all([
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "compare")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("api_connections")
      .select("provider")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"])
      .neq("provider", "groq"),
  ]);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const isFreeTier = !paidConns || paidConns.length === 0;
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
