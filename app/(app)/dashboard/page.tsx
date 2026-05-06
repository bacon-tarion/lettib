import Link from "next/link";
import { MessageSquare, GitCompare, FolderPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectCard } from "@/components/projects/project-card";
import { mockUser, mockProjects, mockUsage } from "@/lib/mockData";
import { createClient } from "@/lib/supabase/server";
import { listConversationsForUser } from "@/lib/conversations/queries";
import { getModelDisplayName } from "@/lib/providers/models";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const modeIcons = {
  chat: MessageSquare,
  compare: GitCompare,
} as const;

const quickActions = [
  { label: "New Chat", icon: MessageSquare, href: "/chat", desc: "Start a conversation" },
  { label: "Run Compare", icon: GitCompare, href: "/compare", desc: "Compare across models" },
  { label: "New Project", icon: FolderPlus, href: "/projects", desc: "Organise your work" },
];

export default async function DashboardPage() {
  let displayName = mockUser.display_name;
  let pinnedProjects: Array<{
    id: string;
    name: string;
    description?: string | null;
    pinned: boolean;
    memory_enabled?: boolean;
    default_ai_team?: string;
    chat_count?: number;
    synthesis_count?: number;
    updated_at: string;
  }> = mockProjects.filter((p) => p.pinned);
  let recentActivity: Awaited<
    ReturnType<typeof listConversationsForUser>
  > = [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "there";

    const [{ data: pinnedData }, recent] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .eq("pinned", true)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(4),
      listConversationsForUser({ userId: user.id, limit: 8 }),
    ]);

    if (pinnedData && pinnedData.length > 0) {
      pinnedProjects = pinnedData;
    }
    recentActivity = recent;
  }

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
              <p className="text-sm text-muted-foreground py-2">
                No pinned projects yet. Pin a project to see it here.
              </p>
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
                No conversations yet. Start a chat or compare to see activity here.
              </p>
            ) : (
              <div className="space-y-0.5">
                {recentActivity.map((c) => {
                  const Icon = modeIcons[c.mode] ?? MessageSquare;
                  return (
                    <Link
                      key={c.id}
                      href={`/chat/${c.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="rounded-md bg-muted p-1.5 shrink-0">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.project_name ?? "No project"} ·{" "}
                          {c.message_count} msg · ${c.cost_usd.toFixed(4)}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {c.provider && c.model && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {getModelDisplayName(c.provider, c.model)}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatRelative(c.updated_at)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Usage Snapshot
          </h2>
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Today</span>
                <span className="font-semibold text-sm">
                  ${mockUsage.today_usd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">This month</span>
                <span className="font-semibold text-sm">
                  ${mockUsage.month_usd.toFixed(2)}
                </span>
              </div>
              <div className="pt-1 space-y-3">
                {mockUsage.by_provider.map((p) => {
                  const pct = Math.round(
                    (p.month_usd / mockUsage.month_usd) * 100
                  );
                  return (
                    <div key={p.provider} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{p.label}</span>
                        <span className="text-muted-foreground">
                          ${p.month_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: p.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
