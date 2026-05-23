"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Sparkles, ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClearableTextarea } from "@/components/ui/clearable-textarea";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RestoreSessionBanner } from "@/components/session/restore-session-banner";
import {
  LETTIB_STATE_MANUAL_COMPARE,
  SESSION_STATE_TTL_MS,
} from "@/lib/session/keys";
import {
  FileAttachments,
  type AttachedFile,
  buildFileContextText,
  getImageAttachments,
} from "@/components/chat/file-attachments";

const SOURCE_OPTIONS = [
  { value: "ChatGPT", label: "ChatGPT" },
  { value: "Claude", label: "Claude" },
  { value: "Gemini", label: "Gemini" },
  { value: "Grok", label: "Grok" },
  { value: "Groq", label: "Groq" },
  { value: "Perplexity", label: "Perplexity" },
  { value: "Custom", label: "Custom" },
] as const;

type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];

const TONE_OPTIONS = [
  "professional",
  "casual",
  "concise",
  "detailed",
  "academic",
] as const;

interface PasteBox {
  id: string;
  source: SourceValue;
  customName: string;
  content: string;
}

const MAX_BOXES = 6;
const MIN_BOXES = 2;

let boxIdCounter = 0;
function newBox(source: SourceValue = "ChatGPT"): PasteBox {
  boxIdCounter += 1;
  return {
    id: `box-${Date.now()}-${boxIdCounter}`,
    source,
    customName: "",
    content: "",
  };
}

type ManualCompareStoredV1 = {
  v: 1;
  savedAt: number;
  prompt: string;
  tone: (typeof TONE_OPTIONS)[number];
  boxes: PasteBox[];
};

