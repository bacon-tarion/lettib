"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Zap, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponseCard,
  type ResponseCardScores,
} from "@/components/compare/response-card";
import {
  MODELS_CATALOG,
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import type {
  CompareProject,
  CompareTeam,
  CompareConnection,
} from "@/app/(app)/compare/page";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
  { value: "simple", label: "Simple" },
  { value: "persuasive", label: "Persuasive" },
];

type ResponseState = {
  key: string;
  memberId: string;
  provider: string;
  model: string;
  modelLabel: string;
  content: string;
  status: "pending" | "streaming" | "done" | "error";
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs?: number;
  scores: ResponseCardScores | null;
};

type Phase = "idle" | "streaming" | "saving" | "done";

interface CompareUIProps {
  projects: CompareProject[];
  teams: CompareTeam[];
  connections: CompareConnection[];
}

function calcCost(provider: string, model: string, tin: number, tout: number) {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}

export function CompareUI({ projects, teams, connections }: CompareUIProps) {
  const router = useRouter();
  const connectedProviders = useMemo(
    () => new Set(connections.map((c) => c.provider)),
    [connections]
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    teams[0]?.id ?? ""
  );
  const [selectedTone, setSelectedTone] = useState<string>(
    teams[0]?.default_tone ?? "professional"
  );
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [responses, setResponses] = useState<ResponseState[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);

  const responsesRef = useRef<ResponseState[]>([]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  // Estimated cost range (assume ~500 in / ~500 out per model)
  const costEstimate = useMemo(() => {
    if (!selectedTeam) return { low: 0, high: 0 };
    let total = 0;
    for (const m of selectedTeam.members) {
      total += calcCost(m.provider, m.model, 500, 500);
    }
    return { low: total * 0.5, high: total * 2 };
  }, [selectedTeam]);

  function handleTeamChange(value: string) {
    setSelectedTeamId(value);
    const team = teams.find((t) => t.id === value);
    if (team?.default_tone) setSelectedTone(team.default_tone);
    setResponses([]);
    setConversationId(null);
    setPhase("idle");
  }

  async function runCompare() {
    if (!prompt.trim() || !selectedTeam || phase === "streaming") return;

    setGlobalError(null);
    setConversationId(null);
    setPhase("streaming");

    // Initialize one response card per team member
    const initial: ResponseState[] = selectedTeam.members.map((m) => ({
      key: `${m.provider}::${m.model}::${m.id}`,
      memberId: m.id,
      provider: m.provider,
      model: m.model,
      modelLabel: getModelDisplayName(m.provider, m.model),
      content: "",
      status: "pending",
      error: null,
      tokensIn: 0,
      tokensOut: 0,
      scores: null,
    }));
    responsesRef.current = initial;
    setResponses(initial);

    let res: Response;
    try {
      res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          team_id: selectedTeamId,
          project_id: selectedProjectId || null,
          tone: selectedTone,
        }),
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Network error");
      setPhase("idle");
      return;
    }

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      setGlobalError(errText || `Request failed (${res.status})`);
      setPhase("idle");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const updateResponse = (
      key: string,
      patch: Partial<ResponseState> | ((prev: ResponseState) => Partial<ResponseState>)
    ) => {
      const next = responsesRef.current.map((r) => {
        if (r.key !== key) return r;
        const p = typeof patch === "function" ? patch(r) : patch;
        return { ...r, ...p };
      });
      responsesRef.current = next;
      setResponses(next);
    };

    const handleEvent = (raw: string) => {
      const line = raw.split("\n").find((l) => l.startsWith("data: "));
      if (!line) return;
      try {
        const obj = JSON.parse(line.slice(6));
        switch (obj.type) {
          case "start":
            updateResponse(obj.key, { status: "streaming" });
            break;
          case "chunk":
            updateResponse(obj.key, (prev) => ({
              content: prev.content + (obj.text as string),
              status: "streaming",
            }));
            break;
          case "done":
            updateResponse(obj.key, {
              status: "done",
              tokensIn: obj.tokens_in ?? 0,
              tokensOut: obj.tokens_out ?? 0,
              latencyMs: obj.latency_ms,
            });
            break;
          case "error":
            updateResponse(obj.key, {
              status: "error",
              error: obj.error || "Request failed",
            });
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const ev of events) handleEvent(ev);
    }

    // Flush any trailing bytes the decoder was holding, then emit the last
    // event if the stream didn't end with a clean `\n\n`.
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);

    // Mark anything still pending/streaming as a failure so the UI doesn't
    // sit forever if the server died mid-flight.
    const stuck = responsesRef.current.filter(
      (r) => r.status === "pending" || r.status === "streaming"
    );
    if (stuck.length > 0) {
      const next = responsesRef.current.map((r) =>
        r.status === "pending" || r.status === "streaming"
          ? { ...r, status: "error" as const, error: "Stream ended unexpectedly" }
          : r
      );
      responsesRef.current = next;
      setResponses(next);
    }

    // All streams complete — save + score
    setPhase("saving");
    try {
      const saveRes = await fetch("/api/compare/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          project_id: selectedProjectId || null,
          team_id: selectedTeamId,
          tone: selectedTone,
          responses: responsesRef.current.map((r) => ({
            key: r.key,
            provider: r.provider,
            model: r.model,
            content: r.content,
            tokens_in: r.tokensIn,
            tokens_out: r.tokensOut,
            latency_ms: r.latencyMs ?? 0,
            error: r.error,
          })),
        }),
      });

      const data = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(data.error || `Save failed (${saveRes.status})`);
      }
      if (data.conversation_id) setConversationId(data.conversation_id);
      if (Array.isArray(data.scores)) {
        const scoreByKey = new Map<string, ResponseCardScores>(
          data.scores.map(
            (s: ResponseCardScores & { key: string }) => [
              s.key,
              {
                accuracy: s.accuracy,
                clarity: s.clarity,
                creativity: s.creativity,
                usefulness: s.usefulness,
                risk: s.risk,
              },
            ]
          )
        );
        const next = responsesRef.current.map((r) => ({
          ...r,
          scores: scoreByKey.get(r.key) ?? null,
        }));
        responsesRef.current = next;
        setResponses(next);
      }
    } catch (err) {
      setGlobalError(
        err instanceof Error
          ? `Saved partially: ${err.message}`
          : "Save failed"
      );
    }

    setPhase("done");
  }

  async function createSynthesis() {
    if (!conversationId || synthLoading) return;
    setSynthLoading(true);
    setGlobalError(null);
    try {
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          tone: selectedTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Synthesis failed");
      router.push(`/synthesis/${data.synthesis_id}`);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Synthesis failed");
      setSynthLoading(false);
    }
  }

  const successCount = responses.filter(
    (r) => r.status === "done" && !r.error && r.content.trim()
  ).length;
  const allComplete =
    responses.length > 0 &&
    responses.every((r) => r.status === "done" || r.status === "error");

  // ── Empty states ──────────────────────────────────────────────────────────
  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="text-4xl">🔑</div>
        <div>
          <p className="font-semibold text-lg">No API keys connected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Connect at least one API key in Settings to compare models.
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <a href="/settings">
            <Settings className="h-4 w-4" />
            Go to Settings
          </a>
        </Button>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="text-4xl">👥</div>
        <div>
          <p className="font-semibold text-lg">No AI Teams yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a team of 2+ models in Teams to start comparing.
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <a href="/teams">
            <Users className="h-4 w-4" />
            Go to Teams
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Compare</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        {projects.length > 0 && (
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={selectedTeamId} onValueChange={handleTeamChange}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="AI Team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name} ({t.members.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedTone} onValueChange={setSelectedTone}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            {TONES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTeam && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {selectedTeam.members.map((m) => {
            const isConnected = connectedProviders.has(m.provider);
            return (
              <span
                key={m.id}
                className={`px-2 py-1 rounded border ${
                  isConnected
                    ? "bg-muted/50 border-muted"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
                title={isConnected ? "" : "Provider not connected"}
              >
                {getProviderLabel(m.provider)} —{" "}
                {getModelDisplayName(m.provider, m.model)}
              </span>
            );
          })}
        </div>
      )}

      <Textarea
        placeholder="Enter your prompt and run it across all models in the selected team…"
        className="resize-none min-h-[100px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={phase === "streaming" || phase === "saving"}
      />

      {selectedTeam && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-2.5 text-sm text-muted-foreground">
          <span className="text-base">💡</span>
          <span>
            Estimated cost across {selectedTeam.members.length} models:{" "}
            <strong className="text-foreground">
              ${costEstimate.low.toFixed(4)} – ${costEstimate.high.toFixed(4)}
            </strong>
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          className="gap-2"
          onClick={runCompare}
          disabled={
            !prompt.trim() ||
            phase === "streaming" ||
            phase === "saving" ||
            !selectedTeam
          }
        >
          <Zap className="h-4 w-4" />
          {phase === "streaming"
            ? "Streaming…"
            : phase === "saving"
              ? "Saving + scoring…"
              : "Run Compare"}
        </Button>
        {phase === "saving" && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Scoring responses…
          </span>
        )}
      </div>

      {globalError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
          {globalError}
        </div>
      )}

      {responses.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Scores: <span className="font-medium">A</span>ccuracy ·{" "}
            <span className="font-medium">C</span>larity ·{" "}
            <span className="font-medium">C</span>reativity ·{" "}
            <span className="font-medium">U</span>sefulness ·{" "}
            <span className="font-medium">R</span>isk (higher = more risk)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {responses.map((r) => (
              <ResponseCard
                key={r.key}
                provider={r.provider}
                model={r.model}
                modelLabel={r.modelLabel}
                content={r.content}
                status={r.status}
                error={r.error}
                tokensIn={r.tokensIn}
                tokensOut={r.tokensOut}
                cost={calcCost(r.provider, r.model, r.tokensIn, r.tokensOut)}
                latencyMs={r.latencyMs}
                scores={r.scores}
              />
            ))}
          </div>

          {phase === "done" && allComplete && successCount >= 2 && (
            <Button
              className="w-full gap-2"
              variant="default"
              onClick={createSynthesis}
              disabled={!conversationId || synthLoading}
            >
              <Sparkles className="h-4 w-4" />
              {synthLoading
                ? "Creating LettiB Synthesis…"
                : "Create LettiB Synthesis"}
            </Button>
          )}
          {phase === "done" && allComplete && successCount < 2 && (
            <p className="text-xs text-center text-muted-foreground">
              Need at least 2 successful responses to synthesize.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
