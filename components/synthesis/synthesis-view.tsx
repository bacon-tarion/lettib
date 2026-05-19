"use client";

import { useState } from "react";
import { Layers, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SynthesisMarkdown } from "@/components/synthesis/synthesis-markdown";

type ViewMode = "detailed" | "clean";

interface Props {
  detailedContent: string;
  cleanContent: string | null;
}

/**
 * Synthesis output with a Detailed / Clean toggle.
 *
 * - Detailed (default): renders the attributed multi-section synthesis with
 *   attribution badges, "Areas of Agreement / Disagreement", and "Key Points".
 * - Clean: renders the second-pass prose rewrite — no badges, no model tags,
 *   no comparison sections; just a single flowing answer.
 *
 * Both versions are fetched on the server in one shot and persisted on the
 * synthesis row, so toggling swaps content instantly without re-fetching.
 */
export function SynthesisView({ detailedContent, cleanContent }: Props) {
  const hasClean = typeof cleanContent === "string" && cleanContent.trim().length > 0;
  const [mode, setMode] = useState<ViewMode>("detailed");
  const active = mode === "clean" && hasClean ? "clean" : "detailed";
  const body = active === "clean" ? (cleanContent as string) : detailedContent;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Merged answer
        </p>
        <div
          role="group"
          aria-label="Synthesis view mode"
          className={cn(
            "inline-flex rounded-md border border-input bg-background p-0.5 shadow-sm"
          )}
        >
          <Button
            type="button"
            size="sm"
            variant={active === "detailed" ? "default" : "ghost"}
            className={cn(
              "h-7 gap-1.5 rounded-sm px-2.5 text-xs",
              active === "detailed" ? "shadow-sm" : "text-muted-foreground"
            )}
            aria-pressed={active === "detailed"}
            onClick={() => setMode("detailed")}
          >
            <Layers className="h-3.5 w-3.5" />
            Detailed
          </Button>
          <Button
            type="button"
            size="sm"
            variant={active === "clean" ? "default" : "ghost"}
            className={cn(
              "h-7 gap-1.5 rounded-sm px-2.5 text-xs",
              active === "clean" ? "shadow-sm" : "text-muted-foreground"
            )}
            aria-pressed={active === "clean"}
            onClick={() => setMode("clean")}
            disabled={!hasClean}
            title={hasClean ? undefined : "Clean view unavailable for this synthesis"}
          >
            <AlignLeft className="h-3.5 w-3.5" />
            Clean
          </Button>
        </div>
      </div>

      <SynthesisMarkdown content={body} />
    </div>
  );
}
