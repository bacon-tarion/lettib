import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverviewStats } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

function fmtNumber(n: number) {
  return n.toLocaleString();
}
function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function AdminOverviewPage() {
  const stats = await getOverviewStats();

  const tiles = [
    { label: "Total Users", value: fmtNumber(stats.total_users) },
    { label: "Signups (7d)", value: fmtNumber(stats.signups_7d) },
    { label: "Active Users (7d)", value: fmtNumber(stats.active_users_7d) },
    { label: "Conversations", value: fmtNumber(stats.total_conversations) },
    { label: "Syntheses", value: fmtNumber(stats.total_syntheses) },
    { label: "Total Tokens", value: fmtNumber(stats.total_tokens) },
    { label: "Total Cost", value: fmtMoney(stats.total_cost_usd) },
    {
      label: "Avg Rating",
      value:
        stats.avg_synthesis_rating != null
          ? stats.avg_synthesis_rating.toFixed(2)
          : "—",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Real-time stats from production data.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {tiles.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1 pt-4">
              <CardTitle className="text-xs text-muted-foreground font-medium">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
