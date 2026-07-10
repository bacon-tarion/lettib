"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart2, Loader2, Scale, Sparkles, Zap, Settings, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClearableTextarea } from "@/components/ui/clearable-textarea";
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
  type ResponseCardProps,
} from "@/components/compare/response-card";
import { ResponseFocusOverlay } from "@/components/compare/response-focus-overlay";
import {
  MODELS_CATALOG,
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import { calcCompareModelCost } from "@/lib/compare/cost";
import { estimateCompareCost, formatCostRange } from "@/lib/cost-estimate";
import { MAX_COMPARE_PARALLEL_MODELS } from "@/lib/compare/constants";
import { COMPARE_PROMPT_SOFT_CHAR_LIMIT } from "@/lib/compare/context-limits";
import type { Team } from "@/app/(app)/teams/actions";
import {
  readCompareSnapshotFromStorage,
  writeCompareSnapshotToStorage,
  clearCompareSnapshotStorage,
  type CompareStateSnapshotV2,
} from "@/lib/compare/view-snapshot";
import { RestoreSessionBanner } from "@/components/session/restore-session-banner";
import { cn } from "@/lib/utils";
import { CompareHistorySidebar } from "@/components/compare/compare-history-sidebar";
import {
  useWebSearchPreference,
  WebSearchToggle,
} from "@/components/web-search/toggle";
import type { CompareProject, CompareConnection } from "@/app/(app)/compare/page";
import { STANDALONE_PROJECT_VALUE } from "@/components/chat/chat-organizer";
import {
  FileAttachments,
  type AttachedFile,
  buildFileContextText,
} from "@/components/chat/file-attachments";
import {
  compareToChatStorageKey,
  type CompareToChatHandoff,
} from "@/lib/compare/to-chat-handoff";

function resolveCompareProjectId(selected: string): string | null {
  return !selected || selected === STANDALONE_PROJECT_VALUE ? null : selected;
}

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "academic", label: "Academic" },
  { value: "simple", label: "Simple" },
  { value: "persuasive", label: "Persuasive" },
];

const SYNTHESIS_PROVIDER_ORDER = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "groq",
  "custom",
] as const;

type ModelPick = {
  value: string;
  label: string;
  provider: string;
  modelId: string;
};

function getModelWarningNote(modelId: string): string | null {
  if (modelId === "gemini-2.5-pro") {
    return "Requires Google paid tier (5 RPM limit on free tier)";
  }
  if (modelId === "claude-opus-4-7") {
    return "Slower response times — best for complex tasks";
  }
  return null;
}

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
  /** model_responses.id — populated after /api/compare/save persists the row. */
  responseId: string | null;
};

type Phase = "idle" | "streaming" | "saving" | "done";

type CompareRound = {
  prompt: string;
  responses: ResponseState[];
  /** Session 11: 'branch' rounds are "Ask this model" follow-ups. */
  kind: "main" | "branch";
};

/** Stable per-model identifier used by the "Continue with this model" toggle. */
function modelKeyOf(provider: string, model: string): string {
  return `${provider}::${model}`;
}

type CompareLaneMeta = {
  provider: string;
  model: string;
  position: number;
  key: string;
};

type CompareStreamMeta = {
  conversation_id: string;
  lanes?: CompareLaneMeta[];
  round_kind?: "main" | "branch";
  round_index?: number;
};

function responsesFromServerLanes(lanes: CompareLaneMeta[]): ResponseState[] {
  return lanes.map((l) => ({
    key: l.key,
    position: l.position,
    provider: l.provider,
    model: l.model,
    modelLabel: getModelDisplayName(l.provider, l.model),
    content: "",
    status: "pending" as const,
    error: null,
    tokensIn: 0,
    tokensOut: 0,
    scores: null,
    responseId: null,
  }));
}

function parseCompareErrorResponse(errText: string, status: number): string {
  try {
    const j = JSON.parse(errText) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* plain text */
  }
  return errText || `Request failed (${status})`;
}

interface CompareUIProps {
  projects: CompareProject[];
  connections: CompareConnection[];
  teams: Team[];
  /** Max models selectable at once for the user's subscription tier. */
  maxCompareModels: number;
  /** Canonical `profiles.tier` value for limit messaging. */
  subscriptionTier: string;
}

function snapshotRowToState(
  r: CompareStateSnapshotV2["rounds"][0]["responses"][0]
): ResponseState {
  return {
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
    responseId: r.responseId ?? null,
  };
}

