"use client";

import { useState } from "react";
import { ReactNode } from "react";
import {
  Copy,
  RefreshCw,
  Palette,
  ThumbsUp,
  ThumbsDown,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SynthesisActionsProps {
  synthesisId: string;
  content: string;
  initialScore: number | null;
  initialFeedback: string | null;
  shareSlot?: ReactNode;
}

type Thumb = "up" | "down";

function thumbForScore(score: number | null): Thumb | null {
  if (score == null) return null;
  return score >= 4 ? "up" : "down";
}

export function SynthesisActions({
  synthesisId,
  content,
  initialScore,
  initialFeedback,
  shareSlot,
}: SynthesisActionsProps) {
  const [thumbs, setThumbs] = useState<Thumb | null>(thumbForScore(initialScore));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<number | null>(
    initialScore != null ? Date.now() : null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function pickThumb(t: Thumb) {
    setThumbs(t);
    setSubmittedAt(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!thumbs) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/syntheses/${synthesisId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: thumbs === "up" ? 5 : 1,
          feedback: feedback.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      setSubmittedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  }

  const showFeedback = thumbs !== null;
  const isRated = submittedAt !== null;

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Rate this synthesis</p>

        <div className="flex gap-2 items-center">
          <Button
            variant={thumbs === "up" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => pickThumb("up")}
            disabled={submitting}
          >
            <ThumbsUp className="h-4 w-4" />
            Helpful
          </Button>
          <Button
            variant={thumbs === "down" ? "destructive" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => pickThumb("down")}
            disabled={submitting}
          >
            <ThumbsDown className="h-4 w-4" />
            Not helpful
          </Button>
          {isRated && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-green-600" />
              Rated
            </span>
          )}
        </div>

        {showFeedback && (
          <div className="space-y-2 max-w-xl">
            <Label className="text-xs text-muted-foreground">
              Feedback (optional)
            </Label>
            <Textarea
              placeholder={
                thumbs === "up"
                  ? "What worked well?"
                  : "What could be improved?"
              }
              className="resize-none h-20 text-sm"
              value={feedback}
              onChange={(e) => {
                setFeedback(e.target.value);
                if (isRated) setSubmittedAt(null);
              }}
              maxLength={5000}
              disabled={submitting}
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || isRated}
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                {isRated ? "Submitted" : "Submit feedback"}
              </Button>
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          </div>
        )}
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
