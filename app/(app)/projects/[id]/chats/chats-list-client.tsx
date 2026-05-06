"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GitCompare, MessageSquare, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getModelDisplayName } from "@/lib/providers/models";
import type { ConversationSummary } from "@/lib/conversations/queries";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ChatsListClientProps {
  conversations: ConversationSummary[];
}

export function ChatsListClient({ conversations }: ChatsListClientProps) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | "chat" | "compare">(
    "all"
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (modeFilter !== "all" && c.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.model ?? "").toLowerCase().includes(q) ||
        (c.provider ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, search, modeFilter]);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
        <div className="text-4xl">💬</div>
        <p className="font-semibold">No conversations yet</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Chats and compare sessions you start in this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, model, or provider…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select
          value={modeFilter}
          onValueChange={(v) => setModeFilter(v as typeof modeFilter)}
        >
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="chat">Chat</SelectItem>
            <SelectItem value="compare">Compare</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No conversations match those filters.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const Icon = c.mode === "compare" ? GitCompare : MessageSquare;
            return (
              <Link key={c.id} href={`/chat/${c.id}`}>
                <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {c.message_count} message
                          {c.message_count === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">
                          ${c.cost_usd.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <div className="flex justify-end gap-1">
                        <Badge
                          variant={c.mode === "compare" ? "default" : "outline"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {c.mode}
                        </Badge>
                        {c.provider && c.model && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {getModelDisplayName(c.provider, c.model)}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.updated_at)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
