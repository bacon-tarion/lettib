import Link from "next/link";
import { MessageSquare, GitCompare, FolderPlus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectCard } from "@/components/projects/project-card";
import { mockUser, mockProjects, mockActivity, mockUsage } from "@/lib/mockData";

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const activityIcons = {
  chat: MessageSquare,
  compare: GitCompare,
  synthesis: Sparkles,
} as const;

type ActivityType = keyof typeof activityIcons;

const quickActions = [
  { label: "New Chat", icon: MessageSquare, href: "/chat", desc: "Start a conversation" },
  { label: "Run Compare", icon: GitCompare, href: "/compare", desc: "Compare across models" },
  { label: "New Project", icon: FolderPlus, href: "/projects", desc: "Organise your work" },
];

export default function DashboardPage() {
  const pinned = mockProjects.filter((p) => p.pinned);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {mockUser.display_name}.</h1>
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
            <div className="flex gap-4 overflow-x-auto pb-2">
              {pinned.map((p) => (
                <div key={p.id} className="shrink-0 w-64">
                  <ProjectCard {...p} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Activity
            </h2>
            <div className="space-y-0.5">
              {mockActivity.map((a) => {
                const Icon =
                  activityIcons[a.type as ActivityType] ?? MessageSquare;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="rounded-md bg-muted p-1.5 shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.project}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {a.models.slice(0, 2).map((m) => (
                        <Badge
                          key={m}
                          variant="secondary"
                          className="text-xs px-1.5 py-0"
                        >
                          {m.split("-")[0]}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelative(a.updated_at)}
                    </span>
                  </div>
                );
              })}
            </div>
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
                          style={{ width: `${pct}%`, backgroundColor: p.color }}
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
