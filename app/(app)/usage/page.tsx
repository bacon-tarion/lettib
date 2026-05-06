import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserUsageSummary } from "@/lib/usage/queries";
import { getModelDisplayName, getProviderLabel } from "@/lib/providers/models";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  custom: "bg-gray-500",
  unknown: "bg-zinc-400",
};

const ACTION_LABEL: Record<string, string> = {
  chat: "Chat",
  compare: "Compare",
  synthesis: "Synthesis",
  memory_extraction: "Memory extraction",
  unknown: "Other",
};

function fmtNumber(n: number) {
  return n.toLocaleString();
}
function fmtMoney(n: number, digits = 2) {
  return `$${n.toFixed(digits)}`;
}
function fmtDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export default async function UsagePage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const summary = await getUserUsageSummary();
  if (!summary) redirect("/login");

  const maxProviderCost = Math.max(
    0.0001,
    ...summary.by_provider.map((p) => p.cost_usd)
  );
  const maxDayCost = Math.max(0.0001, ...summary.by_day.map((d) => d.cost_usd));
  const hasAny = summary.total_cost_usd > 0 || summary.total_tokens > 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your token spend across providers — based on your own API keys.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              Total tokens (all time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {fmtNumber(summary.total_tokens)}
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
              {fmtMoney(summary.total_cost_usd, 4)}
            </p>
          </CardContent>
        </Card>
      </div>

      {!hasAny && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
            No usage logged yet. Run a chat, compare, or synthesis to start
            tracking spend.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">By provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.by_provider.length === 0 && (
            <p className="text-xs text-muted-foreground">No data.</p>
          )}
          {summary.by_provider.map((p) => {
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Daily cost (last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {summary.by_day.map((d) => {
              const pct = (d.cost_usd / maxDayCost) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center gap-1 group min-w-0"
                  title={`${d.date}: ${fmtMoney(d.cost_usd, 4)}, ${fmtNumber(d.tokens)} tokens`}
                >
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full bg-primary/70 rounded-t group-hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {fmtDay(d.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">By action type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Action
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Calls
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Tokens
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.by_action.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                    >
                      No data.
                    </td>
                  </tr>
                )}
                {summary.by_action.map((a) => (
                  <tr key={a.action} className="border-t">
                    <td className="px-3 py-2">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(a.count)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(a.tokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(a.cost_usd, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Top 5 models (by call count)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Model
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Calls
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Tokens
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.top_models.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-4 text-center text-xs text-muted-foreground"
                    >
                      No data.
                    </td>
                  </tr>
                )}
                {summary.top_models.map((m) => (
                  <tr key={`${m.provider}:${m.model}`} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {getModelDisplayName(m.provider, m.model)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getProviderLabel(m.provider)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(m.count)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNumber(m.tokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(m.cost_usd, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