export function CompareUI({
  projects,
  connections,
  teams,
  maxCompareModels,
  subscriptionTier,
}: CompareUIProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compareIdFromUrl = searchParams.get("c");
  const modelPicks = useMemo(() => buildModelPicks(connections), [connections]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    STANDALONE_PROJECT_VALUE
  );
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [selectedTone, setSelectedTone] = useState<string>("professional");
  const [prompt, setPrompt] = useState("");
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  /** True while the shared Run Compare OR main follow-up SSE is active (for Stop waiting). */
  const [mainBatchStreaming, setMainBatchStreaming] = useState(false);
  /** True from main follow-up POST start until persist completes (serialization only). */
  const [followUpInFlight, setFollowUpInFlight] = useState(false);
  const [rounds, setRounds] = useState<CompareRound[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthesisProvider, setSynthesisProvider] = useState<string>("auto");
  /** Latest synthesis for this compare conversation (for quick navigation back). */
  const [latestSynthesisId, setLatestSynthesisId] = useState<string | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    remaining: number;
    is_free_tier: boolean;
    blocked: boolean;
  } | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [focusedResponseKey, setFocusedResponseKey] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useWebSearchPreference();
  const modelCap = Math.min(maxCompareModels, MAX_COMPARE_PARALLEL_MODELS);

  const showCompareModelLimitToast = useCallback(() => {
    switch (subscriptionTier) {
      case "pro":
        toast.error(
          "Your Pro plan supports up to 4 models. Upgrade to Power for 6 models.",
          {
            action: {
              label: "Upgrade",
              onClick: () => router.push("/pricing"),
            },
          }
        );
        break;
      case "power":
        toast.error("6 models selected — that's the maximum for any plan.");
        break;
      case "lifetime_byok":
        toast.error("6 models selected — that's the maximum.");
        break;
      default:
        toast.error(
          "Your Free plan supports up to 2 models. Upgrade to Pro or Power for more.",
          {
            action: {
              label: "Upgrade",
              onClick: () => router.push("/pricing"),
            },
          }
        );
        break;
    }
  }, [router, subscriptionTier]);

  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (let i = 0; i < Math.min(modelCap, modelPicks.length); i++) {
      s.add(modelPicks[i]!.value);
    }
    if (s.size === 0 && modelPicks[0]) s.add(modelPicks[0].value);
    return s;
  });
  /** When not `manual`, reflects the last AI Team preset applied to checkboxes. */
  const [teamPresetId, setTeamPresetId] = useState<string>("manual");
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const retryingKeyRef = useRef<string | null>(null);
  const retryOneRef = useRef<(r: ResponseState) => Promise<void>>(
    async () => {}
  );
  const autoRetryCountRef = useRef<Record<string, number>>({});

  // ─── Session 11: per-model & per-response selection state ──────────────
  //
  // continueByModelKey: keyed by `${provider}::${model}`. Drives which
  // models receive the main follow-up prompt. Defaults to true when a
  // model first produces a response.
  const [continueByModelKey, setContinueByModelKey] = useState<
    Record<string, boolean>
  >({});
  // useInSynthesisByKey: keyed by response key. Drives Synthesis inclusion
  // + "Grade selected responses". Defaults to true for each new response.
  const [useInSynthesisByKey, setUseInSynthesisByKey] = useState<
    Record<string, boolean>
  >({});
  // gradingKeys: response keys currently waiting on /api/compare/score.
  // Stored as a record so we can re-render individual cards.
  const [gradingKeys, setGradingKeys] = useState<Record<string, boolean>>({});
  // askingModelKey: the modelKey (provider::model) currently streaming an
  // "Ask this model" follow-up. Disables other Ask buttons during that
  // round so we don't race two branches against each other.
  const [askingModelKey, setAskingModelKey] = useState<string | null>(null);
  const [batchGrading, setBatchGrading] = useState(false);

  const roundsRef = useRef<CompareRound[]>([]);
  const snapshotHydratedRef = useRef(false);
  const urlHydratedRef = useRef<string | null>(null);
  /**
   * Controls the in-flight /api/compare fetch. Click "Stop waiting on
   * slow models" → abort() → the SSE reader throws, the catch handler in
   * `consumeSseStream` marks any lanes still pending/streaming as
   * errored, and the workspace unlocks fully. Without this, lanes that
   * silently hang (Gemini "failed to connect", Grok rate-limit) block
   * synthesis / follow-up for the full 5-minute per-member timeout.
   */
  /** In-flight Run Compare / main follow-up SSE (stopped by "Stop waiting…"). */
  const mainBatchAbortRef = useRef<AbortController | null>(null);
  /** In-flight "Ask this model" SSE — independent from the main batch. */
  const branchAskAbortRef = useRef<AbortController | null>(null);

  const flatResponses = useMemo(
    () => rounds.flatMap((x) => x.responses),
    [rounds]
  );

  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam && projects.some((p) => p.id === projectParam)) {
      setSelectedProjectId(projectParam);
      router.replace("/compare");
    }
  }, [searchParams, projects, router]);

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    if (typeof window === "undefined" || snapshotHydratedRef.current) return;
    if (compareIdFromUrl) return;
    const snap = readCompareSnapshotFromStorage();
    if (!snap || !snap.rounds?.length) return;
    snapshotHydratedRef.current = true;
    if (snap.selectedProjectId && projects.some((p) => p.id === snap.selectedProjectId)) {
      setSelectedProjectId(snap.selectedProjectId);
    }
    if (snap.selectedTone) setSelectedTone(snap.selectedTone);
    if (snap.teamPresetId) setTeamPresetId(snap.teamPresetId);
    if (snap.selectedModelValues?.length) {
      const allowed = new Set(modelPicks.map((p) => p.value));
      const next = new Set<string>();
      for (const v of snap.selectedModelValues) {
        if (allowed.has(v)) next.add(v);
      }
      if (next.size > 0) setSelectedValues(next);
    }
    setConversationId(snap.conversationId);
    setRounds(
      snap.rounds.map((round) => ({
        prompt: round.prompt,
        responses: round.responses.map(snapshotRowToState),
        kind: round.kind ?? "main",
      }))
    );
    setPrompt(snap.rounds[0]?.prompt ?? "");
    if (snap.continueByModelKey) {
      setContinueByModelKey({ ...snap.continueByModelKey });
    }
    if (snap.useInSynthesisByResponseKey) {
      setUseInSynthesisByKey({ ...snap.useInSynthesisByResponseKey });
    }
    setPhase("done");
    setShowRestoreBanner(true);
  }, [projects, modelPicks, compareIdFromUrl]);

  useEffect(() => {
    if (!compareIdFromUrl) {
      urlHydratedRef.current = null;
      return;
    }
    if (urlHydratedRef.current === compareIdFromUrl) return;
    urlHydratedRef.current = compareIdFromUrl;
    snapshotHydratedRef.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${compareIdFromUrl}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversation: {
            id: string;
            mode: string;
            project_id: string | null;
            title: string;
          };
          messages: {
            role: string;
            content: string;
            created_at: string;
          }[];
          model_responses: {
            id: string;
            provider: string;
            model: string;
            content: string;
            tokens_in: number;
            tokens_out: number;
            latency_ms: number;
            error: string | null;
            position: number;
            round_index?: number;
            round_kind?: "main" | "branch";
            score_accuracy: number | null;
            score_clarity: number | null;
            score_creativity: number | null;
            score_usefulness: number | null;
            score_risk: number | null;
          }[];
          latest_synthesis?: { id: string } | null;
        };

        if (data.conversation.mode !== "compare") return;

        if (
          data.conversation.project_id &&
          projects.some((p) => p.id === data.conversation.project_id)
        ) {
          setSelectedProjectId(data.conversation.project_id);
        }

        const userMsgs = (data.messages ?? [])
          .filter((m) => m.role === "user")
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

        const byRoundIdx = new Map<number, ResponseState[]>();
        const roundKindByIdx = new Map<number, "main" | "branch">();
        const seenContinue: Record<string, boolean> = {};
        for (const mr of data.model_responses ?? []) {
          const ri =
            typeof mr.round_index === "number" ? mr.round_index : 0;
          if (!byRoundIdx.has(ri)) byRoundIdx.set(ri, []);
          // Once a round is marked branch, keep it branch — branch rounds
          // contain a single row, so this is a no-op but defends against
          // a hypothetical mixed-round.
          const kind = mr.round_kind === "branch" ? "branch" : "main";
          if (!roundKindByIdx.has(ri) || kind === "branch") {
            roundKindByIdx.set(ri, kind);
          }
          const scores =
            mr.score_accuracy != null
              ? {
                  accuracy: mr.score_accuracy,
                  clarity: mr.score_clarity ?? 0,
                  creativity: mr.score_creativity ?? 0,
                  usefulness: mr.score_usefulness ?? 0,
                  risk: mr.score_risk ?? 0,
                }
              : null;
          const key = `${mr.provider}::${mr.model}::${mr.position}`;
          byRoundIdx.get(ri)!.push({
            key,
            position: mr.position,
            provider: mr.provider,
            model: mr.model,
            modelLabel: getModelDisplayName(mr.provider, mr.model),
            content: mr.content ?? "",
            status: mr.error ? "error" : "done",
            error: mr.error,
            tokensIn: mr.tokens_in ?? 0,
            tokensOut: mr.tokens_out ?? 0,
            latencyMs: mr.latency_ms,
            scores,
            responseId: mr.id,
          });
          seenContinue[modelKeyOf(mr.provider, mr.model)] = true;
        }
        for (const [, arr] of Array.from(byRoundIdx.entries())) {
          arr.sort((a: ResponseState, b: ResponseState) => a.position - b.position);
        }

        const built: CompareRound[] = [];
        if (userMsgs.length === 0) return;
        const totalRounds = Math.max(userMsgs.length, byRoundIdx.size);
        for (let i = 0; i < totalRounds; i++) {
          const rs = [...(byRoundIdx.get(i) ?? [])].sort(
            (a, b) => a.position - b.position
          );
          const promptForRound =
            userMsgs[i]?.content ?? userMsgs[userMsgs.length - 1]?.content ?? "";
          built.push({
            prompt: promptForRound,
            responses: rs,
            kind: roundKindByIdx.get(i) ?? "main",
          });
        }

        const latestRoundIdx = built.length - 1;
        const synthesisDefaults: Record<string, boolean> = {};
        for (let i = 0; i < built.length; i++) {
          for (const r of built[i]!.responses) {
            synthesisDefaults[r.key] =
              i === latestRoundIdx &&
              r.status === "done" &&
              !r.error &&
              !!r.content.trim();
          }
        }

        setConversationId(data.conversation.id);
        setSessionTitle(data.conversation.title ?? null);
        setRounds(built);
        setPrompt(built[0]?.prompt ?? "");
        setContinueByModelKey(seenContinue);
        setUseInSynthesisByKey(synthesisDefaults);
        setPhase("done");
        setShowRestoreBanner(true);
        setLatestSynthesisId(data.latest_synthesis?.id ?? null);
      } catch {
        /* ignore */
      }
    })();
  }, [compareIdFromUrl, projects]);

  /** Keep “View latest synthesis” in sync when working in a live session. */
  useEffect(() => {
    if (!conversationId) {
      setLatestSynthesisId(null);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          latest_synthesis?: { id: string } | null;
        };
        setLatestSynthesisId(data.latest_synthesis?.id ?? null);
      } catch {
        /* ignore */
      }
    })();
  }, [conversationId]);

  useEffect(() => {
    const allTerminal =
      flatResponses.length > 0 &&
      flatResponses.every((r) => r.status === "done" || r.status === "error");
    if (!allTerminal || mainBatchStreaming || followUpInFlight || retryingKey)
      return;
    try {
      const snap: CompareStateSnapshotV2 = {
        version: 2,
        savedAt: Date.now(),
        selectedProjectId,
        selectedTone,
        teamPresetId,
        selectedModelValues: Array.from(selectedValues),
        conversationId,
        rounds: rounds.map((round) => ({
          prompt: round.prompt,
          kind: round.kind,
          responses: round.responses.map((r) => ({
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
            responseId: r.responseId,
            roundKind: round.kind,
          })),
        })),
        continueByModelKey,
        useInSynthesisByResponseKey: useInSynthesisByKey,
      };
      writeCompareSnapshotToStorage(snap);
    } catch {
      /* ignore quota / private mode */
    }
  }, [
    flatResponses,
    rounds,
    mainBatchStreaming,
    followUpInFlight,
    retryingKey,
    selectedProjectId,
    selectedTone,
    conversationId,
    selectedValues,
    teamPresetId,
    continueByModelKey,
    useInSynthesisByKey,
  ]);

  useEffect(() => {
    setSelectedValues((prev) => {
      const next = new Set<string>();
      for (const v of Array.from(prev)) {
        if (modelPicks.some((p) => p.value === v)) next.add(v);
      }
      if (next.size === 0 && modelPicks[0]) {
        for (let i = 0; i < Math.min(modelCap, modelPicks.length); i++) {
          next.add(modelPicks[i]!.value);
        }
        if (next.size === 0) next.add(modelPicks[0].value);
      }
      return next;
    });
  }, [modelPicks, modelCap]);

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

  const costEstimate = useMemo(
    () =>
      estimateCompareCost(
        prompt,
        selectedModels.map((m) => m.modelId)
      ),
    [prompt, selectedModels]
  );

  const totalActualCost = useMemo(() => {
    return flatResponses.reduce(
      (sum, r) =>
        sum + calcCompareModelCost(r.provider, r.model, r.tokensIn, r.tokensOut),
      0
    );
  }, [flatResponses]);

  const connectedSynthesisProviders = useMemo(() => {
    const connected = new Set(connections.map((c) => c.provider));
    return SYNTHESIS_PROVIDER_ORDER.filter((p) => connected.has(p)) as string[];
  }, [connections]);

  useEffect(() => {
    if (
      synthesisProvider !== "auto" &&
      !connectedSynthesisProviders.includes(synthesisProvider)
    ) {
      setSynthesisProvider("auto");
    }
  }, [connectedSynthesisProviders, synthesisProvider]);

  function applyTeamPreset(teamKey: string) {
    setTeamPresetId(teamKey);
    setRounds([]);
    roundsRef.current = [];
    setConversationId(null);
    setPhase("idle");
    if (teamKey === "manual") return;
    const team = teams.find((t) => t.id === teamKey);
    if (!team) return;
    const allowed = new Set(modelPicks.map((p) => p.value));
    const next: string[] = [];
    const sorted = [...team.members].sort((a, b) => a.position - b.position);
    let teamModelCount = 0;
    for (const m of sorted) {
      const v = `${m.provider}::${m.model}`;
      if (allowed.has(v)) teamModelCount++;
    }
    for (const m of sorted) {
      const v = `${m.provider}::${m.model}`;
      if (allowed.has(v)) {
        next.push(v);
        if (next.length >= modelCap) break;
      }
    }
    if (teamModelCount > modelCap) {
      showCompareModelLimitToast();
    }
    setSelectedValues(new Set(next));
  }

  function toggleModel(value: string) {
    setTeamPresetId("manual");
    if (!selectedValues.has(value) && selectedValues.size >= modelCap) {
      showCompareModelLimitToast();
      return;
    }
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        return next;
      }
      next.add(value);
      return next;
    });
    setRounds([]);
    roundsRef.current = [];
    setConversationId(null);
    setPhase("idle");
  }

  const applyServerAllocatedRound = useCallback(
    (
      roundIndex: number,
      promptText: string,
      lanes: CompareLaneMeta[],
      kind: "main" | "branch"
    ) => {
      const round: CompareRound = {
        prompt: promptText,
        responses: responsesFromServerLanes(lanes),
        kind,
      };
      const cur = [...roundsRef.current];
      if (roundIndex < cur.length) {
        cur[roundIndex] = round;
      } else {
        cur.push(round);
      }
      roundsRef.current = cur;
      setRounds(cur);

      // Latest round checked for synthesis; all prior rounds unchecked.
      setUseInSynthesisByKey((prev) => {
        const out = { ...prev };
        for (let i = 0; i < roundIndex; i++) {
          for (const r of cur[i]!.responses) out[r.key] = false;
        }
        for (const r of round.responses) {
          if (out[r.key] === undefined) out[r.key] = true;
        }
        return out;
      });
    },
    []
  );

  const consumeSseStream = useCallback(
    async (
      res: Response,
      opts: {
        onMeta?: (meta: CompareStreamMeta) => void;
        filterKey?: string | null;
        /**
         * Message to write into lanes that are still pending/streaming
         * when the stream terminates (natural close, abort, or network
         * drop). Defaults to "Stream ended unexpectedly".
         */
        abortedMessage?: string;
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
        const cur = roundsRef.current;
        const next = cur.map((round) => ({
          ...round,
          responses: round.responses.map((r) => {
            if (r.key !== key) return r;
            const p = typeof patch === "function" ? patch(r) : patch;
            return { ...r, ...p };
          }),
        }));
        roundsRef.current = next;
        setRounds(next);
      };

      // Look up a lane's modelKey (provider::model) without iterating —
      // used by the `saved` / `error` handlers to flip selection state.
      const findModelKey = (responseKey: string): string | null => {
        for (const round of roundsRef.current) {
          for (const r of round.responses) {
            if (r.key === responseKey) return modelKeyOf(r.provider, r.model);
          }
        }
        return null;
      };

      const handleEvent = (raw: string) => {
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) return;
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.type === "meta" && obj.conversation_id && opts.onMeta) {
            opts.onMeta({
              conversation_id: obj.conversation_id as string,
              lanes: Array.isArray(obj.lanes)
                ? (obj.lanes as CompareLaneMeta[])
                : undefined,
              round_kind:
                obj.round_kind === "branch" || obj.round_kind === "main"
                  ? obj.round_kind
                  : undefined,
              round_index:
                typeof obj.round_index === "number"
                  ? obj.round_index
                  : undefined,
            });
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
              autoRetryCountRef.current[obj.key as string] = 0;
              updateResponse(obj.key, {
                status: "done",
                tokensIn: obj.tokens_in ?? 0,
                tokensOut: obj.tokens_out ?? 0,
                latencyMs: obj.latency_ms,
              });
              // Default into Synthesis only for the latest round.
              setUseInSynthesisByKey((prev) => {
                if (prev[obj.key] !== undefined) return prev;
                let roundIdx = -1;
                for (let i = 0; i < roundsRef.current.length; i++) {
                  if (
                    roundsRef.current[i]!.responses.some((r) => r.key === obj.key)
                  ) {
                    roundIdx = i;
                    break;
                  }
                }
                const isLatest = roundIdx === roundsRef.current.length - 1;
                return { ...prev, [obj.key]: isLatest };
              });
              break;
            case "saved":
              // Server inserted/updated the model_responses row and is
              // telling us its id. This is what unlocks per-lane
              // synthesis without waiting for the whole stream to close.
              if (typeof obj.response_id === "string") {
                updateResponse(obj.key, {
                  responseId: obj.response_id as string,
                });
              }
              break;
            case "error": {
              const retryAfterMs =
                typeof obj.retryAfterMs === "number" ? obj.retryAfterMs : 0;
              const responseKey = obj.key as string;
              const maxAutoRetries = 2;
              const autoRetries = autoRetryCountRef.current[responseKey] ?? 0;
              if (retryAfterMs > 0 && autoRetries < maxAutoRetries) {
                autoRetryCountRef.current[responseKey] = autoRetries + 1;
                let secondsLeft = Math.ceil(retryAfterMs / 1000);

                const tickCountdown = () => {
                  updateResponse(responseKey, {
                    status: "pending",
                    error: null,
                    content: `Retrying in ${secondsLeft}s...`,
                  });
                };

                tickCountdown();
                const intervalId = window.setInterval(() => {
                  secondsLeft -= 1;
                  if (secondsLeft > 0) {
                    tickCountdown();
                  }
                }, 1000);

                window.setTimeout(() => {
                  window.clearInterval(intervalId);
                  updateResponse(responseKey, {
                    status: "pending",
                    content: "",
                    error: undefined,
                  });
                  const row = roundsRef.current
                    .flatMap((round) => round.responses)
                    .find((r) => r.key === responseKey);
                  if (row) {
                    setRetryingKey(null);
                    retryingKeyRef.current = null;
                    void retryOneRef.current(row);
                  }
                }, retryAfterMs);
                break;
              }

              updateResponse(obj.key, {
                status: "error",
                error: obj.error || "Request failed",
              });
              // Auto-disable Continue + Use in Synthesis for the failed
              // lane. Spec: "failed models should not keep participating
              // by default." The user can still flip them back on by
              // clicking Retry model on the card.
              const mk = findModelKey(obj.key);
              if (mk) {
                setContinueByModelKey((prev) => ({ ...prev, [mk]: false }));
              }
              setUseInSynthesisByKey((prev) => ({
                ...prev,
                [obj.key]: false,
              }));
              break;
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      try {
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
      } catch (err) {
        // AbortError (user clicked "Stop waiting") or network drop. Fall
        // through to the stuck-lane cleanup below — we treat both the
        // same way: any lane still pending/streaming gets a clear error.
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        if (!aborted) {
          // Re-surface unexpected stream errors in the global error UI;
          // don't swallow silently.
          setGlobalError(
            err instanceof Error ? err.message : "Stream interrupted"
          );
        }
      }

      const stuckErrorMessage =
        opts.abortedMessage ??
        "Stopped waiting on this model — it did not respond in time.";
      const stuck = roundsRef.current.flatMap((round) =>
        round.responses.filter(
          (r) =>
            (!opts.filterKey || r.key === opts.filterKey) &&
            (r.status === "pending" || r.status === "streaming")
        )
      );
      if (stuck.length > 0) {
        const stuckKeys = new Set(stuck.map((r) => r.key));
        const next = roundsRef.current.map((round) => ({
          ...round,
          responses: round.responses.map((r) =>
            stuckKeys.has(r.key)
              ? {
                  ...r,
                  status: "error" as const,
                  error: stuckErrorMessage,
                }
              : r
          ),
        }));
        roundsRef.current = next;
        setRounds(next);
        // Apply the same auto-disable rules as a server-sent error so
        // stragglers don't sneak into the next round / synthesis.
        setContinueByModelKey((prev) => {
          const out = { ...prev };
          for (const r of stuck) {
            out[modelKeyOf(r.provider, r.model)] = false;
          }
          return out;
        });
        setUseInSynthesisByKey((prev) => {
          const out = { ...prev };
          for (const k of Array.from(stuckKeys)) out[k] = false;
          return out;
        });
      }
    },
    []
  );

  /**
   * "Stop waiting on slow models" — user-facing escape hatch for hung
   * lanes. Aborts the in-flight /api/compare fetch. The reader in
   * consumeSseStream catches AbortError, the per-lane cleanup marks any
   * still-pending lanes as errored with our abortedMessage, and the
   * runCompare / runFollowUpCompare ends. "Ask this model" uses a separate
   * controller and is unaffected.
   */
  function cancelInFlightStream() {
    const ctrl = mainBatchAbortRef.current;
    if (!ctrl) return;
    mainBatchAbortRef.current = null;
    try {
      ctrl.abort();
    } catch {
      // ignore — controller may already be aborted
    }
  }

  async function runCompare() {
    if (
      !prompt.trim() ||
      selectedModels.length === 0 ||
      phase === "streaming" ||
      retryingKey
    ) {
      return;
    }

    const effectivePrompt = prompt.trim() + buildFileContextText(attachedFiles);
    setAttachedFiles([]);

    try {
      clearCompareSnapshotStorage();
    } catch {
      /* ignore */
    }

    setGlobalError(null);
    setConversationId(null);
    setFollowUpPrompt("");
    setMainBatchStreaming(true);
    setPhase("streaming");

    // Fresh compare → fresh selection state. Every freshly-chosen model
    // starts with "Continue with this model" turned on; every successful
    // response will be eligible for Synthesis until the user opts out.
    const seedContinue: Record<string, boolean> = {};
    for (const m of selectedModels) {
      seedContinue[modelKeyOf(m.provider, m.modelId)] = true;
    }
    setContinueByModelKey(seedContinue);

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
      responseId: null,
    }));
    const seedSynthesis: Record<string, boolean> = {};
    for (const r of initial) seedSynthesis[r.key] = true;
    setUseInSynthesisByKey(seedSynthesis);
    const r0: CompareRound[] = [
      { prompt: effectivePrompt, responses: initial, kind: "main" },
    ];
    roundsRef.current = r0;
    setRounds(r0);

    const controller = new AbortController();
    mainBatchAbortRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectivePrompt,
          model_ids,
          project_id: resolveCompareProjectId(selectedProjectId),
          tone: selectedTone,
          web_search: webSearchEnabled,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setGlobalError(err instanceof Error ? err.message : "Network error");
      }
      setPhase("idle");
      setRounds([]);
      roundsRef.current = [];
      mainBatchAbortRef.current = null;
      setMainBatchStreaming(false);
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(errText || `Request failed (${res.status})`);
      setPhase("idle");
      setRounds([]);
      roundsRef.current = [];
      mainBatchAbortRef.current = null;
      setMainBatchStreaming(false);
      return;
    }

    let streamedConversationId: string | null = null;
    await consumeSseStream(res, {
      onMeta: (meta) => {
        streamedConversationId = meta.conversation_id;
        setConversationId(meta.conversation_id);
        if (meta.lanes?.length) {
          applyServerAllocatedRound(0, effectivePrompt, meta.lanes, "main");
        }
      },
      abortedMessage:
        "Stopped waiting on this model — it did not respond in time.",
    });
    mainBatchAbortRef.current = null;
    setMainBatchStreaming(false);

    setPhase("saving");
    await persistRoundAndAttachIds(
      streamedConversationId ?? conversationId ?? null,
      0
    );
    setPhase("done");
  }

  /**
   * Persist the latest round and attach the server-assigned response_ids
   * back onto the in-memory state. Also auto-selects each successful
   * response into the "Use in Synthesis" pool. No scoring side-effects
   * — Session 11 makes grading strictly user-initiated.
   */
  async function persistRoundAndAttachIds(
    streamedConvId: string | null,
    roundIndex?: number
  ) {
    const idx =
      roundIndex !== undefined
        ? roundIndex
        : roundsRef.current.length - 1;
    const targetRound = roundsRef.current[idx] ?? null;
    if (!targetRound) return;
    const savePrompt = targetRound.prompt;
    const saveRows = targetRound.responses;

    try {
      const saveRes = await fetch("/api/compare/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: streamedConvId ?? conversationId ?? undefined,
          project_id: resolveCompareProjectId(selectedProjectId),
          prompt: savePrompt,
          round_number: idx,
          responses: saveRows.map((r) => ({
            key: r.key,
            position: r.position,
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

      if (Array.isArray(data.response_ids)) {
        const idByKey = new Map<string, string>(
          data.response_ids.map((row: { key: string; id: string }) => [
            row.key,
            row.id,
          ])
        );
        const cur = roundsRef.current;
        if (cur.length > 0 && idx >= 0 && idx < cur.length) {
          const round = cur[idx]!;
          const nextRound = {
            ...round,
            responses: round.responses.map((r) => ({
              ...r,
              responseId: idByKey.get(r.key) ?? r.responseId,
            })),
          };
          const next = [...cur.slice(0, idx), nextRound, ...cur.slice(idx + 1)];
          roundsRef.current = next;
          setRounds(next);

          // Default-include successful responses in the latest round only.
          setUseInSynthesisByKey((prev) => {
            const out = { ...prev };
            const latestIdx = roundsRef.current.length - 1;
            for (let i = 0; i < roundsRef.current.length; i++) {
              if (i === latestIdx) continue;
              for (const r of roundsRef.current[i]!.responses) {
                if (out[r.key] === undefined) out[r.key] = false;
              }
            }
            if (idx === latestIdx) {
              for (const r of nextRound.responses) {
                if (r.status === "done" && !r.error && r.content.trim()) {
                  if (out[r.key] === undefined) out[r.key] = true;
                }
              }
            }
            return out;
          });
        }
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function continueModelToChat(r: ResponseState, roundPrompt: string) {
    if (!r.content.trim() || r.status !== "done" || r.error) return;
    const nonce =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `handoff-${Date.now()}`;
    const handoff: CompareToChatHandoff = {
      provider: r.provider,
      model: r.model,
      comparePrompt: roundPrompt,
      compareResponse: r.content,
      projectId: resolveCompareProjectId(selectedProjectId),
      tone: selectedTone,
      pristineCompareThread: true,
    };
    try {
      sessionStorage.setItem(
        compareToChatStorageKey(nonce),
        JSON.stringify(handoff)
      );
    } catch {
      setGlobalError("Could not start chat handoff (storage unavailable).");
      return;
    }
    router.push(`/chat?fromCompare=1&h=${encodeURIComponent(nonce)}`);
  }

  /**
   * Main follow-up. Only fires for models marked "Continue with this
   * model" on at least one prior response. Models opted out are kept in
   * the workspace but skipped this round.
   */
  async function runFollowUpCompare() {
    if (
      !followUpPrompt.trim() ||
      !conversationId ||
      followUpInFlight ||
      retryingKey
    ) {
      return;
    }

    // Build the participating model set from what's actually present in
    // the workspace right now, not from the top-of-page checkboxes. The
    // user picked their participants when running the first compare;
    // we only honour their per-model "Continue" toggles here.
    const knownModels = new Map<string, { provider: string; modelId: string }>();
    for (const round of roundsRef.current) {
      for (const r of round.responses) {
        const mk = modelKeyOf(r.provider, r.model);
        if (!knownModels.has(mk)) {
          knownModels.set(mk, { provider: r.provider, modelId: r.model });
        }
      }
    }
    const participants = Array.from(knownModels.entries())
      .filter(([mk]) => continueByModelKey[mk] !== false)
      .map(([, v]) => v);

    if (participants.length === 0) {
      setGlobalError(
        'No models have "Continue in next round" turned on. Turn it on for at least one model, or use "Ask this model" for a single-model follow-up.'
      );
      return;
    }

    setGlobalError(null);
    setFollowUpInFlight(true);
    setMainBatchStreaming(true);

    const model_ids = participants.map((m) => ({
      provider: m.provider,
      model: m.modelId,
    }));

    const followUpPromptText = followUpPrompt.trim();
    const followUpRoundIndex = roundsRef.current.length;

    const controller = new AbortController();
    mainBatchAbortRef.current = controller;

    let activeConversationId = conversationId;
    let res: Response;
    try {
      res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: followUpPrompt.trim(),
          model_ids,
          project_id: resolveCompareProjectId(selectedProjectId),
          tone: selectedTone,
          conversation_id: conversationId,
          compare_follow_up: true,
          web_search: webSearchEnabled,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setGlobalError(err instanceof Error ? err.message : "Network error");
      }
      setFollowUpInFlight(false);
      setMainBatchStreaming(false);
      mainBatchAbortRef.current = null;
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(parseCompareErrorResponse(errText, res.status));
      setFollowUpInFlight(false);
      setMainBatchStreaming(false);
      mainBatchAbortRef.current = null;
      return;
    }

    let roundProvisioned = false;
    await consumeSseStream(res, {
      onMeta: (meta) => {
        activeConversationId = meta.conversation_id;
        setConversationId(meta.conversation_id);
        if (meta.lanes?.length) {
          applyServerAllocatedRound(
            followUpRoundIndex,
            followUpPromptText,
            meta.lanes,
            meta.round_kind === "branch" ? "branch" : "main"
          );
          roundProvisioned = true;
        }
      },
      abortedMessage:
        "Stopped waiting on this model — it did not respond in time.",
    });
    mainBatchAbortRef.current = null;
    setMainBatchStreaming(false);

    if (!roundProvisioned) {
      setGlobalError("Follow-up could not start — server did not assign lanes.");
      setFollowUpInFlight(false);
      return;
    }

    try {
      await persistRoundAndAttachIds(activeConversationId, followUpRoundIndex);
      setFollowUpPrompt("");
    } catch (err) {
      console.error("[compare-ui] follow-up persist failed:", err);
      setGlobalError(
        err instanceof Error ? err.message : "Follow-up save failed"
      );
    } finally {
      setFollowUpInFlight(false);
    }
  }

  /**
   * "Ask this model" — isolated single-model follow-up. Independent from the
   * main batch `phase`: it must work while other lanes are still pending.
   */
  async function askThisModel(
    provider: string,
    modelId: string,
    branchPrompt: string
  ) {
    if (
      !branchPrompt.trim() ||
      !conversationId ||
      retryingKey ||
      askingModelKey
    ) {
      return;
    }

    const mk = modelKeyOf(provider, modelId);
    setAskingModelKey(mk);
    setGlobalError(null);

    const branchPromptText = branchPrompt.trim();
    const branchRoundIndex = roundsRef.current.length;

    const controller = new AbortController();
    branchAskAbortRef.current = controller;

    let activeConversationId = conversationId;
    let res: Response;
    try {
      res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: branchPrompt.trim(),
          model_ids: [{ provider, model: modelId }],
          project_id: resolveCompareProjectId(selectedProjectId),
          tone: selectedTone,
          conversation_id: conversationId,
          ask_model: true,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setGlobalError(err instanceof Error ? err.message : "Network error");
      }
      setAskingModelKey(null);
      branchAskAbortRef.current = null;
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(parseCompareErrorResponse(errText, res.status));
      setAskingModelKey(null);
      branchAskAbortRef.current = null;
      return;
    }

    let roundProvisioned = false;
    await consumeSseStream(res, {
      onMeta: (meta) => {
        activeConversationId = meta.conversation_id;
        setConversationId(meta.conversation_id);
        if (meta.lanes?.length) {
          applyServerAllocatedRound(
            branchRoundIndex,
            branchPromptText,
            meta.lanes,
            "branch"
          );
          roundProvisioned = true;
        }
      },
      abortedMessage:
        "Stopped waiting on this model — it did not respond in time.",
    });
    branchAskAbortRef.current = null;

    if (!roundProvisioned) {
      setGlobalError("Ask this model could not start — server did not assign lanes.");
      setAskingModelKey(null);
      return;
    }

    await persistRoundAndAttachIds(activeConversationId, branchRoundIndex);
    setAskingModelKey(null);
  }

  function promptForResponseKey(key: string): string {
    for (const round of roundsRef.current) {
      if (round.responses.some((x) => x.key === key)) return round.prompt;
    }
    return prompt;
  }

  async function retryOne(r: ResponseState) {
    const roundPrompt = promptForResponseKey(r.key);
    if (!roundPrompt.trim() || !conversationId || retryingKeyRef.current) {
      return;
    }

    setGlobalError(null);
    setRetryingKey(r.key);
    retryingKeyRef.current = r.key;

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
          prompt: roundPrompt,
          model_ids: [{ provider: r.provider, model: r.model }],
          project_id: resolveCompareProjectId(selectedProjectId),
          tone: selectedTone,
          conversation_id: conversationId,
          retry_position: r.position,
        }),
      });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Network error");
      setRetryingKey(null);
      retryingKeyRef.current = null;
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setGlobalError(errText || `Request failed (${res.status})`);
      setRetryingKey(null);
      retryingKeyRef.current = null;
      return;
    }

    await consumeSseStream(res, { filterKey: r.key });

    const updated = roundsRef.current
      .flatMap((round) => round.responses)
      .find((row) => row.key === r.key);
    const mk = modelKeyOf(r.provider, r.model);
    let roundIdx = -1;
    for (let i = 0; i < roundsRef.current.length; i++) {
      if (roundsRef.current[i]!.responses.some((row) => row.key === r.key)) {
        roundIdx = i;
        break;
      }
    }
    const isLatestRound = roundIdx === roundsRef.current.length - 1;
    if (
      updated &&
      updated.status === "done" &&
      !updated.error &&
      updated.content.trim()
    ) {
      setContinueByModelKey((prev) => ({ ...prev, [mk]: true }));
      if (isLatestRound) {
        setUseInSynthesisByKey((prev) => ({ ...prev, [r.key]: true }));
      }
    } else {
      setContinueByModelKey((prev) => ({ ...prev, [mk]: false }));
      setUseInSynthesisByKey((prev) => ({ ...prev, [r.key]: false }));
    }

    // Persistence happens server-side in the stream. We don't auto-score
    // (Session 11) so there's no follow-up call here. If the user wants
    // scores after a retry, they'll click "Grade answer" on the card.
    setRetryingKey(null);
    retryingKeyRef.current = null;
  }

  retryOneRef.current = retryOne;

  function updateCard(key: string, patch: Partial<ResponseState>) {
    const cur = roundsRef.current;
    const next = cur.map((round) => ({
      ...round,
      responses: round.responses.map((row) =>
        row.key === key ? { ...row, ...patch } : row
      ),
    }));
    roundsRef.current = next;
    setRounds(next);
  }

  /**
   * Build the list of response_ids the user has marked "Use in Synthesis".
   * Only `done`+non-empty responses with a server-assigned `responseId`
   * qualify (we can't synthesize from rows that haven't been persisted).
   */
  function selectedSynthesisResponseIds(): string[] {
    const ids: string[] = [];
    for (const round of roundsRef.current) {
      for (const r of round.responses) {
        if (!r.responseId) continue;
        if (r.status !== "done" || r.error || !r.content.trim()) continue;
        if (useInSynthesisByKey[r.key] === false) continue;
        ids.push(r.responseId);
      }
    }
    return ids;
  }

  function selectedSynthesisCount(): number {
    let n = 0;
    for (const round of roundsRef.current) {
      for (const r of round.responses) {
        if (r.status !== "done" || r.error || !r.content.trim()) continue;
        if (useInSynthesisByKey[r.key] === false) continue;
        n++;
      }
    }
    return n;
  }

  async function createSynthesis() {
    if (!conversationId || synthLoading) return;
    const sourceIds = selectedSynthesisResponseIds();
    if (sourceIds.length < 1) {
      setGlobalError(
        'Mark at least one response with "Use in Synthesis" before generating.'
      );
      return;
    }
    setSynthLoading(true);
    setGlobalError(null);
    try {
      const res = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparison_id: conversationId,
          conversation_id: conversationId,
          compare_key_mode: "byok",
          tone: selectedTone,
          project_id: resolveCompareProjectId(selectedProjectId),
          source_response_ids: sourceIds,
          synthesis_provider: synthesisProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Synthesis failed");
      if (data.synthesis_id) setLatestSynthesisId(data.synthesis_id as string);
      router.push(`/synthesis/${data.synthesis_id}`);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Synthesis failed");
    } finally {
      setSynthLoading(false);
    }
  }

  /**
   * On-demand grading. `responseKeys` may be 1 (Grade answer on a card)
   * or many (Grade selected responses). The route only touches rows we
   * own (re-verified server-side via the conversation's user_id).
   */
  async function gradeResponses(responseKeys: string[]) {
    if (!conversationId || responseKeys.length === 0) return;

    // Resolve keys to server response_ids and build a key↔id index for
    // applying scores back onto the cards.
    const ids: string[] = [];
    const idByKey = new Map<string, string>();
    const keyById = new Map<string, string>();
    for (const round of roundsRef.current) {
      for (const r of round.responses) {
        if (!responseKeys.includes(r.key)) continue;
        if (!r.responseId) continue;
        if (r.status !== "done" || r.error || !r.content.trim()) continue;
        ids.push(r.responseId);
        idByKey.set(r.key, r.responseId);
        keyById.set(r.responseId, r.key);
      }
    }
    if (ids.length === 0) {
      setGlobalError("Nothing to grade — pick at least one complete response.");
      return;
    }

    setGlobalError(null);
    const keysToMark = Array.from(idByKey.keys());
    setGradingKeys((prev) => {
      const next = { ...prev };
      for (const k of keysToMark) next[k] = true;
      return next;
    });

    try {
      const res = await fetch("/api/compare/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          response_ids: ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grading failed");
      if (Array.isArray(data.scores)) {
        const scoreByKey = new Map<string, ResponseCardScores>();
        for (const s of data.scores as (ResponseCardScores & {
          key: string;
          response_id: string | null;
        })[]) {
          // Prefer the server-supplied response_id round-trip if present.
          const cardKey = s.response_id ? keyById.get(s.response_id) : s.key;
          if (!cardKey) continue;
          scoreByKey.set(cardKey, {
            accuracy: s.accuracy,
            clarity: s.clarity,
            creativity: s.creativity,
            usefulness: s.usefulness,
            risk: s.risk,
          });
        }
        const cur = roundsRef.current;
        const next = cur.map((round) => ({
          ...round,
          responses: round.responses.map((row) => ({
            ...row,
            scores: scoreByKey.get(row.key) ?? row.scores,
          })),
        }));
        roundsRef.current = next;
        setRounds(next);
      }
      if (data.scoring_error) {
        setGlobalError(`Grading completed with errors: ${data.scoring_error}`);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Grading failed");
    } finally {
      setGradingKeys((prev) => {
        const next = { ...prev };
        for (const k of keysToMark) delete next[k];
        return next;
      });
    }
  }

  async function gradeSelected() {
    if (!conversationId || batchGrading) return;
    const keys: string[] = [];
    for (const round of roundsRef.current) {
      for (const r of round.responses) {
        if (useInSynthesisByKey[r.key] === false) continue;
        if (r.status !== "done" || r.error || !r.content.trim()) continue;
        if (!r.responseId) continue;
        keys.push(r.key);
      }
    }
    if (keys.length === 0) {
      setGlobalError(
        'Nothing selected. Use "Use in Synthesis" to mark responses to grade.'
      );
      return;
    }
    setBatchGrading(true);
    try {
      await gradeResponses(keys);
    } finally {
      setBatchGrading(false);
    }
  }

  // Per-lane gates — no longer blocked by the slowest model. As soon as
  // ANY lane finishes we expose the workspace footer; the user can act on
  // settled lanes immediately and either wait on stragglers or click
  // "Stop waiting on slow models".
  const hasAnySettled = flatResponses.some(
    (r) => r.status === "done" || r.status === "error"
  );
  const hasAnyPending = flatResponses.some(
    (r) => r.status === "pending" || r.status === "streaming"
  );
  const canStopWaiting =
    mainBatchStreaming && hasAnyPending && hasAnySettled;

  // ─── Per-model derived state (Session 11) ───────────────────────────────
  //
  // The "Continue with this model" / "Ask this model" controls only make
  // sense on ONE card per model — the latest one. Include in-flight lanes
  // so checkboxes stay visible and stable during streaming.
  const latestKeyByModel = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const round = rounds[i]!;
      for (const r of round.responses) {
        const mk = modelKeyOf(r.provider, r.model);
        if (!map.has(mk)) map.set(mk, r.key);
      }
    }
    return map;
  }, [rounds]);

  // Models that appear ANYWHERE in the workspace — used to surface the
  // per-model summary above the main follow-up box ("3 of 4 will continue").
  const workspaceModels = useMemo(() => {
    const seen = new Map<string, { provider: string; model: string; label: string }>();
    for (const round of rounds) {
      for (const r of round.responses) {
        const mk = modelKeyOf(r.provider, r.model);
        if (!seen.has(mk)) {
          seen.set(mk, {
            provider: r.provider,
            model: r.model,
            label: r.modelLabel,
          });
        }
      }
    }
    return Array.from(seen.entries()).map(([mk, v]) => ({ mk, ...v }));
  }, [rounds]);

  const continueCount = workspaceModels.filter(
    (m) => continueByModelKey[m.mk] !== false
  ).length;

  const synthesisCount = selectedSynthesisCount();

  const focusedContext = useMemo(() => {
    if (!focusedResponseKey) return null;
    for (const round of rounds) {
      const r = round.responses.find((x) => x.key === focusedResponseKey);
      if (r) return { r, round };
    }
    return null;
  }, [focusedResponseKey, rounds]);

  function buildResponseCardProps(
    r: ResponseState,
    round: CompareRound,
    options?: {
      onExpand?: () => void;
      expanded?: boolean;
      continueInChatLabel?: string;
    }
  ): ResponseCardProps {
    const mk = modelKeyOf(r.provider, r.model);
    const isLatestForModel = latestKeyByModel.get(mk) === r.key;
    const isComplete =
      r.status === "done" && !r.error && !!r.content.trim();

    return {
      provider: r.provider,
      providerLabel: getProviderLabel(r.provider),
      model: r.model,
      modelLabel: r.modelLabel,
      content: r.content,
      status:
        retryingKey === r.key
          ? "streaming"
          : r.status === "pending" &&
              (mainBatchStreaming || followUpInFlight || askingModelKey === mk)
            ? "pending"
            : r.status,
      error: r.error,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      cost: calcCompareModelCost(
        r.provider,
        r.model,
        r.tokensIn,
        r.tokensOut
      ),
      latencyMs: r.latencyMs,
      scores: r.scores,
      isBranch: round.kind === "branch",
      onRetry:
        r.status === "error" && conversationId && !retryingKey
          ? () => void retryOne(r)
          : undefined,
      onContinueInChat:
        isComplete && conversationId && !retryingKey
          ? () => continueModelToChat(r, promptForResponseKey(r.key))
          : undefined,
      continueInChatLabel: options?.continueInChatLabel,
      useInSynthesis:
        r.status !== "error"
          ? {
              checked: useInSynthesisByKey[r.key] !== false,
              onChange: (next) =>
                setUseInSynthesisByKey((prev) => ({
                  ...prev,
                  [r.key]: next,
                })),
            }
          : undefined,
      continueWithModel:
        isLatestForModel && r.status !== "error"
          ? {
              checked: continueByModelKey[mk] !== false,
              onChange: (next) =>
                setContinueByModelKey((prev) => ({
                  ...prev,
                  [mk]: next,
                })),
            }
          : undefined,
      askThisModel:
        isComplete &&
        isLatestForModel &&
        conversationId &&
        !retryingKey
          ? {
              onSubmit: (text) => askThisModel(r.provider, r.model, text),
              isStreaming: askingModelKey === mk,
            }
          : undefined,
      grade: isComplete
        ? {
            onClick: () => gradeResponses([r.key]),
            isGrading: !!gradingKeys[r.key],
          }
        : undefined,
      onExpand: options?.onExpand,
      expanded: options?.expanded,
    };
  }

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
    <div className="flex min-h-[calc(100vh-4rem)] -mx-4 md:-mx-6">
      <CompareHistorySidebar
        activeId={conversationId}
        collapsed={historyCollapsed}
        onToggleCollapsed={() => setHistoryCollapsed((v) => !v)}
      />
      <div className="flex-1 min-w-0 overflow-auto px-4 md:px-6 py-6">
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {conversationId && sessionTitle ? (
          titleEditing ? (
            <input
              className="text-2xl font-bold bg-transparent border-b outline-none min-w-[12rem]"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              onBlur={async () => {
                setTitleEditing(false);
                if (!conversationId || !sessionTitle?.trim()) return;
                await fetch(`/api/conversations/${conversationId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: sessionTitle.trim() }),
                });
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="text-2xl font-bold text-left hover:opacity-80"
              onClick={() => setTitleEditing(true)}
              title="Click to rename"
            >
              {sessionTitle}
            </button>
          )
        ) : (
          <h1 className="text-2xl font-bold">Compare</h1>
        )}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {latestSynthesisId && (
            <Button asChild variant="default" size="sm" className="gap-1.5">
              <Link href={`/synthesis/${latestSynthesisId}`}>
                <Sparkles className="h-3.5 w-3.5" />
                View latest synthesis
              </Link>
            </Button>
          )}
          {selectedProjectId !== STANDALONE_PROJECT_VALUE &&
          projects.some((p) => p.id === selectedProjectId) ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link
                href={`/projects/${selectedProjectId}/syntheses`}
                className="inline-flex items-center gap-1.5"
              >
                Synthesis history
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/synthesis" className="inline-flex items-center gap-1.5">
                Synthesis history
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {showRestoreBanner && (
        <RestoreSessionBanner
          onDismiss={() => {
            setShowRestoreBanner(false);
            clearCompareSnapshotStorage();
          }}
        />
      )}

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
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STANDALONE_PROJECT_VALUE} className="text-xs">
                No project (standalone)
              </SelectItem>
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
          Models (up to {modelCap})
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
            const warningNote = getModelWarningNote(p.modelId);
            return (
              <label
                key={p.value}
                className={cn(
                  "flex items-center gap-2 text-xs cursor-pointer rounded-md border px-2 py-1.5",
                  checked
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <input
                  type="checkbox"
                  className="rounded border-muted-foreground"
                  checked={checked}
                  onChange={() => toggleModel(p.value)}
                />
                <span className="inline-flex flex-wrap items-baseline gap-x-1">
                  <span>{p.label}</span>
                  {warningNote && (
                    <span className="text-[11px] text-muted-foreground">
                      {warningNote}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <WebSearchToggle
        enabled={webSearchEnabled}
        onChange={setWebSearchEnabled}
        className="mb-1"
      />
      <FileAttachments
        files={attachedFiles}
        onChange={setAttachedFiles}
        disabled={phase === "streaming" || phase === "saving"}
        dropZone
        dropZoneHint="Drop files here or click to attach"
      >
        <ClearableTextarea
          placeholder="Enter your prompt — it will run on every selected model in parallel…"
          className="resize-none min-h-[100px] pl-10 border-0 bg-transparent focus-visible:ring-0 shadow-none"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onClear={() => setPrompt("")}
          disabled={phase === "streaming" || phase === "saving"}
        />
        {prompt.length > COMPARE_PROMPT_SOFT_CHAR_LIMIT && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5 px-3 pb-2">
            Long prompts may fail on some models (especially Groq). Consider
            shortening to under{" "}
            {COMPARE_PROMPT_SOFT_CHAR_LIMIT.toLocaleString()} characters.
          </p>
        )}
      </FileAttachments>

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
              ? "Saving…"
              : "Run Compare"}
        </Button>
        {/* "Stop waiting on slow models" — only offered when some lanes
            are done while others are still pending. Without this, a 6-
            model compare with one stuck provider blocks synthesis /
            follow-up for the full 5-minute per-member timeout. */}
        {canStopWaiting && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={cancelInFlightStream}
          >
            Stop waiting on slow models
          </Button>
        )}
        {selectedModels.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Estimated: ~{formatCostRange(costEstimate)} for this{" "}
            {selectedModels.length}-model compare
          </span>
        )}
        {phase === "saving" && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Saving responses…
          </span>
        )}
      </div>

      {globalError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
          {globalError}
        </div>
      )}

      {rounds.length > 0 && (
        <div className="space-y-8">
          <p className="flex items-center gap-2 text-base text-primary whitespace-nowrap">
            <BarChart2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Scores (when available): <span className="font-medium">A</span>
              ccuracy · <span className="font-medium">C</span>larity ·{" "}
              <span className="font-medium">C</span>reativity ·{" "}
              <span className="font-medium">U</span>sefulness ·{" "}
              <span className="font-medium">R</span>isk (higher = more risk)
            </span>
          </p>

          {rounds.map((round, ri) => (
            <div key={`round-${ri}`} className="space-y-4">
              {ri > 0 && <div className="border-t border-dashed pt-6" aria-hidden />}
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Round {ri + 1}</span>
                {round.kind === "branch" && round.responses[0] && (
                  <span className="rounded-full border border-dashed px-2 py-0.5 normal-case text-[10px] font-normal tracking-normal">
                    Solo follow-up to {round.responses[0].modelLabel}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-primary/25 pl-3">
                {round.prompt}
              </p>
              <div
                className={
                  round.kind === "branch"
                    ? "grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl"
                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                }
              >
                {round.responses.map((r) => (
                  <ResponseCard
                    key={r.key}
                    {...buildResponseCardProps(r, round, {
                      onExpand: () => setFocusedResponseKey(r.key),
                    })}
                  />
                ))}
              </div>
            </div>
          ))}

          {flatResponses.some(
            (r) => r.status === "done" || r.status === "error"
          ) && (
            <div className="flex justify-end border-t pt-4">
              <p className="text-sm text-muted-foreground tabular-nums">
                Total estimated cost:{" "}
                <strong className="text-foreground">
                  ${totalActualCost.toFixed(5)}
                </strong>
              </p>
            </div>
          )}

          {/* ── Workspace actions: Synthesis + Grade selected ──────────────
              Session 12: footer renders as soon as ANY lane has settled
              and we have a conversation_id. Stragglers no longer block
              synthesis / grading. Continue Compare still waits for the
              stream to fully close (position-collision safety). */}
          {hasAnySettled && !retryingKey && conversationId && (
            <div className="space-y-3 border-t pt-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">
                  {synthesisCount} response{synthesisCount === 1 ? "" : "s"}{" "}
                  selected for synthesis ·{" "}
                  {continueCount} of {workspaceModels.length} active model
                  {workspaceModels.length === 1 ? "" : "s"} will continue
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void gradeSelected()}
                  disabled={batchGrading || synthesisCount === 0}
                >
                  {batchGrading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Scale className="h-3.5 w-3.5" />
                  )}
                  Grade selected responses
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground shrink-0">
                    Synthesize with:
                  </span>
                  <Select
                    value={synthesisProvider}
                    onValueChange={setSynthesisProvider}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-44 text-xs">
                      <SelectValue placeholder="Auto (recommended)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" className="text-xs">
                        Auto (recommended)
                      </SelectItem>
                      {connectedSynthesisProviders.map((provider) => (
                        <SelectItem
                          key={provider}
                          value={provider}
                          className="text-xs"
                        >
                          {getProviderLabel(provider)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                variant="default"
                onClick={createSynthesis}
                disabled={
                  !conversationId || synthLoading || synthesisCount < 1
                }
              >
                <Sparkles className="h-4 w-4" />
                {synthLoading
                  ? "Creating LettiB Synthesis…"
                  : `Generate Synthesis from ${synthesisCount} selected response${
                      synthesisCount === 1 ? "" : "s"
                    }`}
              </Button>
              {synthesisCount < 1 && (
                <p className="text-xs text-center text-muted-foreground">
                  Mark at least one response “Use in Synthesis” to enable
                  Synthesis. Two or more is recommended.
                </p>
              )}
            </div>
          )}

          {/* ── Main follow-up ─────────────────────────────────────────────
              Server allocates positions with compare_alloc_next_round (migration 029)
              so this can run while the initial compare is still streaming.
              Double-submit is prevented with followUpInFlight. */}
          {hasAnySettled && !retryingKey && conversationId && (
            <div className="space-y-3 border-t pt-6">
              <p className="text-xs font-medium text-muted-foreground">
                Send follow-up to {continueCount} active model
                {continueCount === 1 ? "" : "s"}
              </p>
              <ClearableTextarea
                placeholder="Continue the thread — only models with 'Continue in next round' on will reply…"
                className="resize-none min-h-[80px]"
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                onClear={() => setFollowUpPrompt("")}
              />
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => void runFollowUpCompare()}
                disabled={
                  !followUpPrompt.trim() ||
                  continueCount === 0 ||
                  followUpInFlight ||
                  !!retryingKey
                }
              >
                <Zap className="h-4 w-4" />
                {followUpInFlight
                  ? "Sending follow-up…"
                  : `Send follow-up to ${continueCount} active model${
                      continueCount === 1 ? "" : "s"
                    }`}
              </Button>
              {continueCount === 0 && workspaceModels.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  No models will receive this follow-up. Turn on “Continue
                  in next round” on at least one card, or use “Ask this
                  model” on a card for a single-model follow-up.
                </p>
              )}
              {mainBatchStreaming && hasAnyPending && (
                <p className="text-xs text-muted-foreground">
                  Some models are still responding. Wait for them, or
                  click <strong>Stop waiting on slow models</strong> above
                  to skip stragglers and continue.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
      </div>

      {focusedContext && (
        <ResponseFocusOverlay
          open={!!focusedResponseKey}
          onOpenChange={(open) => {
            if (!open) setFocusedResponseKey(null);
          }}
          title={`${getProviderLabel(focusedContext.r.provider)} · ${focusedContext.r.modelLabel}`}
        >
          <ResponseCard
            {...buildResponseCardProps(focusedContext.r, focusedContext.round, {
              expanded: true,
              continueInChatLabel: "Continue in Chat with this model",
            })}
          />
        </ResponseFocusOverlay>
      )}
    </div>
  );
}
