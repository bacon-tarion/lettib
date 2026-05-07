"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/projects/project-card";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { cn } from "@/lib/utils";

type Filter = "all" | "pinned" | "archived";
const FILTERS: Filter[] = ["all", "pinned", "archived"];

export interface ProjectRow {
  id: string;
  name: string;
  description?: string | null;
  default_ai_team?: string;
  memory_enabled?: boolean;
  pinned?: boolean;
  archived?: boolean;
  updated_at?: string;
  chat_count?: number;
  synthesis_count?: number;
}

export function ProjectsList({ projects }: { projects: ProjectRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase() ?? "").includes(q);
    const matchesFilter =
      filter === "all"
        ? !p.archived
        : filter === "pinned"
        ? !!p.pinned && !p.archived
        : !!p.archived;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Projects</h1>
        <NewProjectDialog />
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-sm">
            {search
              ? "No projects match your search."
              : filter === "archived"
              ? "No archived projects."
              : "No projects yet — create your first one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              {...p}
              description={p.description ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
