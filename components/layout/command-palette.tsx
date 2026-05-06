"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  GitCompare,
  FolderPlus,
  FolderOpen,
  Sparkles,
  Search as SearchIcon,
  Loader2,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  type GroupedSearchResults,
  type SearchResult,
  hrefForResult,
} from "@/lib/search/types";

const TYPE_ICONS = {
  project: FolderOpen,
  conversation: MessageSquare,
  synthesis: Sparkles,
} as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Reset state when palette closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
      setLoading(false);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();
        if (seqRef.current !== seq) return;
        if (res.ok) setResults(data as GroupedSearchResults);
        else setResults(null);
      } catch {
        if (seqRef.current === seq) setResults(null);
      } finally {
        if (seqRef.current === seq) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [query, open]);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
  }

  function viewAllResults() {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const renderGroup = (
    heading: string,
    items: SearchResult[],
  ) => {
    if (items.length === 0) return null;
    return (
      <CommandGroup heading={heading}>
        {items.slice(0, 6).map((r) => {
          const Icon = TYPE_ICONS[r.type];
          return (
            <CommandItem
              key={`${r.type}-${r.id}`}
              value={`${r.type}-${r.id}-${r.title}`}
              onSelect={() => navigate(hrefForResult(r))}
            >
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.title}</p>
                {r.project_name && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.project_name}
                  </p>
                )}
              </div>
            </CommandItem>
          );
        })}
      </CommandGroup>
    );
  };

  const showResults = query.trim().length > 0 && results;
  const hasAnyResult = showResults && results.total > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search projects, conversations, syntheses…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching…
          </div>
        )}

        {!loading && query.trim().length === 0 && (
          <CommandEmpty>Type to search…</CommandEmpty>
        )}

        {!loading && showResults && !hasAnyResult && (
          <CommandEmpty>No results for &ldquo;{query.trim()}&rdquo;.</CommandEmpty>
        )}

        {hasAnyResult && (
          <>
            {renderGroup("Projects", results.projects)}
            {renderGroup("Conversations", results.conversations)}
            {renderGroup("Syntheses", results.syntheses)}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={viewAllResults} value="__view_all__">
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>View all {results.total} results →</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Always-available quick actions */}
        {query.trim().length === 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => navigate("/chat")} value="new-chat">
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>New Chat</span>
              </CommandItem>
              <CommandItem
                onSelect={() => navigate("/compare")}
                value="run-compare"
              >
                <GitCompare className="mr-2 h-4 w-4" />
                <span>Run Compare</span>
              </CommandItem>
              <CommandItem
                onSelect={() => navigate("/projects")}
                value="new-project"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                <span>New Project</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
