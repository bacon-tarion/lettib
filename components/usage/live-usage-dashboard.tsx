"use client";

import { useEffect, useRef, useState } from "react";
import { CircleDot, AlertTriangle, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { UsageWidgetErrorBoundary } from "./usage-error-boundary";

// ─── State ────────────────────────────────────────────────────────────────
//
// One normalized state object feeds every widget. Each widget is a pure
// function of this state, per the architecture rules. Don't add cold data
// here (pricing metadata, model lists) — keep this object small and
// strictly the "hot" Realtime path.
type LiveState = {
  loaded: boolean;
  thirtyDayCents: number;
  todayCents: number;
  /** Spend recorded since the user opened this tab. */
  sessionCents: number;
  /** Last alerted multiple of threshold (server-managed). */
  lastAlertedCents: number;
  /** Per-step threshold (cents). */
  thresholdCents: number;
  /** Realtime connection health. */
  connection: "connecting" | "live" | "reconnecting" | "fallback";
  /** Time we last received any event (for the live indicator label). */
  lastEventAt: number | null;
};

type UsageLogRow = {
  id?: string;
  user_id: string;
  cost_usd: number | null;
  created_at: string;
};

type LiveTotalsPayload = {
  thirty_day_cents: number;
  today_cents: number;
  start_of_today: string;
};

type ThresholdGetPayload = {
  threshold_cents: number;
  last_alerted_cents: number;
};

type ThresholdPostPayload = {
  total_cents: number;
  threshold: number;
  last_alerted: number;
  crossed_to: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  if (cents < 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function costUsdToCents(costUsd: number | null | undefined): number {
  const n = Number(costUsd ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

// ─── Toast (Radix) helper ─────────────────────────────────────────────────
//
// The app does not (yet) mount a global Toaster on this layout — the
// dashboard fires its own self-contained toast queue in a portal. We keep
// the visual very close to shadcn's default toast styling so when a
// project-wide Toaster ships, this can be replaced one-line.

type ToastItem = {
  id: number;
  title: string;
  description?: string;
};

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-md border bg-background shadow-lg px-4 py-3 text-sm animate-in fade-in slide-in-from-bottom-2 flex items-start gap-2"
        >
          <BellRing className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">{t.title}</p>
            {t.description && (
              <p className="text-xs text-muted-foreground">{t.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Widgets (pure functions of LiveState) ────────────────────────────────

function ThirtyDayCard({ state }: { state: LiveState }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs text-muted-foreground font-medium">
          Spend (last 30 days)
        </CardTitle>
        <ConnectionDot connection={state.connection} />
      </CardHeader>
      <CardContent>
        {state.loaded ? (
          <p className="text-3xl font-bold tabular-nums">
            {formatCents(state.thirtyDayCents)}
          </p>
        ) : (
          <Skeleton className="h-9 w-32" />
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          Mirrors how provider bills work — rolling window.
        </p>
      </CardContent>
    </Card>
  );
}

function TodayCard({ state }: { state: LiveState }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs text-muted-foreground font-medium">
          Spend today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state.loaded ? (
          <p className="text-2xl font-semibold tabular-nums">
            {formatCents(state.todayCents)}
          </p>
        ) : (
          <Skeleton className="h-8 w-24" />
        )}
      </CardContent>
    </Card>
  );
}

function SessionCard({ state }: { state: LiveState }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs text-muted-foreground font-medium">
          This session
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state.loaded ? (
          <p className="text-2xl font-semibold tabular-nums">
            {formatCents(state.sessionCents)}
          </p>
        ) : (
          <Skeleton className="h-8 w-24" />
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          Since you opened this tab.
        </p>
      </CardContent>
    </Card>
  );
}

function ConnectionDot({
  connection,
}: {
  connection: LiveState["connection"];
}) {
  const { color, label } =
    connection === "live"
      ? { color: "text-green-500", label: "Live" }
      : connection === "connecting"
        ? { color: "text-muted-foreground", label: "Connecting…" }
        : connection === "reconnecting"
          ? { color: "text-amber-500", label: "Reconnecting…" }
          : { color: "text-muted-foreground", label: "Offline" };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${color}`}
      aria-live="polite"
      title={label}
    >
      <CircleDot
        className={`h-3 w-3 ${
          connection === "live" ? "" : "opacity-60"
        } ${connection === "reconnecting" ? "animate-pulse" : ""}`}
      />
      <span className="font-medium">{label}</span>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function LiveUsageDashboard() {
  const [state, setState] = useState<LiveState>({
    loaded: false,
    thirtyDayCents: 0,
    todayCents: 0,
    sessionCents: 0,
    lastAlertedCents: 0,
    thresholdCents: 1000,
    connection: "connecting",
    lastEventAt: null,
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [seedError, setSeedError] = useState<string | null>(null);

  // Refs so the Realtime callback closure can read fresh values without
  // re-subscribing on every state change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const startOfTodayRef = useRef<string>("");
  const toastCounter = useRef(0);

  function pushToast(item: Omit<ToastItem, "id">) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, ...item }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }

  // ─── 1. Seed counters from a one-shot REST fetch ────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function seed() {
      try {
        const [totalsRes, thresholdRes] = await Promise.all([
          fetch("/api/usage/live-totals", { cache: "no-store" }),
          fetch("/api/usage/threshold", { cache: "no-store" }),
        ]);

        if (!totalsRes.ok) {
          throw new Error(`live-totals returned ${totalsRes.status}`);
        }
        const totals = (await totalsRes.json()) as LiveTotalsPayload;
        const threshold = thresholdRes.ok
          ? ((await thresholdRes.json()) as ThresholdGetPayload)
          : { threshold_cents: 1000, last_alerted_cents: 0 };

        if (cancelled) return;

        startOfTodayRef.current = totals.start_of_today;
        setState((prev) => ({
          ...prev,
          loaded: true,
          thirtyDayCents: totals.thirty_day_cents,
          todayCents: totals.today_cents,
          thresholdCents: threshold.threshold_cents,
          lastAlertedCents: threshold.last_alerted_cents,
        }));
      } catch (err) {
        if (cancelled) return;
        console.error("[LiveUsageDashboard] seed failed:", err);
        setSeedError(
          err instanceof Error ? err.message : "Failed to load usage."
        );
        // Still flip `loaded` so the UI doesn't sit in a skeleton forever.
        setState((prev) => ({ ...prev, loaded: true }));
      }
    }

    void seed();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── 2. Subscribe to usage_logs INSERTs via Supabase Realtime ───────────
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      userId = user.id;

      channel = supabase
        .channel(`usage_logs:user:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "usage_logs",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as UsageLogRow | undefined;
            if (!row) return;
            const deltaCents = costUsdToCents(row.cost_usd);
            if (deltaCents <= 0) return;

            const isToday = row.created_at >= startOfTodayRef.current;
            setState((prev) => ({
              ...prev,
              thirtyDayCents: prev.thirtyDayCents + deltaCents,
              todayCents: isToday
                ? prev.todayCents + deltaCents
                : prev.todayCents,
              sessionCents: prev.sessionCents + deltaCents,
              lastEventAt: Date.now(),
            }));

            // Threshold check — server-authoritative.
            void checkThreshold();
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setState((prev) => ({ ...prev, connection: "live" }));
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            // Don't blank the page — just flag reconnecting and let the
            // seeded numbers stand. supabase-js retries automatically.
            setState((prev) => ({
              ...prev,
              connection:
                prev.connection === "live" ? "reconnecting" : "fallback",
            }));
          }
        });
    }

    async function checkThreshold() {
      try {
        const res = await fetch("/api/usage/threshold", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as ThresholdPostPayload;
        if (data.crossed_to !== null) {
          setState((prev) => ({
            ...prev,
            lastAlertedCents: data.crossed_to ?? prev.lastAlertedCents,
          }));
          pushToast({
            title: `You've spent ${formatCents(
              data.crossed_to
            )} across your connected providers in the last 30 days.`,
            description: `Next alert at ${formatCents(
              (data.crossed_to ?? 0) + data.threshold
            )}.`,
          });
        }
      } catch (err) {
        console.warn("[LiveUsageDashboard] threshold check failed", err);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Live spend
        </h2>
        {state.loaded && state.thresholdCents > 0 && (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Alerting every {formatCents(state.thresholdCents)} · last at{" "}
            {formatCents(state.lastAlertedCents)}
          </p>
        )}
      </div>

      {seedError && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50/30 dark:bg-amber-900/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Could not seed totals ({seedError}). Live updates will still appear
            as they happen.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UsageWidgetErrorBoundary label="30-day spend">
          <ThirtyDayCard state={state} />
        </UsageWidgetErrorBoundary>
        <UsageWidgetErrorBoundary label="Today">
          <TodayCard state={state} />
        </UsageWidgetErrorBoundary>
        <UsageWidgetErrorBoundary label="Session">
          <SessionCard state={state} />
        </UsageWidgetErrorBoundary>
      </div>

      <ToastViewport toasts={toasts} />
    </section>
  );
}
