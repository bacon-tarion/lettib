import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { cost_usd: number | null; created_at: string };

function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Seed payload for the live usage dashboard.
 *
 * Returns whole-cent totals (we never display sub-cent amounts on the
 * live widgets — they're noise at this resolution and cause flicker
 * when Realtime events arrive).
 *
 * After this initial seed, the client subscribes to usage_logs via
 * Supabase Realtime and increments counters from the INSERT payloads
 * directly (no re-query per event).
 */
export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS scopes this to the user; we still pass the filter (defense-in-depth,
  // and required for Realtime payload-filter consistency).
  const since30 = thirtyDaysAgoIso();
  const sinceToday = startOfTodayIso();

  const { data, error } = await sb
    .from("usage_logs")
    .select("cost_usd, created_at")
    .eq("user_id", user.id)
    .gte("created_at", since30)
    .limit(100000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let thirtyUsd = 0;
  let todayUsd = 0;
  for (const r of (data ?? []) as Row[]) {
    const cost = Number(r.cost_usd ?? 0);
    thirtyUsd += cost;
    if (r.created_at >= sinceToday) todayUsd += cost;
  }

  return NextResponse.json({
    thirty_day_cents: Math.round(thirtyUsd * 100),
    today_cents: Math.round(todayUsd * 100),
    server_now: new Date().toISOString(),
    start_of_today: sinceToday,
  });
}
