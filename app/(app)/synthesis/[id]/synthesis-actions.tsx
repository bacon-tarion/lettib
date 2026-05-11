"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Copy,
  RefreshCw,
  FolderInput,
  Link2,
  ThumbsUp,
  ThumbsDown,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REGEN_TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
  { value: "simple", label: "Simple" },
  { value: "persuasive", label: "Persuasive" },
] as const;

interface SynthesisActionsProps {
  synthesisId: string;
  content: string;
  initialScore: number | null;
  initialFeedback: string | null;
  /** Compare conversation — when set, user can regenerate with a new tone. */
  conversationId: string | null;
  initialTone: string;
  projectId?: string | null;
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
  conversationId,
  initialTone,
  projectId,
  shareSlot,
}: SynthesisActionsProps) {
  const router = useRouter();
  const [baselineThumb, setBaselineThumb] = useState<Thumb | null>(
    thumbForScore(initialScore)
  );
  const [baselineFeedback, setBaselineFeedback] = useState<string>(
    initialFeedback ?? ""
  );

  const [thumbs, setThumbs] = useState<Thumb | null>(baselineThumb);
  const [feedback, setFeedback] = useState<string>(baselineFeedback);

  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justSavedAt, setJustSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [regenTone, setRegenTone] = useState(initialTone);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function handleCopyMarkdown() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isDirty = useMemo(
    () => thumbs !== baselineThumb || feedback.trim() !== baselineFeedback.trim(),
    [thumbs, feedback, baselineThumb, baselineFeedback]
  );

  const hasBaseline = baselineThumb !== null;
  const canSubmit = thumbs !== null && (isDirty || !hasBaseline) && !submitting;

  async function handleSubmit() {
    if (!thumbs) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = feedback.trim();
      const res = await fetch(`/api/syntheses/${synthesisId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: thumbs === "up" ? 5 : 1,
          feedback: trimmed || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      setBaselineThumb(thumbs);
      setBaselineFeedback(trimmed);
      setJustSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate() {
    if (!conversationId) return;
    setRegenLoading(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparison_id: conversationId,
          tone: regenTone,
          project_id: projectId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Regenerate failed (${res.status})`);
      router.push(`/synthesis/${data.synthesis_id}`);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenLoading(false);
    }
  }

  const showFeedback = thumbs !== null;

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Rate this synthesis</p>

        <div className="flex gap-2 items-center">
          <Button
            variant={thumbs === "up" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setThumbs("up")}
            disabled={submitting}
          >
            <ThumbsUp className="h-4 w-4" />
            Helpful
          </Button>
          <Button
            variant={thumbs === "down" ? "destructive" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setThumbs("down")}
            disabled={submitting}
          >
            <ThumbsDown className="h-4 w-4" />
            Not helpful
          </Button>
          {hasBaseline && !isDirty && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-green-600" />
              {justSavedAt ? "Saved" : "Rated"}
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
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={5000}
              disabled={submitting}
            />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                {hasBaseline ? "Update rating" : "Submit feedback"}
              </Button>
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-4 border-t">
        <p className="text-sm font-semibold">Actions</p>
        <div className="flex flex-col gap-3 max-w-md">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopyMarkdown}
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy as Markdown"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled title="Coming soon">
              <FolderInput className="h-4 w-4" />
              Save to Project
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled title="Coming soon">
              <Link2 className="h-4 w-4" />
              Share link
            </Button>
          </div>

          {conversationId && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tone for regenerate</Label>
                <Select value={regenTone} onValueChange={setRegenTone}>
                  <SelectTrigger className="w-[200px] h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGEN_TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5 sm:mb-0.5"
                onClick={() => void handleRegenerate()}
                disabled={regenLoading}
              >
                {regenLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Regenerate
              </Button>
            </div>
          )}
          {regenError && (
            <p className="text-xs text-destructive">{regenError}</p>
          )}
        </div>
        {shareSlot}
      </div>
    </>
  );
}
