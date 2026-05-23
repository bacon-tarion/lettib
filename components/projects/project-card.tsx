"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
import { togglePin } from "@/app/(app)/projects/actions";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  default_ai_team?: string;
  default_team_display?: string;
  memory_enabled?: boolean;
  pinned?: boolean;
  chat_count?: number;
  synthesis_count?: number;
  updated_at?: string;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectCard({
  id,
  name,
  description,
  default_ai_team,
  default_team_display,
  memory_enabled,
  pinned = false,
  chat_count = 0,
  synthesis_count = 0,
  updated_at,
}: ProjectCardProps) {
  const router = useRouter();
  const [pinning, setPinning] = useState(false);

  async function handleTogglePin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pinning) return;
    setPinning(true);
    try {
      await togglePin(id, !pinned);
      router.refresh();
    } finally {
      setPinning(false);
    }
  }

  return (
    <Link href={`/projects/${id}`} className="block h-full group">
      <Card className="h-full hover:shadow-md hover:bg-elevated transition-colors cursor-pointer relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8 z-10 opacity-70 hover:opacity-100"
          disabled={pinning}
          aria-label={pinned ? "Unpin project" : "Pin project"}
          onClick={handleTogglePin}
        >
          <Star
            className={cn(
              "h-4 w-4",
              pinned ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
            )}
          />
        </Button>
        <CardHeader className="pb-2 pr-10">
          <CardTitle className="text-base">{name}</CardTitle>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1.5">
            {(default_team_display ||
              (default_ai_team && default_ai_team !== "solo")) && (
              <Badge variant="secondary" className="text-xs">
                {default_team_display ?? default_ai_team}
              </Badge>
            )}
            <Badge
              variant={memory_enabled ? "default" : "outline"}
              className="text-xs gap-1"
            >
              <Brain className="h-3 w-3" />
              {memory_enabled ? "Memory On" : "Memory Off"}
            </Badge>
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <div className="flex justify-between w-full text-xs text-muted-foreground">
            <span>
              {chat_count} chats · {synthesis_count} syntheses
            </span>
            {updated_at && <span>{formatDate(updated_at)}</span>}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
