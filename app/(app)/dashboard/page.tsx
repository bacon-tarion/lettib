import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, GitCompare, FolderPlus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/projects/project-card";
import { createClient } from "@/lib/supabase/server";
import { listTeams } from "@/app/(app)/teams/actions";
import { fetchRecentActivityMerged } from "@/lib/dashboard/recent-activity";
import { getProviderLabel } from "@/lib/providers/models";
import { getUserUsageSnapshot } from "@/lib/usage/queries";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const activityIcons = {
  chat: MessageSquare,
  compare: GitCompare,
  synthesis: Sparkles,
} as const;

const quickActions = [
  { label: "New Chat", icon: MessageSquare, href: "/chat", desc: "Start a conversation" },
  { label: "Run Compare", icon: GitCompare, href: "/compare", desc: "Compare across models" },
  { label: "New Project", icon: FolderPlus, href: "/projects", desc: "Organise your work" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  const [{ data: pinnedData }, recentActivity, snapshot, teams] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .eq("pinned", true)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(4),
    fetchRecentActivityMerged(user.id, 10),
    getUserUsageSnapshot(),
    listTeams(),
  ]);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const pinnedProjects = (pinnedData ?? []).map((p) => {
    const row = p as { default_team_id?: string | null };
    const tid = row.default_team_id;
    return {
      ...p,
      default_team_display: tid ? teamNameById.get(tid) ?? undefined : undefined,
    };
  });

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {displayName}.</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s what&apos;s happening in your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {quickActions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.label} href={a.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6 pb-5 flex flex-col items-center gap-2 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-sm">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Pinned Projects
            </h2>
            {pinnedProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No pinned projects yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Open{" "}
                  <Link href="/projects" className="underline underline-offset-2">
                    Projects
                  </Link>{" "}
                  and pin one to see it here.
                </p>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {pinnedProjects.map((p) => (
                  <div key={p.id} className="shrink-0 w-64">
                    <ProjectCard {...p} description={p.description ?? undefined} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Activity
            </h2>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No recent activity. Start a chat or compare to get started.
              </p>
            ) : (
              <div className="space-y-0.5">
                {recentActivity.map((item) => {
                  const Icon = activityIcons[item.kind] ?? MessageSquare;
                  return (
                    <Link
                      key={`${item.kind}-${item.id}`}
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="rounded-md bg-muted p-1.5 shrink-0">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.subtitle}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatRelative(item.updated_at)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Usage this week
            </h2>
            <Link
              href="/usage"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          </div>
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Tokens (week)</span>
                <span className="font-semibold text-sm tabular-nums">
                  {(snapshot?.week_tokens ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Cost (week)</span>
                <span className="font-semibold text-sm tabular-nums">
                  ${(snapshot?.week_cost_usd ?? 0).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Most-used provider
                </span>
                <span className="font-semibold text-sm">
                  {snapshot?.top_provider
                    ? getProviderLabel(snapshot.top_provider)
                    : "—"}
                </span>
              </div>
              {snapshot && snapshot.by_provider_week.length > 0 && (
                <div className="pt-1 space-y-2 border-t mt-2">
                  {snapshot.by_provider_week.slice(0, 4).map((p) => {
                    const pct = snapshot.week_cost_usd
                      ? Math.max(
                          2,
                          Math.round((p.cost_usd / snapshot.week_cost_usd) * 100)
                        )
                      : 0;
                    return (
                      <div key={p.provider} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{getProviderLabel(p.provider)}</span>
                          <span className="text-muted-foreground tabular-nums">
                            ${p.cost_usd.toFixed(4)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {(!snapshot || snapshot.week_tokens === 0) && (
                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  No usage this week.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
