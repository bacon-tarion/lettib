"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface Props {
  initialQuery: string;
}

export function SynthesesSearch({ initialQuery }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 max-w-md">
      <div className="relative flex-1">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search prompts and content…"
          className="h-9 pl-8"
        />
      </div>
      <Button type="submit" size="sm">
        Search
      </Button>
      {initialQuery && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.push("?");
          }}
        >
          Clear
        </Button>
      )}
    </form>
  );
}
