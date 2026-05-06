import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsageBreakdown } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  custom: "bg-gray-500",
  unknown: "bg-zinc-400",
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

export default async function AdminUsagePage() {
  const data = await getUsageBreakdown();

  const maxProviderCost = Math.max(0.0001, ...data.by_provider.map((p) => p.cost_usd));
  const maxDayCost = Math.max(0.0001, ...data.by_day.map((d) => d.cost_usd));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Last 30 days of activity, aggregated from usage_logs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">By provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.by_provider.length === 0 && (
            <p className="text-xs text-muted-foreground">No data.</p>
          )}
          {data.by_provider.map((p) => {
            const pct = (p.cost_usd / maxProviderCost) * 100;
            const color = PROVIDER_BG[p.provider] ?? "bg-zinc-400";
            return (
              <div key={p.provider} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium capitalize">{p.provider}</span>
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
          {data.by_day.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {data.by_day.map((d) => {
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Top 10 users by cost (30d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.top_users.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_users.map((u, i) => (
                    <tr key={u.user_id} className="border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtMoney(u.cost_usd, 4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
