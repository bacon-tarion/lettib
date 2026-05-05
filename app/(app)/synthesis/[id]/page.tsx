"use client";

import { useState } from "react";
import { Copy, RefreshCw, Palette, Share2, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { mockSyntheses } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const PROVIDER_COLORS: Record<string, string> = {
  "gpt-5.4": "bg-blue-500",
  "claude-opus-4-7": "bg-amber-500",
  "gemini-3.1-pro": "bg-green-500",
  "grok-4.1": "bg-purple-500",
};

export default function SynthesisPage() {
  const synthesis = mockSyntheses[0];

  const [rating, setRating] = useState(synthesis.user_rating);
  const [hovered, setHovered] = useState(0);
  const [thumbs, setThumbs] = useState<"up" | "down" | null>(null);
  const [betterThanBest, setBetterThanBest] = useState<"yes" | "no" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(synthesis.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">LettiB Synthesis</h1>
        <Badge variant="secondary" className="capitalize">
          {synthesis.tone}
        </Badge>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
            Original Question
          </p>
          <p className="text-sm">{synthesis.question}</p>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground self-center">Models used:</span>
        {synthesis.models_used.map((m) => (
          <Badge
            key={m}
            className={cn(
              "text-xs text-white border-0",
              PROVIDER_COLORS[m] ?? "bg-gray-500"
            )}
          >
            {m}
          </Badge>
        ))}
      </div>

      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p className="text-base leading-relaxed">{synthesis.content}</p>
      </div>

      <Separator />

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
            >
              ★
            </button>
          ))}
          {rating > 0 && (
            <span className="text-xs text-muted-foreground ml-2">{rating}/5</span>
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
          <Label className="text-sm">Better than the best individual response?</Label>
          <div className="flex gap-2">
            <Button
              variant={betterThanBest === "yes" ? "default" : "outline"}
              size="sm"
              onClick={() => setBetterThanBest(betterThanBest === "yes" ? null : "yes")}
            >
              Yes
            </Button>
            <Button
              variant={betterThanBest === "no" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setBetterThanBest(betterThanBest === "no" ? null : "no")}
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

        <Button size="sm">Submit Rating</Button>
      </div>

      <Separator />

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
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
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>
    </div>
  );
}
