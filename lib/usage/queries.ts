import { createClient } from "@/lib/supabase/server";

interface UsageRow {
  action: string | null;
  provider: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

export interface UserUsageSummary {
  total_tokens: number;
  total_cost_usd: number;
  by_provider: { provider: string; tokens: number; cost_usd: number }[];
  by_day: { date: string; tokens: number; cost_usd: number }[];
  by_action: { action: string; tokens: number; cost_usd: number; count: number }[];
  top_models: {
    provider: string;
    model: string;
    tokens: number;
    cost_usd: number;
    count: number;
  }[];
}

export interface UserUsageSnapshot {
  week_tokens: number;
  week_cost_usd: number;
  top_provider: string | null;
  top_provider_cost_usd: number;
  by_provider_week: { provider: string; cost_usd: number }[];
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Fetches the current user's usage_logs scoped under user auth context (RLS
 * enforces user_id = auth.uid()). Aggregates in JS — acceptable for v1
 * per-user volumes.
 */
export async function getUserUsageSummary(): Promise<UserUsageSummary | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const since30 = daysAgoIso(30);

  const [allRes, last30Res] = await Promise.all([
    sb
      .from("usage_logs")
      .select("action, provider, model, tokens_in, tokens_out, cost_usd")
      .eq("user_id", user.id)
      .limit(100000),
    sb
      .from("usage_logs")
      .select("provider, tokens_in, tokens_out, cost_usd, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since30)
      .limit(100000),
  ]);

  const all = (allRes.data ?? []) as Pick<
    UsageRow,
    "action" | "provider" | "model" | "tokens_in" | "tokens_out" | "cost_usd"
  >[];
  const last30 = (last30Res.data ?? []) as Pick<
    UsageRow,
    "provider" | "tokens_in" | "tokens_out" | "cost_usd" | "created_at"
  >[];

  let total_tokens = 0;
  let total_cost_usd = 0;
  const providerMap = new Map<string, { tokens: number; cost_usd: number }>();
  const actionMap = new Map<
    string,
    { tokens: number; cost_usd: number; count: number }
  >();
  const modelMap = new Map<
    string,
    { provider: string; model: string; tokens: number; cost_usd: number; count: number }
  >();

  for (const r of all) {
    const tokens = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    const cost = Number(r.cost_usd ?? 0);
    total_tokens += tokens;
    total_cost_usd += cost;

    const provider = r.provider ?? "unknown";
    const p = providerMap.get(provider) ?? { tokens: 0, cost_usd: 0 };
    p.tokens += tokens;
    p.cost_usd += cost;
    providerMap.set(provider, p);

    const action = r.action ?? "unknown";
    const a = actionMap.get(action) ?? { tokens: 0, cost_usd: 0, count: 0 };
    a.tokens += tokens;
    a.cost_usd += cost;
    a.count += 1;
    actionMap.set(action, a);

    if (r.model) {
      const key = `${provider}:${r.model}`;
      const m =
        modelMap.get(key) ??
        { provider, model: r.model, tokens: 0, cost_usd: 0, count: 0 };
      m.tokens += tokens;
      m.cost_usd += cost;
      m.count += 1;
      modelMap.set(key, m);
    }
  }

  // Build last-30 days array INCLUDING zero-days for a continuous chart.
  const dayMap = new Map<string, { tokens: number; cost_usd: number }>();
  for (const r of last30) {
    const day = r.created_at.slice(0, 10);
    const d = dayMap.get(day) ?? { tokens: 0, cost_usd: 0 };
    d.tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    d.cost_usd += Number(r.cost_usd ?? 0);
    dayMap.set(day, d);
  }
  const by_day: UserUsageSummary["by_day"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const v = dayMap.get(key) ?? { tokens: 0, cost_usd: 0 };
    by_day.push({ date: key, ...v });
  }

  const by_provider = Array.from(providerMap.entries())
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const by_action = Array.from(actionMap.entries())
    .map(([action, v]) => ({ action, ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const top_models = Array.from(modelMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total_tokens,
    total_cost_usd,
    by_provider,
    by_day,
    by_action,
    top_models,
  };
}

/**
 * Lightweight snapshot for the dashboard right-rail card — last 7 days.
 */
export async function getUserUsageSnapshot(): Promise<UserUsageSnapshot | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data } = await sb
    .from("usage_logs")
    .select("provider, tokens_in, tokens_out, cost_usd")
    .eq("user_id", user.id)
    .gte("created_at", daysAgoIso(7))
    .limit(100000);

  const rows = (data ?? []) as Pick<
    UsageRow,
    "provider" | "tokens_in" | "tokens_out" | "cost_usd"
  >[];

  let week_tokens = 0;
  let week_cost_usd = 0;
  const providerMap = new Map<string, number>();
  for (const r of rows) {
    week_tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
    const cost = Number(r.cost_usd ?? 0);
    week_cost_usd += cost;
    const p = r.provider ?? "unknown";
    providerMap.set(p, (providerMap.get(p) ?? 0) + cost);
  }

  const by_provider_week = Array.from(providerMap.entries())
    .map(([provider, cost_usd]) => ({ provider, cost_usd }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  return {
    week_tokens,
    week_cost_usd,
    top_provider: by_provider_week[0]?.provider ?? null,
    top_provider_cost_usd: by_provider_week[0]?.cost_usd ?? 0,
    by_provider_week,
  };
}
