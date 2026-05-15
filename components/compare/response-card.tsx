"use client";

import { useState } from "react";
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Scale,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PROVIDER_STYLES: Record<
  string,
  { border: string; bg: string; initial: string }
> = {
  anthropic: { border: "border-l-amber-500", bg: "bg-amber-500", initial: "A" },
  openai: { border: "border-l-blue-500", bg: "bg-blue-500", initial: "O" },
  google: { border: "border-l-green-500", bg: "bg-green-500", initial: "G" },
  xai: { border: "border-l-purple-500", bg: "bg-purple-500", initial: "X" },
  groq: { border: "border-l-orange-500", bg: "bg-orange-500", initial: "Q" },
  custom: { border: "border-l-gray-500", bg: "bg-gray-500", initial: "C" },
};

export type ResponseCardScores = {
  accuracy: number;
  clarity: number;
  creativity: number;
  usefulness: number;
  risk: number;
};

export interface ResponseCardProps {
  provider: string;
  providerLabel: string;
  model: string;
  modelLabel: string;
  content: string;
  status: "pending" | "streaming" | "done" | "error";
  error?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  latencyMs?: number;
  scores?: ResponseCardScores | null;
  /**
   * Marks this card as part of an "Ask this model" isolated branch. Lets
   * the UI label the round and disable the per-model "Continue" toggle
   * (Continue is a session-wide flag; branches don't affect it).
   */
  isBranch?: boolean;
  onRetry?: () => void;
  /** Opens a new Chat tab with this model and the compare thread (parent gates visibility). */
  onContinueInChat?: () => void;

  // ─── Session 11: per-model / per-response controls ─────────────────────
  /** Shown only on the LATEST card per model (parent decides). */
  continueWithModel?: {
    checked: boolean;
    onChange: (next: boolean) => void;
  };
  /** Per-response selection that drives `Use in Synthesis` + `Grade selected`. */
  useInSynthesis?: {
    checked: boolean;
    onChange: (next: boolean) => void;
  };
  /** "Ask this model" — inline composer. Latest card per model only. */
  askThisModel?: {
    onSubmit: (prompt: string) => void | Promise<void>;
    isStreaming: boolean;
  };
  /** "Grade answer" — runs scoring on this single response. */
  grade?: {
    onClick: () => void | Promise<void>;
    isGrading: boolean;
  };
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 8
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : value >= 5
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400";
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums",
        tone
      )}
      title={label}
    >
      {label[0].toUpperCase()} {value}
    </span>
  );
}

