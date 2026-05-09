"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Conflict } from "@/lib/synthesis/lineage";

type ConflictRow = Conflict & { chosen: string | null };

interface Props {
  synthesisId: string;
  initialConflicts: ConflictRow[];
}

const SLUG_LABEL: Record<string, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  groq: "Groq",
  grok: "Grok",
  synth: "Synthesizer",
};

const SLUG_DOT: Record<string, string> = {
  claude: "bg-blue-500",
  gpt: "bg-green-500",
  gemini: "bg-orange-500",
  groq: "bg-purple-500",
  grok: "bg-red-500",
};

export function ConflictResolver({ synthesisId, initialConflicts }: Props) {
  const router = useRouter();
  const [conflicts, setConflicts] = useState<ConflictRow[]>(initialConflicts);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allResolved = useMemo(
    () => conflicts.length > 0 && conflicts.every((c) => c.chosen),
    [conflicts]
  );

  if (conflicts.length === 0) return null;

  function setChoice(conflictId: string, model: string) {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, chosen: model } : c))
    );
  }

  // Performs the PATCH save and throws on failure so callers can abort. The
  // outer button handlers are responsible for setting/clearing UI state.
  async function persistChoices() {
    const res = await fetch(`/api/synthesis/${synthesisId}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolutions: conflicts.map((c) => ({ id: c.id, chosen: c.chosen })),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `Save failed (${res.status})`);
    }
  }

  async function saveChoices() {
    setSubmitting(true);
    setError(null);
    try {
      await persistChoices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save choices");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateFinal() {
    setGenerating(true);
    setError(null);
    try {
      // Persist choices first — abort generation if the save fails so we
      // never POST against stale server-side resolutions.
      await persistChoices();
      const res = await fetch(`/api/synthesis/${synthesisId}/resolve`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Generation failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          {conflicts.length === 1
            ? "1 disagreement detected"
            : `${conflicts.length} disagreements detected`}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        The sources don&apos;t fully agree. Pick the position you want the final
        synthesis to favor.
      </p>

      <div className="space-y-3">
        {conflicts.map((c) => (
          <Card key={c.id} className="bg-background">
            <CardContent className="pt-4 pb-3 space-y-2">
              <p className="text-sm font-medium">{c.topic}</p>
              <div className="space-y-1.5">
                {c.positions.map((p) => {
                  const inputId = `${c.id}-${p.model}`;
                  const isChecked = c.chosen === p.model;
                  return (
                    <Label
                      key={inputId}
                      htmlFor={inputId}
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer transition-colors",
                        isChecked
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="radio"
                        id={inputId}
                        name={c.id}
                        value={p.model}
                        checked={isChecked}
                        onChange={() => setChoice(c.id, p.model)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              SLUG_DOT[p.model] ?? "bg-muted-foreground"
                            )}
                          />
                          <span className="text-xs font-medium">
                            {SLUG_LABEL[p.model] ?? p.model}
                          </span>
                        </div>
                        <p className="text-sm font-normal text-foreground">
                          {p.claim}
                        </p>
                      </div>
                    </Label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="sm"
          onClick={generateFinal}
          disabled={!allResolved || generating || submitting}
          className="gap-1.5"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Generate Final Synthesis
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={saveChoices}
          disabled={submitting || generating}
        >
          {submitting && (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          )}
          Save choices
        </Button>
        {!allResolved && (
          <span className="text-xs text-muted-foreground">
            Pick a position for every conflict to enable regeneration.
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
