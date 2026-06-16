"use client";



import { useState } from "react";

import {

  AlertCircle,

  ExternalLink,

  Loader2,

  Maximize2,

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

  /** Label for the continue-in-chat action (defaults to "Continue in Chat"). */

  continueInChatLabel?: string;

  /** Opens a full-screen focus overlay (grid cards only). */

  onExpand?: () => void;

  /** Removes scroll cap for focus overlay rendering. */

  expanded?: boolean;



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



/**

 * Best-effort interpretation of a failed lane's error message. Returns a

 * short user-facing hint or null if we don't recognize the pattern. The

 * server uses a small set of canonical strings, so this stays simple.

 */

function providerHint(provider: string, error?: string | null): string | null {

  if (!error) return null;

  const e = error.toLowerCase();



  const providerLabel: Record<string, string> = {

    anthropic: "Anthropic",

    openai: "OpenAI",

    google: "Google Gemini",

    xai: "xAI / Grok",

    groq: "Groq",

    custom: "your custom provider",

  };

  const label = providerLabel[provider] ?? provider;



  if (

    e.includes("not connected") ||

    e.includes("add a key") ||

    e.includes("decrypt") ||

    e.includes("empty after decrypt")

  ) {

    return `Add or refresh your ${label} API key in`;

  }

  if (

    e.includes("401") ||

    e.includes("unauthorized") ||

    e.includes("invalid_api_key") ||

    e.includes("invalid api key") ||

    e.includes("permission")

  ) {

    return `Your ${label} key was rejected. Re-paste it in`;

  }

  if (

    e.includes("429") ||

    e.includes("rate limit") ||

    e.includes("rate_limit") ||

    e.includes("quota")

  ) {

    return `${label} rate-limited the request. Wait a moment and click Retry, or check usage limits in`;

  }

  if (

    e.includes("connect") ||

    e.includes("network") ||

    e.includes("etimedout") ||

    e.includes("enotfound")

  ) {

    return `Couldn't reach ${label}. Check connectivity, then verify your key in`;

  }

  if (provider === "google") {

    return "Could not reach Google Gemini. Check your Gemini API key, billing, model access, and quota in";

  }

  if (provider === "xai") {

    return "Could not reach xAI (Grok). Check your xAI API key, model access, and quota in";

  }

  return null;

}



function scoreTone(value: number, invert = false): string {

  const effective = invert ? 11 - value : value;

  if (effective >= 8) {

    return "bg-green-500/15 text-green-400 border-green-500/35";

  }

  if (effective >= 5) {

    return "bg-secondary/15 text-secondary border-secondary/35";

  }

  return "bg-red-500/15 text-red-400 border-red-500/35";

}



const SCORE_METRICS: {

  key: keyof ResponseCardScores;

  label: string;

  short: string;

  invert?: boolean;

}[] = [

  { key: "accuracy", label: "Accuracy", short: "Acc" },

  { key: "clarity", label: "Clarity", short: "Clr" },

  { key: "creativity", label: "Creativity", short: "Cre" },

  { key: "usefulness", label: "Usefulness", short: "Use" },

  { key: "risk", label: "Risk", short: "Risk", invert: true },

];



function ScoreBar({ scores }: { scores: ResponseCardScores }) {

  return (

    <div className="rounded-md border border-border/60 bg-card/50 px-2 py-1.5 space-y-1">

      <div className="flex flex-wrap gap-1">

        {SCORE_METRICS.map(({ key, label, short, invert }) => (

          <span

            key={key}

            className={cn(

              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",

              scoreTone(scores[key], invert)

            )}

            title={

              invert

                ? `${label} (${scores[key]}/10 — higher = more risk)`

                : `${label} (${scores[key]}/10)`

            }

          >

            <span className="opacity-75">{short}</span>

            <span>{scores[key]}</span>

          </span>

        ))}

      </div>

      <p className="text-[9px] text-muted-foreground leading-tight">

        Risk: higher score = more risk

      </p>

    </div>

  );

}



function SynthesisCheckbox({

  checked,

  onChange,

  label,

}: {

  checked: boolean;

  onChange: (next: boolean) => void;

  label: string;

}) {

  return (

    <label className="flex items-center gap-2 text-xs cursor-pointer select-none group">

      <span

        className={cn(

          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",

          checked

            ? "border-primary bg-primary text-primary-foreground"

            : "border-muted-foreground/50 bg-background group-hover:border-primary/50"

        )}

      >

        <input

          type="checkbox"

          className="sr-only"

          checked={checked}

          onChange={(e) => onChange(e.target.checked)}

        />

        {checked && (

          <svg

            viewBox="0 0 12 12"

            className="h-2.5 w-2.5"

            fill="none"

            stroke="currentColor"

            strokeWidth="2"

            aria-hidden

          >

            <path d="M2 6l3 3 5-5" />

          </svg>

        )}

      </span>

      <span className="text-foreground">{label}</span>

    </label>

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

  continueInChatLabel = "Continue in Chat",

  onExpand,

  expanded = false,

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

  const showSelectionControls = !!(useInSynthesis || continueWithModel);



  return (

    <Card className={cn("relative flex flex-col h-full border-l-4", style.border)}>

      {onExpand && !expanded && (

        <Button

          type="button"

          variant="ghost"

          size="icon"

          className="absolute top-2 right-2 h-7 w-7 z-10 opacity-70 hover:opacity-100"

          aria-label="Expand response"

          onClick={onExpand}

        >

          <Maximize2 className="h-3.5 w-3.5" />

        </Button>

      )}

      <CardHeader className={cn("pb-2 space-y-1.5", onExpand && !expanded && "pr-9")}>

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



        {showSelectionControls && (

          <div className="flex flex-col gap-1 pt-1 border-t border-border/50">

            {useInSynthesis && (

              <SynthesisCheckbox

                checked={useInSynthesis.checked}

                onChange={useInSynthesis.onChange}

                label="Use in Synthesis"

              />

            )}

            {continueWithModel && (

              <SynthesisCheckbox

                checked={continueWithModel.checked}

                onChange={continueWithModel.onChange}

                label="Continue in next round"

              />

            )}

          </div>

        )}



        {scores && <ScoreBar scores={scores} />}

      </CardHeader>



      <CardContent

        className={cn(

          "flex-1 overflow-y-auto space-y-2",

          !expanded && "max-h-72"

        )}

      >

        {status === "error" ? (

          <div className="space-y-3">

            <div className="flex items-start gap-2 text-sm text-destructive">

              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />

              <span className="leading-relaxed">{error || "Request failed"}</span>

            </div>

            {providerHint(provider, error) && (

              <p className="text-xs text-muted-foreground leading-relaxed">

                {providerHint(provider, error)}{" "}

                <a

                  href="/settings"

                  className="underline underline-offset-2 inline-flex items-center gap-0.5"

                >

                  Settings

                  <ExternalLink className="h-3 w-3" />

                </a>

              </p>

            )}

            <p className="text-[11px] text-muted-foreground">

              This lane has been removed from the next round and from

              Synthesis. Click <strong>Retry model</strong> to bring it

              back.

            </p>

            {onRetry && (

              <Button

                type="button"

                variant="outline"

                size="sm"

                className="gap-1.5"

                onClick={onRetry}

              >

                <RotateCcw className="h-3.5 w-3.5" />

                Retry model

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

        ) : status === "done" ? (

          <p className="text-sm text-muted-foreground italic">

            No text returned by this model.

          </p>

        ) : (

          <p className="text-sm text-muted-foreground italic">

            {status === "pending" ? "Waiting…" : "Connecting…"}

          </p>

        )}



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

                {continueInChatLabel}

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

