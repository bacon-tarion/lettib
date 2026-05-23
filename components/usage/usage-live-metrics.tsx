"use client";

import { useEffect, useRef, useState } from "react";
import { CircleDot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { getProviderLabel } from "@/lib/providers/models";
import type { UserUsageSummary } from "@/lib/usage/queries";
import { UsageWidgetErrorBoundary } from "./usage-error-boundary";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  groq: "bg-orange-500",
  custom: "bg-gray-500",
  unknown: "bg-zinc-400",
};

type UsageLogRow = {
  user_id: string;
  cost_usd: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  provider?: string | null;
  created_at: string;
};

function fmtNumber(n: number) {
  return n.toLocaleString();
}
function fmtMoney(n: number, digits = 4) {
  return `$${n.toFixed(digits)}`;
}

type LiveMetricsState = {
  totalTokens: number;
  totalCostUsd: number;
  byProvider: { provider: string; tokens: number; cost_usd: number }[];
  connection: "connecting" | "live" | "fallback";
};

function applySummary(summary: UserUsageSummary): LiveMetricsState {
  return {
    totalTokens: summary.total_tokens,
    totalCostUsd: summary.total_cost_usd,
    byProvider: summary.by_provider.map((p) => ({ ...p })),
    connection: "connecting",
  };
}

function applyRowDelta(
  prev: LiveMetricsState,
  row: UsageLogRow
): LiveMetricsState {
  const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
  const cost = Number(row.cost_usd ?? 0);
  const provider = row.provider ?? "unknown";
  const byProvider = prev.byProvider.map((p) => ({ ...p }));
  const idx = byProvider.findIndex((p) => p.provider === provider);
  if (idx >= 0) {
    byProvider[idx] = {
      provider,
      tokens: byProvider[idx]!.tokens + tokens,
      cost_usd: byProvider[idx]!.cost_usd + cost,
    };
  } else {
    byProvider.push({ provider, tokens, cost_usd: cost });
  }
  byProvider.sort((a, b) => b.cost_usd - a.cost_usd);
  return {
    ...prev,
    totalTokens: prev.totalTokens + tokens,
    totalCostUsd: prev.totalCostUsd + cost,
    byProvider,
  };
}

function ConnectionIndicator({
  connection,
}: {
  connection: LiveMetricsState["connection"];
}) {
  const live = connection === "live";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${
        live ? "text-green-500" : "text-muted-foreground"
      }`}
      title={live ? "Live" : "Polling"}
    >
      <CircleDot className={`h-3 w-3 ${live ? "" : "opacity-50"}`} />
      Live
    </span>
  );
}

interface UsageLiveMetricsProps {
  initialSummary: UserUsageSummary;
}

export function UsageLiveMetrics({ initialSummary }: UsageLiveMetricsProps) {
  const [state, setState] = useState<LiveMetricsState>(() =>
    applySummary(initialSummary)
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function refreshFromApi() {
      try {
        const res = await fetch("/api/usage/summary", { cache: "no-store" });
        if (!res.ok) return;
        const summary = (await res.json()) as UserUsageSummary;
        if (cancelled) return;
        setState((prev) => ({
          ...applySummary(summary),
          connection: prev.connection === "live" ? "live" : "fallback",
        }));
      } catch (err) {
        console.error("[UsageLiveMetrics] poll failed:", err);
      }
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => void refreshFromApi(), 30_000);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    async function start() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`usage_metrics:user:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "usage_logs",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as UsageLogRow | undefined;
            if (!row) return;
            setState((prev) => applyRowDelta(prev, row));
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            stopPolling();
            setState((prev) => ({ ...prev, connection: "live" }));
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setState((prev) => ({ ...prev, connection: "fallback" }));
            startPolling();
          }
        });
    }

    void start();

    return () => {
      cancelled = true;
      stopPolling();
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const maxProviderCost = Math.max(
    0.0001,
    ...state.byProvider.map((p) => p.cost_usd)
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Total tokens (all time)
            </CardTitle>
            <ConnectionIndicator connection={state.connection} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {fmtNumber(state.totalTokens)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Total cost (all time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {fmtMoney(state.totalCostUsd, 4)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">By provider</CardTitle>
          <ConnectionIndicator connection={state.connection} />
        </CardHeader>
        <CardContent className="space-y-3">
          {state.byProvider.length === 0 && (
            <p className="text-xs text-muted-foreground">No data.</p>
          )}
          {state.byProvider.map((p) => {
            const pct = (p.cost_usd / maxProviderCost) * 100;
            const color = PROVIDER_BG[p.provider] ?? "bg-zinc-400";
            return (
              <div key={p.provider} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">
                    {getProviderLabel(p.provider)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmtNumber(p.tokens)} tok · {fmtMoney(p.cost_usd, 4)}
                  </span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full ${color}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}

export function UsageLiveMetricsSection({
  initialSummary,
}: UsageLiveMetricsProps) {
  return (
    <UsageWidgetErrorBoundary label="Live metrics">
      <UsageLiveMetrics initialSummary={initialSummary} />
    </UsageWidgetErrorBoundary>
  );
}
