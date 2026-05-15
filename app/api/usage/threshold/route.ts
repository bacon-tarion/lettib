import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  usage_alert_threshold_cents: number | null;
  last_alerted_total_cents: number | null;
};

type UsageRow = { cost_usd: number | null };

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Recompute the rolling 30-day total server-side, then advance the
 * `last_alerted_total_cents` bookmark on the profile if the user has crossed
 * one or more new multiples of `usage_alert_threshold_cents`.
 *
 * We NEVER trust a client-supplied total or bookmark (audit rule). The
 * client just pings this route after a Realtime INSERT; the server is the
 * single source of truth for "have we already alerted on this slice?".
 *
 * Returns:
 *   {
 *     total_cents:    integer,   // current 30-day total in cents
 *     threshold:      integer,   // user's per-step threshold
 *     last_alerted:   integer,   // bookmark BEFORE this call
 *     crossed_to:     integer | null  // new multiple to alert on, or null
 *   }
 */
export async function POST() {
  const sb = await createClient();
  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // 1. Pull the user's current threshold + bookmark.
  const { data: profile, error: profErr } = await service
    .from("profiles")
    .select("id, usage_alert_threshold_cents, last_alerted_total_cents")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }
  const p = (profile ?? null) as ProfileRow | null;
  if (!p) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const threshold = p.usage_alert_threshold_cents ?? 1000;
  const lastAlerted = p.last_alerted_total_cents ?? 0;

  if (threshold <= 0) {
    return NextResponse.json({
      total_cents: 0,
      threshold,
      last_alerted: lastAlerted,
      crossed_to: null,
    });
  }

  // 2. Recompute 30-day total from usage_logs. Service client bypasses RLS;
  //    we explicitly filter by user_id so the user can never see other users'
  //    rows even by accident.
  const since = daysAgoIso(30);
  const { data: rows, error: usageErr } = await service
    .from("usage_logs")
    .select("cost_usd")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .limit(100000);

  if (usageErr) {
    return NextResponse.json({ error: usageErr.message }, { status: 500 });
  }

  let totalUsd = 0;
  for (const r of (rows ?? []) as UsageRow[]) {
    totalUsd += Number(r.cost_usd ?? 0);
  }
  // Round down to whole cents — alerts trigger only on completed crossings.
  const totalCents = Math.floor(totalUsd * 100);

  // 3. The next multiple we'd alert on is the smallest multiple of `threshold`
  //    that is BOTH strictly greater than `lastAlerted` AND <= `totalCents`.
  //    If the user has skipped several thresholds (rare but possible with a
  //    big multi-model compare), we still alert only ONCE per request — for
  //    the highest crossed multiple — so a single network event can't spam
  //    the toast queue.
  let crossedTo: number | null = null;
  if (totalCents >= lastAlerted + threshold) {
    crossedTo = Math.floor(totalCents / threshold) * threshold;
    if (crossedTo <= lastAlerted) {
      crossedTo = null;
    }
  }

  if (crossedTo !== null) {
    const { error: updErr } = await service
      .from("profiles")
      .update({ last_alerted_total_cents: crossedTo })
      .eq("id", user.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    total_cents: totalCents,
    threshold,
    last_alerted: lastAlerted,
    crossed_to: crossedTo,
  });
}

/**
 * Returns the user's current threshold + bookmark. Used by the dashboard /
 * settings page on initial load.
 */
export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("usage_alert_threshold_cents, last_alerted_total_cents")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const p = (data ?? null) as Pick<
    ProfileRow,
    "usage_alert_threshold_cents" | "last_alerted_total_cents"
  > | null;

  return NextResponse.json({
    threshold_cents: p?.usage_alert_threshold_cents ?? 1000,
    last_alerted_cents: p?.last_alerted_total_cents ?? 0,
  });
}
