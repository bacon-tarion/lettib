"use client";

import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LineageSentence } from "@/lib/synthesis/lineage";

interface Props {
  content: string;
  lineage: LineageSentence[];
}

const SLUG_BG: Record<string, string> = {
  claude: "bg-blue-500/15 hover:bg-blue-500/25 border-b border-blue-500/40",
  gpt: "bg-green-500/15 hover:bg-green-500/25 border-b border-green-500/40",
  gemini:
    "bg-orange-500/15 hover:bg-orange-500/25 border-b border-orange-500/40",
  groq: "bg-purple-500/15 hover:bg-purple-500/25 border-b border-purple-500/40",
  grok: "bg-red-500/15 hover:bg-red-500/25 border-b border-red-500/40",
  synth: "bg-muted/50 hover:bg-muted border-b border-muted-foreground/20",
};

const SLUG_DOT: Record<string, string> = {
  claude: "bg-blue-500",
  gpt: "bg-green-500",
  gemini: "bg-orange-500",
  groq: "bg-purple-500",
  grok: "bg-red-500",
  synth: "bg-muted-foreground/40",
};

const SLUG_LABEL: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  groq: "Groq",
  grok: "Grok",
  synth: "Synthesizer",
};

export function LineageView({ content, lineage }: Props) {
  const [showLineage, setShowLineage] = useState(true);

  const usedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineage) set.add(l.model);
    return Array.from(set);
  }, [lineage]);

  const hasLineage = lineage.length > 0;

  if (!hasLineage) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p className="text-base leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="lineage-toggle"
            checked={showLineage}
            onCheckedChange={setShowLineage}
          />
          <Label htmlFor="lineage-toggle" className="text-sm cursor-pointer">
            Show lineage
          </Label>
        </div>
        {showLineage && (
          <div className="flex gap-1.5 flex-wrap">
            {usedSlugs.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="text-xs font-normal gap-1.5"
              >
                <span
                  className={cn("h-2 w-2 rounded-full", SLUG_DOT[s] ?? "bg-muted-foreground")}
                />
                {SLUG_LABEL[s] ?? s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="prose prose-sm max-w-none dark:prose-invert">
        {showLineage ? (
          <p className="text-base leading-relaxed">
            {lineage.map((l, i) => (
              <span
                key={i}
                title={`Source: ${SLUG_LABEL[l.model] ?? l.model}`}
                className={cn(
                  "transition-colors px-0.5 cursor-help",
                  SLUG_BG[l.model] ?? SLUG_BG.synth
                )}
              >
                {l.sentence}
                {i < lineage.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        ) : (
          <p className="text-base leading-relaxed whitespace-pre-wrap">
            {lineage.map((l) => l.sentence).join(" ")}
          </p>
        )}
      </div>
    </div>
  );
}
