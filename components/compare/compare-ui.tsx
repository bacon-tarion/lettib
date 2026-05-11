"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Zap, Settings } from "lucide-react";
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
import { calcCompareModelCost } from "@/lib/compare/cost";
import { MAX_COMPARE_PARALLEL_MODELS } from "@/lib/compare/constants";
import type { Team } from "@/app/(app)/teams/actions";
import {
  compareToChatStorageKey,
  type CompareToChatHandoff,
} from "@/lib/compare/to-chat-handoff";
import {
  COMPARE_VIEW_SNAPSHOT_KEY,
  type CompareViewSnapshotV1,
} from "@/lib/compare/view-snapshot";
import { cn } from "@/lib/utils";
import type { CompareProject, CompareConnection } from "@/app/(app)/compare/page";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
  { value: "simple", label: "Simple" },
  { value: "persuasive", label: "Persuasive" },
];

type ModelPick = {
  value: string;
  label: string;
  provider: string;
  modelId: string;
};

function buildModelPicks(connections: CompareConnection[]): ModelPick[] {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; name: string }[]
  >;

  return connections.flatMap((conn) => {
    if (conn.provider === "custom") {
      const modelId = conn.custom_model_name || "custom";
      return [
        {
          value: `custom::${modelId}`,
          label: `Custom — ${conn.custom_model_name || "Custom Model"}`,
          provider: "custom",
          modelId,
        },
      ];
    }
    const models = catalog[conn.provider] ?? [];
    return models.map((m) => ({
      value: `${conn.provider}::${m.id}`,
      label: `${getProviderLabel(conn.provider)} — ${m.name}`,
      provider: conn.provider,
      modelId: m.id,
    }));
  });
}

type ResponseState = {
  key: string;
  position: number;
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
  connections: CompareConnection[];
  teams: Team[];
}

