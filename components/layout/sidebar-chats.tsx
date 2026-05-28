"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type StandaloneChat = {
  id: string;
  title: string;
  mode: "chat" | "compare";
  updated_at: string;
};

export function SidebarChats() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("conversation");
  const [chats, setChats] = useState<StandaloneChat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations?standalone=true&mode=chat&limit=8")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setChats(data.conversations ?? []);
      })
      .catch((err) => {
        console.error("[SidebarChats] load failed:", err);
        if (!cancelled) setChats([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, activeConversationId]);

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Chats
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
          <Link href="/chat" aria-label="New chat">
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      {loading ? (
        <p className="px-3 text-xs text-muted-foreground">Loading…</p>
      ) : chats.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">No standalone chats</p>
      ) : (
        <div className="space-y-0.5">
          {chats.map((c) => {
            const active =
              pathname === "/chat" && activeConversationId === c.id;
            return (
              <Link
                key={c.id}
                href={`/chat?conversation=${c.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors truncate",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate">{c.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
