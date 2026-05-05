"use client";

import { usePathname } from "next/navigation";
import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/compare": "Compare",
  "/chat": "Chat",
  "/teams": "Teams",
  "/usage": "Usage",
  "/settings": "Settings",
  "/admin": "Admin",
};

export function Header() {
  const pathname = usePathname();
  const title =
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] ?? "LettiB";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 gap-3">
      <Button variant="ghost" size="icon" className="md:hidden shrink-0">
        <Menu className="h-5 w-5" />
      </Button>
      <span className="text-sm font-semibold flex-1 md:flex-none">{title}</span>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground ml-auto"
        onClick={() => {
          const event = new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            bubbles: true,
          });
          document.dispatchEvent(event);
        }}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">Search</span>
        <kbd className="hidden sm:inline pointer-events-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}
