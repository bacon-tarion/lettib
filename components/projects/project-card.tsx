import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  default_ai_team?: string;
  memory_enabled?: boolean;
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
  memory_enabled,
  chat_count = 0,
  synthesis_count = 0,
  updated_at,
}: ProjectCardProps) {
  return (
    <Link href={`/projects/${id}`} className="block h-full">
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{name}</CardTitle>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1.5">
            {default_ai_team && (
              <Badge variant="secondary" className="text-xs">
                {default_ai_team}
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
