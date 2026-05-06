import { createServiceClient } from "@/lib/supabase/service";

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

interface UsageLogRow {
  user_id: string;
  provider: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

export interface OverviewStats {
  total_users: number;
  signups_7d: number;
  active_users_7d: number;
  total_conversations: number;
  total_syntheses: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_synthesis_rating: number | null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const sb = createServiceClient();

  const [
    usersHead,
    signupsHead,
    convHead,
    synthHead,
    usageAgg,
    activeUsersAgg,
  ] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }),
    sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", daysAgoIso(7)),
    sb.from("conversations").select("id", { count: "exact", head: true }),
    sb.from("syntheses").select("id", { count: "exact", head: true }),
    sb
      .from("usage_logs")
      .select("tokens_in, tokens_out, cost_usd")
      .limit(100000),
    sb
      .from("usage_logs")
      .select("user_id")
      .gte("created_at", daysAgoIso(7))
      .limit(100000),
  ]);

  const usageRows = (usageAgg.data ?? []) as Pick<
    UsageLogRow,
    "tokens_in" | "tokens_out" | "cost_usd"
  >[];
  let total_tokens = 0;
  let total_cost_usd = 0;
  for (const row of usageRows) {
    total_tokens += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    total_cost_usd += Number(row.cost_usd ?? 0);
  }

  const activeRows = (activeUsersAgg.data ?? []) as { user_id: string }[];
  const active_users_7d = new Set(activeRows.map((r) => r.user_id)).size;

  return {
    total_users: usersHead.count ?? 0,
    signups_7d: signupsHead.count ?? 0,
    active_users_7d,
    total_conversations: convHead.count ?? 0,
    total_syntheses: synthHead.count ?? 0,
    total_tokens,
    total_cost_usd,
    avg_synthesis_rating: null, // No ratings table in v1
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_active: string | null;
  conversation_count: number;
  synthesis_count: number;
  total_cost_usd: number;
}

export async function listAdminUsers(opts: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AdminUserRow[]; total: number }> {
  const sb = createServiceClient();
  // Clamp inputs so a malformed/large page param can't trigger huge offsets.
  const page = Math.min(1000, Math.max(1, Math.floor(opts.page ?? 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = sb
    .from("profiles")
    .select("id, email, display_name, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.search && opts.search.trim().length > 0) {
    // Escape % and _ for ILIKE; supabase-js does not auto-escape.
    const safe = opts.search.trim().replace(/[%_]/g, "\\$&");
    query = query.ilike("email", `%${safe}%`);
  }

  const { data: profiles, count } = await query;
  const profileRows = (profiles ?? []) as ProfileRow[];
  const userIds = profileRows.map((p) => p.id);

  if (userIds.length === 0) {
    return { rows: [], total: count ?? 0 };
  }

  const [convsRes, synthRes, usageRes] = await Promise.all([
    sb
      .from("conversations")
      .select("user_id")
      .in("user_id", userIds)
      .limit(100000),
    sb
      .from("syntheses")
      .select("user_id")
      .in("user_id", userIds)
      .limit(100000),
    sb
      .from("usage_logs")
      .select("user_id, cost_usd, created_at")
      .in("user_id", userIds)
      .limit(100000),
  ]);

  const convCounts = countBy(
    (convsRes.data ?? []) as { user_id: string }[],
    (r) => r.user_id
  );
  const synthCounts = countBy(
    (synthRes.data ?? []) as { user_id: string }[],
    (r) => r.user_id
  );

  const costByUser = new Map<string, number>();
  const lastActiveByUser = new Map<string, string>();
  for (const row of (usageRes.data ?? []) as {
    user_id: string;
    cost_usd: number;
    created_at: string;
  }[]) {
    costByUser.set(
      row.user_id,
      (costByUser.get(row.user_id) ?? 0) + Number(row.cost_usd ?? 0)
    );
    const prev = lastActiveByUser.get(row.user_id);
    if (!prev || row.created_at > prev) {
      lastActiveByUser.set(row.user_id, row.created_at);
    }
  }

  const rows: AdminUserRow[] = profileRows.map((p) => ({
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    created_at: p.created_at,
    last_active: lastActiveByUser.get(p.id) ?? null,
    conversation_count: convCounts.get(p.id) ?? 0,
    synthesis_count: synthCounts.get(p.id) ?? 0,
    total_cost_usd: costByUser.get(p.id) ?? 0,
  }));

  return { rows, total: count ?? rows.length };
}

export interface UsageBreakdown {
  by_provider: { provider: string; tokens: number; cost_usd: number }[];
  by_day: { date: string; tokens: number; cost_usd: number }[];
  top_users: { user_id: string; email: string; cost_usd: number }[];
}

export async function getUsageBreakdown(): Promise<UsageBreakdown> {
  const sb = createServiceClient();
  const since = daysAgoIso(30);

  const { data: usage } = await sb
    .from("usage_logs")
    .select("user_id, provider, tokens_in, tokens_out, cost_usd, created_at")
    .gte("created_at", since)
    .limit(200000);

  const rows = (usage ?? []) as UsageLogRow[];

  const providerMap = new Map<string, { tokens: number; cost_usd: number }>();
  const dayMap = new Map<string, { tokens: number; cost_usd: number }>();
  const userCost = new Map<string, number>();

  for (const r of rows) {
    const tokens = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    const cost = Number(r.cost_usd ?? 0);
    const provider = r.provider ?? "unknown";

    const p = providerMap.get(provider) ?? { tokens: 0, cost_usd: 0 };
    p.tokens += tokens;
    p.cost_usd += cost;
    providerMap.set(provider, p);

    const day = r.created_at.slice(0, 10);
    const d = dayMap.get(day) ?? { tokens: 0, cost_usd: 0 };
    d.tokens += tokens;
    d.cost_usd += cost;
    dayMap.set(day, d);

    userCost.set(r.user_id, (userCost.get(r.user_id) ?? 0) + cost);
  }

  const by_provider = Array.from(providerMap.entries())
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const by_day = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topUserIds = Array.from(userCost.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid]) => uid);

  let top_users: UsageBreakdown["top_users"] = [];
  if (topUserIds.length > 0) {
    const { data: emails } = await sb
      .from("profiles")
      .select("id, email")
      .in("id", topUserIds);
    const emailMap = new Map(
      ((emails ?? []) as { id: string; email: string }[]).map((p) => [
        p.id,
        p.email,
      ])
    );
    top_users = topUserIds.map((uid) => ({
      user_id: uid,
      email: emailMap.get(uid) ?? "(unknown)",
      cost_usd: userCost.get(uid) ?? 0,
    }));
  }

  return { by_provider, by_day, top_users };
}

function countBy<T>(arr: T[], keyFn: (t: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of arr) {
    const k = keyFn(item);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