export default function ManualComparePage() {
  const router = useRouter();
  const hydratedRef = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] =
    useState<(typeof TONE_OPTIONS)[number]>("professional");
  const [boxes, setBoxes] = useState<PasteBox[]>(() => [
    newBox("ChatGPT"),
    newBox("Claude"),
  ]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || hydratedRef.current) return;
    try {
      const raw = sessionStorage.getItem(LETTIB_STATE_MANUAL_COMPARE);
      if (!raw) return;
      const s = JSON.parse(raw) as ManualCompareStoredV1;
      if (s.v !== 1 || !Array.isArray(s.boxes)) return;
      if (Date.now() - s.savedAt > SESSION_STATE_TTL_MS) {
        sessionStorage.removeItem(LETTIB_STATE_MANUAL_COMPARE);
        return;
      }
      hydratedRef.current = true;
      setPrompt(s.prompt);
      if (TONE_OPTIONS.includes(s.tone)) setTone(s.tone);
      if (s.boxes.length >= MIN_BOXES) setBoxes(s.boxes);
      setShowRestoreBanner(true);
    } catch {
      try {
        sessionStorage.removeItem(LETTIB_STATE_MANUAL_COMPARE);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      try {
        const payload: ManualCompareStoredV1 = {
          v: 1,
          savedAt: Date.now(),
          prompt,
          tone,
          boxes,
        };
        sessionStorage.setItem(
          LETTIB_STATE_MANUAL_COMPARE,
          JSON.stringify(payload)
        );
      } catch {
        /* ignore */
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [prompt, tone, boxes]);

  function addBox() {
    if (boxes.length >= MAX_BOXES) return;
    setBoxes((prev) => [...prev, newBox()]);
  }

  function removeBox(id: string) {
    setBoxes((prev) => (prev.length > 1 ? prev.filter((b) => b.id !== id) : prev));
  }

  function patchBox(id: string, patch: Partial<PasteBox>) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  const filledBoxes = boxes.filter((b) => b.content.trim().length > 0);
  const readyFiles = attachedFiles.filter((f) => f.status === "ready");
  const fileSourcesCount = readyFiles.length;
  const totalSources = filledBoxes.length + fileSourcesCount;
  const filesProcessing = attachedFiles.some((f) => f.status === "processing");

  const canSubmit =
    prompt.trim().length > 0 &&
    totalSources >= MIN_BOXES &&
    !submitting &&
    !filesProcessing;

  async function handleSynthesize() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const fileContext = buildFileContextText(attachedFiles);
      const fileResponses = readyFiles
        .filter((f) => f.text)
        .map((f) => ({
          source: "File" as const,
          customName: f.name,
          content: f.text!,
        }));

      const res = await fetch("/api/manual-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim() + fileContext,
          tone,
          responses: [
            ...filledBoxes.map((b) => ({
              source: b.source,
              customName: b.source === "Custom" ? b.customName.trim() : undefined,
              content: b.content.trim(),
            })),
            ...fileResponses,
          ],
          images: getImageAttachments(attachedFiles),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Synthesis failed (${res.status})`);
      }
      router.push(`/synthesis/${json.synthesis_id}`);
    } catch (e) {
      console.error("[manual-compare] synthesize failed:", e);
      setError(e instanceof Error ? e.message : "Synthesis failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {showRestoreBanner && (
        <RestoreSessionBanner
          onDismiss={() => {
            setShowRestoreBanner(false);
            try {
              sessionStorage.removeItem(LETTIB_STATE_MANUAL_COMPARE);
            } catch {
              /* ignore */
            }
          }}
        />
      )}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Manual Compare</h1>
        <p className="text-muted-foreground">
          Paste outputs from any assistant — no API keys required. Synthesis runs
          on LettiB&apos;s built-in Groq model (Llama 3.3 70B). Upload files or
          images as additional sources.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt">What question did you ask?</Label>
        <ClearableTextarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onClear={() => setPrompt("")}
          placeholder="e.g. What's the best way to structure a Series A pitch deck?"
          className="min-h-[80px] resize-none"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pasted responses ({totalSources} sources)
          </h2>
          <div className="flex gap-2">
            <FileAttachments
              files={attachedFiles}
              onChange={setAttachedFiles}
              disabled={submitting}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBox}
              disabled={boxes.length >= MAX_BOXES}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </div>
        </div>

        {attachedFiles.length > 0 && (
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Uploaded files count as additional model sources
            </p>
          </div>
        )}

        {boxes.map((box, idx) => (
          <div key={box.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`source-${box.id}`}
                    className="text-xs uppercase tracking-wider text-muted-foreground"
                  >
                    Source #{idx + 1}
                  </Label>
                  <Select
                    value={box.source}
                    onValueChange={(v) =>
                      patchBox(box.id, { source: v as SourceValue })
                    }
                  >
                    <SelectTrigger id={`source-${box.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {box.source === "Custom" && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`custom-${box.id}`}
                      className="text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Custom name
                    </Label>
                    <Input
                      id={`custom-${box.id}`}
                      value={box.customName}
                      onChange={(e) =>
                        patchBox(box.id, { customName: e.target.value })
                      }
                      placeholder="e.g. DeepSeek"
                    />
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeBox(box.id)}
                disabled={boxes.length <= 1}
                aria-label="Remove response"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={box.content}
              onChange={(e) => patchBox(box.id, { content: e.target.value })}
              placeholder={`Paste the ${
                box.source === "Custom"
                  ? box.customName || "Custom"
                  : SOURCE_OPTIONS.find((s) => s.value === box.source)?.label ??
                    box.source
              } response here…`}
              className="min-h-[180px] font-mono text-sm"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between border-t pt-6">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="tone">Synthesis tone</Label>
          <Select
            value={tone}
            onValueChange={(v) => setTone(v as (typeof TONE_OPTIONS)[number])}
          >
            <SelectTrigger id="tone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col items-end gap-1">
          {!canSubmit && totalSources < MIN_BOXES && (
            <p className="text-xs text-muted-foreground">
              Provide at least {MIN_BOXES} responses (paste or upload)
            </p>
          )}
          <Button
            type="button"
            size="lg"
            onClick={handleSynthesize}
            disabled={!canSubmit}
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Synthesizing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Synthesize
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
