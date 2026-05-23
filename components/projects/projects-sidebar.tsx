"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GitCompare,
  GripVertical,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import type { Team } from "@/app/(app)/teams/actions";
import type { ProjectConnection } from "@/lib/projects/default-chat-model-options";

export type SidebarProject = {
  id: string;
  name: string;
  pinned?: boolean;
  color?: string | null;
  icon?: string | null;
};

type RecentItem = {
  id: string;
  title: string;
  mode: "chat" | "compare";
};

interface ProjectsSidebarProps {
  projects: SidebarProject[];
  teams: Team[];
  connections: ProjectConnection[];
  activeProjectId?: string;
}

export function ProjectsSidebar({
  projects: initialProjects,
  teams,
  connections,
  activeProjectId,
}: ProjectsSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [recentByProject, setRecentByProject] = useState<
    Record<string, RecentItem[]>
  >({});
  const [projectOrder, setProjectOrder] = useState(initialProjects);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setProjectOrder(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (activeProjectId) {
      setExpanded((prev) => new Set(prev).add(activeProjectId));
    }
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        initialProjects.slice(0, 20).map(async (p) => {
          try {
            const res = await fetch(
              `/api/conversations?project_id=${p.id}&limit=3`
            );
            const data = await res.json();
            return [p.id, data.conversations ?? []] as const;
          } catch {
            return [p.id, []] as const;
          }
        })
      );
      if (!cancelled) {
        setRecentByProject(Object.fromEntries(entries));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialProjects]);

  const q = search.toLowerCase();
  const pinned = projectOrder.filter(
    (p) => p.pinned && (!q || p.name.toLowerCase().includes(q))
  );
  const rest = projectOrder.filter(
    (p) => !p.pinned && (!q || p.name.toLowerCase().includes(q))
  );
  const ordered = [...pinned, ...rest];

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function persistOrder(ids: string[]) {
    try {
      await fetch("/api/projects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: ids }),
      });
    } catch (err) {
      console.error("[ProjectsSidebar] reorder failed:", err);
    }
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = projectOrder.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    const reordered = ids
      .map((id) => projectOrder.find((p) => p.id === id)!)
      .filter(Boolean);
    setProjectOrder(reordered);
    void persistOrder(ids);
    setDragId(null);
  }

  function renderProject(p: SidebarProject) {
    const isActive = activeProjectId === p.id || pathname === `/projects/${p.id}`;
    const isOpen = expanded.has(p.id);
    const recent = recentByProject[p.id] ?? [];

    return (
      <div key={p.id} className="select-none">
        <div
          draggable
          onDragStart={() => setDragId(p.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(p.id)}
          className={cn(
            "flex items-center gap-1 rounded-md px-1 py-0.5 group",
            isActive && "bg-sidebar-accent"
          )}
        >
          <GripVertical className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 cursor-grab" />
          <button
            type="button"
            className="p-0.5 shrink-0 text-muted-foreground"
            onClick={() => toggleExpand(p.id)}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <Link
            href={`/projects/${p.id}`}
            className={cn(
              "flex-1 flex items-center gap-2 min-w-0 py-1.5 text-sm truncate",
              isActive
                ? "text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
            )}
          >
            <FolderOpen
              className="h-3.5 w-3.5 shrink-0"
              style={p.color ? { color: p.color } : undefined}
            />
            <span className="truncate">{p.name}</span>
          </Link>
        </div>
        {isOpen && recent.length > 0 && (
          <div className="ml-6 pl-2 border-l space-y-0.5 mb-1">
            {recent.map((item) => {
              const Icon = item.mode === "compare" ? GitCompare : MessageSquare;
              return (
                <Link
                  key={item.id}
                  href={`/chat/${item.id}`}
                  className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground truncate"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-full md:w-64 shrink-0 border-r bg-muted/20 flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="p-3 space-y-2 border-b">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Projects</h2>
          <NewProjectDialog
            teams={teams}
            connections={connections}
            trigger={
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {ordered.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-4">No projects found</p>
        ) : (
          ordered.map(renderProject)
        )}
      </div>
      <div className="p-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => router.push("/projects")}
        >
          All projects
        </Button>
      </div>
    </aside>
  );
}
