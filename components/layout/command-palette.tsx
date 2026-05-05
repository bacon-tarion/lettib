"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, GitCompare, FolderPlus, Sparkles, FolderOpen } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { mockProjects, mockActivity } from "@/lib/mockData";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
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

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
  }

  const activityIcon = (type: string) => {
    if (type === "synthesis") return Sparkles;
    if (type === "compare") return GitCompare;
    return MessageSquare;
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search projects, chats, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Projects">
          {mockProjects.map((p) => {
            return (
              <CommandItem key={p.id} onSelect={() => navigate(`/projects/${p.id}`)}>
                <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{p.name}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Recent">
          {mockActivity.slice(0, 3).map((a) => {
            const Icon = activityIcon(a.type);
            return (
              <CommandItem key={a.id} onSelect={() => navigate("/chat")}>
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{a.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => navigate("/chat")}>
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>New Chat</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/compare")}>
            <GitCompare className="mr-2 h-4 w-4" />
            <span>Run Compare</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/projects")}>
            <FolderPlus className="mr-2 h-4 w-4" />
            <span>New Project</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
