"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/compare": "Compare",
  "/chat": "Chat",
  "/teams": "Teams",
  "/usage": "Usage",
  "/settings": "Settings",
  "/admin": "Admin",
  "/search": "Search",
};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const title =
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] ?? "LettiB";

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  function openCommand() {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setExpanded(false);
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 gap-3">
      <Button variant="ghost" size="icon" className="md:hidden shrink-0">
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold flex-1 md:flex-none">{title}</span>

      {expanded ? (
        <form onSubmit={onSubmit} className="ml-auto relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => {
              if (query.trim().length === 0) setExpanded(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setExpanded(false);
                setQuery("");
              }
            }}
            placeholder="Search and press Enter…"
            className="pl-8 h-8 text-xs"
            autoComplete="off"
          />
        </form>
      ) : (
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Search</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hidden sm:inline-flex"
            onClick={openCommand}
            title="Command palette"
          >
            <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              ⌘K
            </kbd>
          </Button>
        </div>
      )}
    </header>
  );
}
