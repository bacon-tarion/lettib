import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background px-4">
      <span className="text-lg font-semibold tracking-tight">LettiB</span>
      <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline text-sm">Search</span>
        <kbd className="hidden sm:inline pointer-events-none select-none rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}