export function ResponseCard({
  provider,
  providerLabel,
  model,
  modelLabel,
  content,
  status,
  error,
  tokensIn = 0,
  tokensOut = 0,
  cost = 0,
  latencyMs,
  scores,
  isBranch = false,
  onRetry,
  onContinueInChat,
  continueWithModel,
  useInSynthesis,
  askThisModel,
  grade,
}: ResponseCardProps) {
  const style = PROVIDER_STYLES[provider] ?? {
    border: "border-l-gray-400",
    bg: "bg-gray-400",
    initial: "?",
  };
  const totalTokens = tokensIn + tokensOut;
  const statusLabel =
    status === "streaming"
      ? "Streaming"
      : status === "done"
        ? "Complete"
        : status === "error"
          ? "Error"
          : "Waiting";

  const [askDraft, setAskDraft] = useState("");
  const [askOpen, setAskOpen] = useState(false);

  const isDone = status === "done" && !!content.trim();
  const isInteractive = isDone;

  return (
    <Card className={cn("flex flex-col h-full border-l-4", style.border)}>
      <CardHeader className="pb-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
              style.bg
            )}
          >
            {style.initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">
              {providerLabel}
            </p>
            <span className="text-sm font-medium block truncate" title={model}>
              {modelLabel}
            </span>
          </div>
          {status === "streaming" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
          {status === "done" && latencyMs !== undefined && (
            <Badge variant="secondary" className="text-xs shrink-0 tabular-nums">
              {latencyMs}ms
            </Badge>
          )}
          {status === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={
              status === "error"
                ? "destructive"
                : status === "done"
                  ? "default"
                  : "secondary"
            }
            className="text-[10px] w-fit font-normal"
          >
            {statusLabel}
          </Badge>
          {isBranch && (
            <Badge
              variant="outline"
              className="text-[10px] w-fit font-normal border-dashed"
              title="This response was generated in an isolated 'Ask this model' branch — peers were not consulted."
            >
              Solo follow-up
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto max-h-72 space-y-2">
        {status === "error" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="leading-relaxed">{error || "Request failed"}</span>
            </div>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onRetry}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry this model
              </Button>
            )}
          </div>
        ) : content ? (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {content}
            {status === "streaming" && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-muted-foreground/60 animate-pulse align-middle" />
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {status === "pending" ? "Waiting…" : "Connecting…"}
          </p>
        )}

        {scores && (
          <div className="flex flex-wrap gap-1 pt-2 border-t">
            <ScoreChip label="Accuracy" value={scores.accuracy} />
            <ScoreChip label="Clarity" value={scores.clarity} />
            <ScoreChip label="Creativity" value={scores.creativity} />
            <ScoreChip label="Usefulness" value={scores.usefulness} />
            <ScoreChip label="Risk" value={scores.risk} />
          </div>
        )}

        {/* ── Session 11 controls — only meaningful once the response is done. */}
        {isInteractive && (useInSynthesis || continueWithModel) && (
          <div className="pt-2 border-t flex flex-col gap-1.5">
            {useInSynthesis && (
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground"
                  checked={useInSynthesis.checked}
                  onChange={(e) => useInSynthesis.onChange(e.target.checked)}
                />
                <span className="text-foreground">Use in Synthesis</span>
              </label>
            )}
            {continueWithModel && (
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground"
                  checked={continueWithModel.checked}
                  onChange={(e) => continueWithModel.onChange(e.target.checked)}
                />
                <span className="text-foreground">Continue with this model</span>
              </label>
            )}
          </div>
        )}

        {/* Action row */}
        {isInteractive && (grade || askThisModel || onContinueInChat) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {grade && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 px-2 text-xs"
                onClick={() => void grade.onClick()}
                disabled={grade.isGrading}
              >
                {grade.isGrading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Scale className="h-3 w-3" />
                )}
                Grade answer
              </Button>
            )}
            {askThisModel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 px-2 text-xs"
                onClick={() => setAskOpen((v) => !v)}
                disabled={askThisModel.isStreaming}
              >
                <Sparkles className="h-3 w-3" />
                {askOpen ? "Close" : "Ask this model"}
              </Button>
            )}
            {onContinueInChat && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7 px-2 text-xs"
                onClick={onContinueInChat}
              >
                <MessageSquare className="h-3 w-3" />
                Continue in Chat
              </Button>
            )}
          </div>
        )}

        {askThisModel && askOpen && (
          <div className="space-y-2 pt-2">
            <Textarea
              placeholder="Ask only this model a follow-up — its peers won't see it."
              className="resize-none min-h-[60px] text-xs"
              value={askDraft}
              onChange={(e) => setAskDraft(e.target.value)}
              disabled={askThisModel.isStreaming}
            />
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setAskDraft("");
                  setAskOpen(false);
                }}
                disabled={askThisModel.isStreaming}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={!askDraft.trim() || askThisModel.isStreaming}
                onClick={async () => {
                  const text = askDraft.trim();
                  if (!text) return;
                  setAskDraft("");
                  setAskOpen(false);
                  await askThisModel.onSubmit(text);
                }}
              >
                {askThisModel.isStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Send
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t pt-3">
        <div className="flex flex-col gap-0.5 w-full text-xs text-muted-foreground tabular-nums">
          <div className="flex items-center justify-between w-full">
            <span>
              {totalTokens > 0
                ? `${tokensIn} in · ${tokensOut} out`
                : "—"}
            </span>
            <span>{cost > 0 ? `$${cost.toFixed(5)}` : "—"}</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