export function CompareUI({ projects, connections, teams }: CompareUIProps) {
  const router = useRouter();
  const modelPicks = useMemo(() => buildModelPicks(connections), [connections]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [selectedTone, setSelectedTone] = useState<string>("professional");
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [responses, setResponses] = useState<ResponseState[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    is_free_tier: boolean;
    blocked: boolean;
  } | null>(null);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (let i = 0; i < Math.min(MAX_COMPARE_PARALLEL_MODELS, modelPicks.length); i++) {
      s.add(modelPicks[i]!.value);
    }
    if (s.size === 0 && modelPicks[0]) s.add(modelPicks[0].value);
    return s;
  });
  /** When not `manual`, reflects the last AI Team preset applied to checkboxes. */
  const [teamPresetId, setTeamPresetId] = useState<string>("manual");
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  const responsesRef = useRef<ResponseState[]>([]);
  const snapshotHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || snapshotHydratedRef.current) return;
    try {
      const raw = sessionStorage.getItem(COMPARE_VIEW_SNAPSHOT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as CompareViewSnapshotV1;
      if (s.version !== 1 || !Array.isArray(s.responses)) return;
      const maxAgeMs = 2 * 60 * 60 * 1000;
      if (Date.now() - s.savedAt > maxAgeMs) {
        sessionStorage.removeItem(COMPARE_VIEW_SNAPSHOT_KEY);
        return;
      }
      snapshotHydratedRef.current = true;
      setPrompt(s.prompt);
      if (s.selectedProjectId && projects.some((p) => p.id === s.selectedProjectId)) {
        setSelectedProjectId(s.selectedProjectId);
      }
      if (s.selectedTone) setSelectedTone(s.selectedTone);
      setConversationId(s.conversationId);
      const restored = s.responses as ResponseState[];
      responsesRef.current = restored;
      setResponses(restored);
      setPhase("done");
      setTeamPresetId("manual");
    } catch {
      try {
        sessionStorage.removeItem(COMPARE_VIEW_SNAPSHOT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [projects]);

  useEffect(() => {
    const allTerminal =
      responses.length > 0 &&
      responses.every((r) => r.status === "done" || r.status === "error");
    if (!allTerminal || phase === "streaming" || retryingKey) return;
    try {
      const snap: CompareViewSnapshotV1 = {
        version: 1,
        savedAt: Date.now(),
        prompt,
        selectedProjectId,
        selectedTone,
        conversationId,
        responses: responses.map((r) => ({
          key: r.key,
          position: r.position,
          provider: r.provider,
          model: r.model,
          modelLabel: r.modelLabel,
          content: r.content,
          status: r.status,
          error: r.error,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          latencyMs: r.latencyMs,
          scores: r.scores,
        })),
      };
      sessionStorage.setItem(COMPARE_VIEW_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      /* ignore quota / private mode */
    }
  }, [
    responses,
    phase,
    retryingKey,
    prompt,
    selectedProjectId,
    selectedTone,
    conversationId,
  ]);

  useEffect(() => {
    setSelectedValues((prev) => {
      const next = new Set<string>();
      for (const v of Array.from(prev)) {
        if (modelPicks.some((p) => p.value === v)) next.add(v);
      }
      if (next.size === 0 && modelPicks[0]) {
        for (let i = 0; i < Math.min(MAX_COMPARE_PARALLEL_MODELS, modelPicks.length); i++) {
          next.add(modelPicks[i]!.value);
        }
        if (next.size === 0) next.add(modelPicks[0].value);
      }
      return next;
    });
  }, [modelPicks]);

  useEffect(() => {
    fetch("/api/usage/compare-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsage(d))
      .catch(() => {});
  }, [phase]);

  const selectedModels = useMemo(() => {
    const list: ModelPick[] = [];
    for (const p of modelPicks) {
      if (selectedValues.has(p.value)) list.push(p);
    }
    return list;
  }, [modelPicks, selectedValues]);

  const costEstimate = useMemo(() => {
    let total = 0;
    for (const m of selectedModels) {
      total += calcCompareModelCost(m.provider, m.modelId, 500, 500);
    }
    return { low: total * 0.5, high: total * 2 };
  }, [selectedModels]);

  const totalActualCost = useMemo(() => {
    return responses.reduce(
      (sum, r) =>
        sum + calcCompareModelCost(r.provider, r.model, r.tokensIn, r.tokensOut),
      0
    );
  }, [responses]);

  function applyTeamPreset(teamKey: string) {
    setTeamPresetId(teamKey);
    setResponses([]);
    setConversationId(null);
    setPhase("idle");
    if (teamKey === "manual") return;
    const team = teams.find((t) => t.id === teamKey);
    if (!team) return;
    const allowed = new Set(modelPicks.map((p) => p.value));
    const next: string[] = [];
    const sorted = [...team.members].sort((a, b) => a.position - b.position);
    for (const m of sorted) {
      const v = `${m.provider}::${m.model}`;
      if (allowed.has(v)) {
        next.push(v);
        if (next.length >= MAX_COMPARE_PARALLEL_MODELS) break;
      }
    }
    setSelectedValues(new Set(next));
  }

  function toggleModel(value: string) {
    setTeamPresetId("manual");
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        return next;
      }
      if (next.size >= MAX_COMPARE_PARALLEL_MODELS) return prev;
      next.add(value);
      return next;
    });
    setResponses([]);
    setConversationId(null);
    setPhase("idle");
  }

  const consumeSseStream = useCallback(
    async (
      res: Response,
      opts: {
        onMeta?: (conversationId: string) => void;
        filterKey?: string | null;
      }
    ) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateResponse = (
        key: string,
        patch:
          | Partial<ResponseState>
          | ((prev: ResponseState) => Partial<ResponseState>)
      ) => {
        if (opts.filterKey && key !== opts.filterKey) return;
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
          if (obj.type === "meta" && obj.conversation_id && opts.onMeta) {
            opts.onMeta(obj.conversation_id as string);
            return;
          }
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
      buffer += decoder.decode();
      if (buffer.trim()) handleEvent(buffer);

      const stuck = responsesRef.current.filter(
        (r) =>
          (!opts.filterKey || r.key === opts.filterKey) &&
          (r.status === "pending" || r.status === "streaming")
      );
      if (stuck.length > 0) {
        const next = responsesRef.current.map((r) =>
          (!opts.filterKey || r.key === opts.filterKey) &&
          (r.status === "pending" || r.status === "streaming")
            ? {
                ...r,
                status: "error" as const,
                error: "Stream ended unexpectedly",
              }
            : r
        );
        responsesRef.current = next;
        setResponses(next);
      }
    },
    []
  );

  async function runCompare() {
    if (
      !prompt.trim() ||
      selectedModels.length === 0 ||
      phase === "streaming" ||
      retryingKey
    ) {
      return;
    }

    try {
      sessionStorage.removeItem(COMPARE_VIEW_SNAPSHOT_KEY);
    } catch {
      /* ignore */
    }

    setGlobalError(null);
    setConversationId(null);
    setPhase("streaming");

    const model_ids = selectedModels.map((m) => ({
      provider: m.provider,
      model: m.modelId,
    }));

    const initial: ResponseState[] = selectedModels.map((m, i) => ({
      key: `${m.provider}::${m.modelId}::${i}`,
      position: i,
      provider: m.provider,
      model: m.modelId,
      modelLabel: getModelDisplayName(m.provider, m.modelId),
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
          model_ids,
          project_id: selectedProjectId || null,
          tone: selectedTone,
        }),
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Network error");
      setPhase("idle");
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(errText || `Request failed (${res.status})`);
      setPhase("idle");
      return;
    }

    let streamedConversationId: string | null = null;
    await consumeSseStream(res, {
      onMeta: (id) => {
        streamedConversationId = id;
        setConversationId(id);
      },
    });

    setPhase("saving");
    try {
      const saveRes = await fetch("/api/compare/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: streamedConversationId ?? undefined,
          prompt,
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
        err instanceof Error ? err.message : "Scoring pass failed"
      );
    }

    setPhase("done");
  }

  function continueModelToChat(r: ResponseState) {
    if (!prompt.trim() || !r.content.trim()) return;
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const payload: CompareToChatHandoff = {
      provider: r.provider,
      model: r.model,
      comparePrompt: prompt,
      compareResponse: r.content,
      projectId: selectedProjectId || null,
      tone: selectedTone,
      pristineCompareThread: true,
    };
    try {
      sessionStorage.setItem(
        compareToChatStorageKey(nonce),
        JSON.stringify(payload)
      );
    } catch {
      setGlobalError("Could not open Chat (storage blocked).");
      return;
    }
    const url = `/chat?fromCompare=1&h=${encodeURIComponent(nonce)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function retryOne(r: ResponseState) {
    if (
      !prompt.trim() ||
      !conversationId ||
      phase === "streaming" ||
      retryingKey
    ) {
      return;
    }

    setGlobalError(null);
    setRetryingKey(r.key);
    setPhase("streaming");

    updateCard(r.key, {
      status: "pending",
      error: null,
      content: "",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: undefined,
      scores: null,
    });

    let res: Response;
    try {
      res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model_ids: [{ provider: r.provider, model: r.model }],
          project_id: selectedProjectId || null,
          tone: selectedTone,
          conversation_id: conversationId,
          retry_position: r.position,
        }),
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Network error");
      setRetryingKey(null);
      setPhase("done");
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(errText || `Request failed (${res.status})`);
      setRetryingKey(null);
      setPhase("done");
      return;
    }

    await consumeSseStream(res, { filterKey: r.key });

    try {
      const saveRes = await fetch("/api/compare/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          prompt,
          responses: responsesRef.current.map((row) => ({
            key: row.key,
            provider: row.provider,
            model: row.model,
            content: row.content,
            tokens_in: row.tokensIn,
            tokens_out: row.tokensOut,
            latency_ms: row.latencyMs ?? 0,
            error: row.error,
          })),
        }),
      });
      const data = await saveRes.json();
      if (saveRes.ok && Array.isArray(data.scores)) {
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
        const next = responsesRef.current.map((row) => ({
          ...row,
          scores: scoreByKey.get(row.key) ?? row.scores,
        }));
        responsesRef.current = next;
        setResponses(next);
      }
    } catch {
      // scoring best-effort after retry
    }

    setRetryingKey(null);
    setPhase("done");
  }

  function updateCard(key: string, patch: Partial<ResponseState>) {
    const next = responsesRef.current.map((row) =>
      row.key === key ? { ...row, ...patch } : row
    );
    responsesRef.current = next;
    setResponses(next);
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
  const canContinueInChat =
    allComplete && phase !== "streaming" && !retryingKey;

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

  if (modelPicks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <p className="text-sm text-muted-foreground">
          No models available from your connections.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="/settings">Settings</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Compare</h1>
      </div>

      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100/90"
        role="status"
      >
        Compare Mode sends your prompt to multiple providers simultaneously. API
        costs apply for each model used.
      </div>

      {usage?.is_free_tier && (
        <div
          className={
            usage.blocked
              ? "rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive"
              : usage.remaining <= 1
                ? "rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400"
                : "rounded-lg bg-muted/40 border px-4 py-2.5 text-xs text-muted-foreground"
          }
        >
          {usage.blocked
            ? "Free tier limit reached. Add your own API keys in Settings to continue running comparisons."
            : `Free tier: ${usage.used} / ${usage.limit} compare events used this month${
                usage.remaining <= 1 ? " — running low" : ""
              }.`}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
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
        <Select value={teamPresetId} onValueChange={(v) => applyTeamPreset(v)}>
          <SelectTrigger className="w-52 h-8 text-xs">
            <SelectValue placeholder="AI Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual" className="text-xs">
              Manual model pick
            </SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name} ({t.members.length} models)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Models (up to {MAX_COMPARE_PARALLEL_MODELS})
        </p>
        {teams.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Pick an <strong className="font-medium text-foreground">AI Team</strong>{" "}
            above to auto-select its models, or toggle models manually.
          </p>
        )}
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
          {modelPicks.map((p) => {
            const checked = selectedValues.has(p.value);
            const atCap =
              selectedValues.size >= MAX_COMPARE_PARALLEL_MODELS && !checked;
            return (
              <label
                key={p.value}
                className={cn(
                  "flex items-center gap-2 text-xs cursor-pointer rounded-md border px-2 py-1.5",
                  checked
                    ? "border-primary bg-primary/5"
                    : atCap
                      ? "opacity-50 cursor-not-allowed"
                      : "border-border hover:bg-muted/50"
                )}
              >
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground"
                  checked={checked}
                  disabled={atCap}
                  onChange={() => toggleModel(p.value)}
                />
                <span>{p.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <Textarea
        placeholder="Enter your prompt — it will run on every selected model in parallel…"
        className="resize-none min-h-[100px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={phase === "streaming" || phase === "saving"}
      />

      {selectedModels.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-2.5 text-sm text-muted-foreground">
          <span className="text-base">💡</span>
          <span>
            Estimated cost across {selectedModels.length} models (rough range):{" "}
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
            selectedModels.length === 0 ||
            phase === "streaming" ||
            phase === "saving" ||
            !!retryingKey
          }
        >
          <Zap className="h-4 w-4" />
          {phase === "streaming"
            ? retryingKey
              ? "Retrying…"
              : "Streaming…"
            : phase === "saving"
              ? "Scoring…"
              : "Run Compare"}
        </Button>
        {phase === "saving" && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Ranking responses…
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
            Scores (when available): <span className="font-medium">A</span>
            ccuracy · <span className="font-medium">C</span>larity ·{" "}
            <span className="font-medium">C</span>reativity ·{" "}
            <span className="font-medium">U</span>sefulness ·{" "}
            <span className="font-medium">R</span>isk (higher = more risk)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {responses.map((r) => (
              <ResponseCard
                key={r.key}
                provider={r.provider}
                providerLabel={getProviderLabel(r.provider)}
                model={r.model}
                modelLabel={r.modelLabel}
                content={r.content}
                status={
                  retryingKey === r.key
                    ? "streaming"
                    : r.status === "pending" && phase === "streaming"
                      ? "pending"
                      : r.status
                }
                error={r.error}
                tokensIn={r.tokensIn}
                tokensOut={r.tokensOut}
                cost={calcCompareModelCost(
                  r.provider,
                  r.model,
                  r.tokensIn,
                  r.tokensOut
                )}
                latencyMs={r.latencyMs}
                scores={r.scores}
                onRetry={
                  r.status === "error" && conversationId && !retryingKey
                    ? () => void retryOne(r)
                    : undefined
                }
                onContinueInChat={
                  canContinueInChat && r.status === "done" && r.content.trim()
                    ? () => continueModelToChat(r)
                    : undefined
                }
              />
            ))}
          </div>

          {responses.some((r) => r.status === "done" || r.status === "error") && (
            <div className="flex justify-end border-t pt-4">
              <p className="text-sm text-muted-foreground tabular-nums">
                Total estimated cost:{" "}
                <strong className="text-foreground">
                  ${totalActualCost.toFixed(5)}
                </strong>
              </p>
            </div>
          )}

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
