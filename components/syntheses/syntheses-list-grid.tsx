import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { getModelDisplayName } from "@/lib/providers/models";

export interface SynthesisListRow {
  id: string;
  prompt: string;
  content: string;
  provider: string | null;
  model: string | null;
  tone: string;
  cost_usd: number;
  source_response_ids: string[];
  score: number | null;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  items: SynthesisListRow[];
}

export function SynthesesListGrid({ items }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map((s) => (
        <Link key={s.id} href={`/synthesis/${s.id}`} className="block">
          <Card className="hover:shadow-sm transition-shadow h-full">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug line-clamp-2">
                  {s.prompt}
                </p>
                {s.score != null && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 text-[11px]"
                  >
                    {s.score >= 4 ? (
                      <ThumbsUp className="h-3 w-3" />
                    ) : s.score <= 2 ? (
                      <ThumbsDown className="h-3 w-3" />
                    ) : null}
                    {s.score}/5
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2">
                {s.content}
              </p>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {s.tone}
                </Badge>
                {s.provider && s.model && (
                  <Badge variant="secondary" className="text-[10px]">
                    {getModelDisplayName(s.provider, s.model)}
                  </Badge>
                )}
                {s.source_response_ids.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {s.source_response_ids.length} sources
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums pt-1 border-t">
                <span>{fmtDate(s.created_at)}</span>
                <span>${s.cost_usd.toFixed(4)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
