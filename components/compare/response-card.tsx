import { AlertCircle, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  onRetry?: () => void;
  /** Opens a new Chat tab with this model and the compare thread (parent gates visibility). */
  onContinueInChat?: () => void;
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
  onRetry,
  onContinueInChat,
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

        {status === "done" && content.trim() && onContinueInChat && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-1.5 mt-1"
            onClick={onContinueInChat}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Continue in Chat
          </Button>
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
