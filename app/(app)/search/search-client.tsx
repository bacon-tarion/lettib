"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, FolderOpen, MessageSquare, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  type GroupedSearchResults,
  type SearchResult,
  hrefForResult,
} from "@/lib/search/types";

const ICONS = {
  project: FolderOpen,
  conversation: MessageSquare,
  synthesis: Sparkles,
} as const;

const LABELS = {
  project: "Project",
  conversation: "Conversation",
  synthesis: "Synthesis",
} as const;

function formatRelative(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface SearchClientProps {
  initialQuery: string;
}

export function SearchClient({ initialQuery }: SearchClientProps) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") ?? initialQuery;

  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState<GroupedSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // React to back/forward navigation changing ?q=
  useEffect(() => {
    const incoming = searchParams.get("q") ?? "";
    setQuery((prev) => (prev === incoming ? prev : incoming));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced search + URL sync. Always invalidate any in-flight request first
  // by bumping seqRef so stale responses can never write back.
  useEffect(() => {
    const seq = ++seqRef.current;
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      setResults(null);
      setLoading(false);
      setError(null);
      const url = new URL(window.location.href);
      if (url.searchParams.get("q")) {
        url.searchParams.delete("q");
        window.history.replaceState(null, "", url.pathname);
      }
      return;
    }

    setLoading(true);
    setError(null);
    const controller = new AbortController();

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (seqRef.current !== seq) return;
        const data = await res.json();
        if (seqRef.current !== seq) return;
        if (!res.ok) {
          setError(data.error || "Search failed");
          setResults(null);
        } else {
          setResults(data as GroupedSearchResults);
        }
        const url = new URL(window.location.href);
        url.searchParams.set("q", trimmed);
        window.history.replaceState(null, "", url.toString());
      } catch (e) {
        if (seqRef.current !== seq) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (seqRef.current === seq) setLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">
          Search across your projects, conversations, and syntheses.
        </p>
      </div>

      <form onSubmit={onSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, conversations, syntheses…"
          className="pl-9 pr-10 h-11 text-base"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!query.trim() && (
        <div className="rounded-lg border border-dashed py-12 text-center space-y-2">
          <Search className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Start typing to search.
          </p>
        </div>
      )}

      {query.trim() && results && results.total === 0 && !loading && (
        <div className="rounded-lg border border-dashed py-12 text-center space-y-2">
          <p className="text-sm font-medium">
            No results for &ldquo;{results.query}&rdquo;
          </p>
          <p className="text-xs text-muted-foreground">
            Try a different keyword or check your spelling.
          </p>
        </div>
      )}

      {query.trim() && results && results.total > 0 && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {results.total} result{results.total === 1 ? "" : "s"} for &ldquo;
            {results.query}&rdquo;
          </p>
          <ResultGroup
            heading="Projects"
            results={results.projects}
            type="project"
          />
          <ResultGroup
            heading="Conversations"
            results={results.conversations}
            type="conversation"
          />
          <ResultGroup
            heading="Syntheses"
            results={results.syntheses}
            type="synthesis"
          />
        </div>
      )}
    </>
  );
}

function ResultGroup({
  heading,
  results,
  type,
}: {
  heading: string;
  results: SearchResult[];
  type: keyof typeof ICONS;
}) {
  if (results.length === 0) return null;
  const Icon = ICONS[type];
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {heading} ({results.length})
      </h2>
      <div className="space-y-1">
        {results.map((r) => (
          <Link
            key={`${r.type}-${r.id}`}
            href={hrefForResult(r)}
            className="flex items-start gap-3 rounded-lg border px-3 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className="rounded-md bg-muted p-1.5 shrink-0 mt-0.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {LABELS[r.type]}
                </Badge>
              </div>
              {r.snippet && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {r.snippet}
                </p>
              )}
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                {r.project_name && <span>📁 {r.project_name}</span>}
                {formatRelative(r.updated_at) && (
                  <span>{formatRelative(r.updated_at)}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
