"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockUsage } from "@/lib/mockData";

const pctChange = Math.round(
  ((mockUsage.month_usd - mockUsage.month_last_usd) / mockUsage.month_last_usd) * 100
);

const MOCK_PROVIDER_TABLE = [
  { provider: "Anthropic", model: "claude-opus-4-7", month_usd: 2.80, tokens_in: "820K", tokens_out: "310K", error_rate: "0.1%" },
  { provider: "Anthropic", model: "claude-sonnet-4-6", month_usd: 1.30, tokens_in: "480K", tokens_out: "190K", error_rate: "0.0%" },
  { provider: "OpenAI", model: "gpt-5.4", month_usd: 2.80, tokens_in: "650K", tokens_out: "280K", error_rate: "0.2%" },
  { provider: "Google", model: "gemini-3.1-pro", month_usd: 0.95, tokens_in: "430K", tokens_out: "170K", error_rate: "0.0%" },
  { provider: "xAI", model: "grok-4.1", month_usd: 0.36, tokens_in: "190K", tokens_out: "80K", error_rate: "0.0%" },
];

export default function UsagePage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-2xl font-bold">${mockUsage.today_usd.toFixed(2)}</p>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div>
          <p className="text-xs text-muted-foreground">This Month</p>
          <p className="text-2xl font-bold">${mockUsage.month_usd.toFixed(2)}</p>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div>
          <p className="text-xs text-muted-foreground">vs Last Month</p>
          <p className={`text-2xl font-bold ${pctChange >= 0 ? "text-red-500" : "text-green-500"}`}>
            {pctChange >= 0 ? "+" : ""}{pctChange}%
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-provider">By Provider</TabsTrigger>
          <TabsTrigger value="by-project">By Project</TabsTrigger>
          <TabsTrigger value="by-team">By Team</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {mockUsage.by_provider.map((p) => (
              <Card key={p.provider} className="border-l-4" style={{ borderLeftColor: p.color }}>
                <CardHeader className="pb-1 pt-4">
                  <CardTitle className="text-sm text-muted-foreground">{p.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">${p.month_usd.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">this month</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Top Sessions</h3>
            <div className="space-y-2">
              {mockUsage.top_sessions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.project} · {s.date}</p>
                  </div>
                  <span className="text-sm font-semibold">${s.cost_usd.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="by-provider" className="mt-4">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Provider", "Model", "Month Spend", "Tokens In", "Tokens Out", "Error Rate"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_PROVIDER_TABLE.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-3 font-medium">{row.provider}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-3">${row.month_usd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.tokens_in}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.tokens_out}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.error_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {["by-project", "by-team", "sessions"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <p className="text-muted-foreground text-sm py-8 text-center">Coming soon.</p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
