"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Loader2,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getProviderLabel } from "@/lib/providers/models";
import { cn } from "@/lib/utils";

export type CompareHistoryEntry = {
  id: string;
  title: string;
  mode: "compare";
  pinned: boolean;
  updated_at: string;
  created_at: string;
  round_count: number;
  models: { provider: string; model: string }[];
};

type DateGroup = "Today" | "Yesterday" | "Last 7 days" | "Last 30 days" | "Older";

function dateGroup(iso: string): DateGroup {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const diff = now - t;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return "Last 7 days";
  if (diff < 30 * day) return "Last 30 days";
  return "Older";
}

const GROUP_ORDER: DateGroup[] = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "Older",
];

interface CompareHistorySidebarProps {
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function CompareHistorySidebar({
  activeId,
  collapsed,
  onToggleCollapsed,
}: CompareHistorySidebarProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<CompareHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations?mode=compare&limit=200");
      const data = await res.json();
      if (res.ok) {
        setEntries((data.conversations ?? []) as CompareHistoryEntry[]);
      }
    } catch (err) {
      console.error("[compare/history] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? entries.filter((e) => e.title.toLowerCase().includes(q))
      : entries;
    const pinned = list.filter((e) => e.pinned);
    const unpinned = list.filter((e) => !e.pinned);
    return [...pinned, ...unpinned];
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const map = new Map<DateGroup, CompareHistoryEntry[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const e of filtered) {
      if (e.pinned) continue;
      const g = dateGroup(e.updated_at);
      map.get(g)?.push(e);
    }
    return map;
  }, [filtered]);

  async function togglePin(id: string, pinned: boolean) {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (res.ok) void load();
    } catch (err) {
      console.error("[compare/history] pin failed:", err);
    }
  }

  async function softDelete(id: string) {
    if (!confirm("Delete this compare session?")) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (activeId === id) router.push("/compare");
        void load();
      }
    } catch (err) {
      console.error("[compare/history] delete failed:", err);
    }
  }

  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col border-r bg-muted/20 w-10 shrink-0 items-center py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleCollapsed}
          aria-label="Expand compare history"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="hidden md:flex flex-col border-r bg-muted/20 w-72 shrink-0 max-h-[calc(100vh-4rem)]">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Compare history
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter compares…"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filtered.filter((e) => e.pinned).length > 0 && (
          <section className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1">
              Pinned
            </p>
            {filtered
              .filter((e) => e.pinned)
              .map((e) => (
                <HistoryRow
                  key={e.id}
                  entry={e}
                  active={e.id === activeId}
                  onPin={() => togglePin(e.id, e.pinned)}
                  onDelete={() => softDelete(e.id)}
                />
              ))}
          </section>
        )}

        {GROUP_ORDER.map((group) => {
          const items = grouped.get(group) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={group} className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1">
                {group}
              </p>
              {items.map((e) => (
                <HistoryRow
                  key={e.id}
                  entry={e}
                  active={e.id === activeId}
                  onPin={() => togglePin(e.id, e.pinned)}
                  onDelete={() => softDelete(e.id)}
                />
              ))}
            </section>
          );
        })}

        {!loading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No compare sessions yet.
          </p>
        )}
      </div>
    </aside>
  );
}

function HistoryRow({
  entry,
  active,
  onPin,
  onDelete,
}: {
  entry: CompareHistoryEntry;
  active: boolean;
  onPin: () => void;
  onDelete: () => void;
}) {
  const title =
    entry.title.length > 60 ? `${entry.title.slice(0, 57)}…` : entry.title;
  const uniqueProviders = Array.from(
    new Set(entry.models.map((m) => m.provider))
  ).slice(0, 4);

  return (
    <div
      className={cn(
        "group rounded-md border px-2 py-2 text-xs hover:bg-muted/60 transition-colors",
        active && "border-primary bg-primary/5"
      )}
    >
      <Link href={`/compare?c=${entry.id}`} className="block space-y-1.5">
        <div className="flex items-start gap-1.5">
          <GitCompare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="font-medium line-clamp-2 leading-snug">{title}</p>
        </div>
        <div className="flex flex-wrap gap-1 pl-5">
          {uniqueProviders.map((p) => (
            <Badge key={p} variant="outline" className="text-[9px] px-1 py-0">
              {getProviderLabel(p)}
            </Badge>
          ))}
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            {entry.round_count} round{entry.round_count === 1 ? "" : "s"}
          </Badge>
        </div>
      </Link>
      <div className="flex justify-end gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(ev) => {
            ev.preventDefault();
            onPin();
          }}
          aria-label={entry.pinned ? "Unpin" : "Pin"}
        >
          {entry.pinned ? (
            <PinOff className="h-3 w-3" />
          ) : (
            <Pin className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive"
          onClick={(ev) => {
            ev.preventDefault();
            onDelete();
          }}
          aria-label="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
