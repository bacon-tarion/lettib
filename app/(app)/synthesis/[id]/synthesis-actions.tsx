"use client";

import { useState } from "react";
import { ReactNode } from "react";
import {
  Copy,
  RefreshCw,
  Palette,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface SynthesisActionsProps {
  content: string;
  shareSlot?: ReactNode;
}

export function SynthesisActions({ content, shareSlot }: SynthesisActionsProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [thumbs, setThumbs] = useState<"up" | "down" | null>(null);
  const [betterThanBest, setBetterThanBest] = useState<"yes" | "no" | null>(
    null
  );
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm font-semibold">Rate this synthesis</p>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className={cn(
                "text-2xl transition-colors",
                star <= (hovered || rating)
                  ? "text-yellow-400"
                  : "text-muted-foreground/30"
              )}
              aria-label={`Rate ${star} stars`}
            >
              ★
            </button>
          ))}
          {rating > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {rating}/5
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={thumbs === "up" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setThumbs(thumbs === "up" ? null : "up")}
          >
            <ThumbsUp className="h-4 w-4" />
            Helpful
          </Button>
          <Button
            variant={thumbs === "down" ? "destructive" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setThumbs(thumbs === "down" ? null : "down")}
          >
            <ThumbsDown className="h-4 w-4" />
            Not helpful
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">
            Better than the best individual response?
          </Label>
          <div className="flex gap-2">
            <Button
              variant={betterThanBest === "yes" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setBetterThanBest(betterThanBest === "yes" ? null : "yes")
              }
            >
              Yes
            </Button>
            <Button
              variant={betterThanBest === "no" ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                setBetterThanBest(betterThanBest === "no" ? null : "no")
              }
            >
              No
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Feedback (optional)</Label>
          <Textarea
            placeholder="What could be improved?"
            className="resize-none h-20 text-sm"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>

        <Button size="sm" disabled>
          Submit Rating
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap pt-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleCopy}
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <RefreshCw className="h-4 w-4" />
          Regenerate
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Palette className="h-4 w-4" />
          Change Tone
        </Button>
        {shareSlot}
      </div>
    </>
  );
}
