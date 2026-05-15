import {
  LETTIB_STATE_COMPARE,
  LEGACY_COMPARE_VIEW_SNAPSHOT_KEY,
  SESSION_STATE_TTL_MS,
} from "@/lib/session/keys";

/** @deprecated use LETTIB_STATE_COMPARE */
export const COMPARE_VIEW_SNAPSHOT_KEY = LEGACY_COMPARE_VIEW_SNAPSHOT_KEY;

export type CompareResponseSnapshot = {
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
  scores: {
    accuracy: number;
    clarity: number;
    creativity: number;
    usefulness: number;
    risk: number;
  } | null;
  /** model_responses.id, populated once the row is saved server-side. */
  responseId?: string | null;
  /** Session 11: tags rounds spawned by "Ask this model". */
  roundKind?: "main" | "branch";
};

/** Legacy v1 flat snapshot (single round). */
export type CompareViewSnapshotV1 = {
  version: 1;
  savedAt: number;
  prompt: string;
  selectedProjectId: string;
  selectedTone: string;
  conversationId: string | null;
  responses: CompareResponseSnapshot[];
};

export type CompareRoundSnapshot = {
  prompt: string;
  responses: CompareResponseSnapshot[];
  /** Session 11: 'main' (default) or 'branch' for "Ask this model" rounds. */
  kind?: "main" | "branch";
};

/** Current persisted Compare UI (multi-round + selection). */
export type CompareStateSnapshotV2 = {
  version: 2;
  savedAt: number;
  selectedProjectId: string;
  selectedTone: string;
  teamPresetId: string;
  selectedModelValues: string[];
  conversationId: string | null;
  rounds: CompareRoundSnapshot[];
  /**
   * Session 11: per-model "Continue with this model" toggles, keyed by
   * `${provider}::${model}`. Models not listed default to ON.
   */
  continueByModelKey?: Record<string, boolean>;
  /**
   * Session 11: per-response "Use in Synthesis" toggles, keyed by the
   * response key. Responses not listed default to ON.
   */
  useInSynthesisByResponseKey?: Record<string, boolean>;
};

export function readCompareSnapshotFromStorage(): CompareStateSnapshotV2 | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = sessionStorage.getItem(LETTIB_STATE_COMPARE);
    if (!raw) {
      raw = sessionStorage.getItem(LEGACY_COMPARE_VIEW_SNAPSHOT_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompareViewSnapshotV1 | CompareStateSnapshotV2;
    const savedAt =
      "savedAt" in parsed && typeof parsed.savedAt === "number"
        ? parsed.savedAt
        : 0;
    if (Date.now() - savedAt > SESSION_STATE_TTL_MS) {
      sessionStorage.removeItem(LETTIB_STATE_COMPARE);
      sessionStorage.removeItem(LEGACY_COMPARE_VIEW_SNAPSHOT_KEY);
      return null;
    }
    if (parsed.version === 2 && Array.isArray(parsed.rounds)) {
      return parsed;
    }
    if (parsed.version === 1 && Array.isArray(parsed.responses)) {
      return {
        version: 2,
        savedAt: parsed.savedAt,
        selectedProjectId: parsed.selectedProjectId,
        selectedTone: parsed.selectedTone,
        teamPresetId: "manual",
        selectedModelValues: [],
        conversationId: parsed.conversationId,
        rounds: [{ prompt: parsed.prompt, responses: parsed.responses }],
      };
    }
    return null;
  } catch {
    try {
      sessionStorage.removeItem(LETTIB_STATE_COMPARE);
      sessionStorage.removeItem(LEGACY_COMPARE_VIEW_SNAPSHOT_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeCompareSnapshotToStorage(s: CompareStateSnapshotV2) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LETTIB_STATE_COMPARE, JSON.stringify(s));
    sessionStorage.removeItem(LEGACY_COMPARE_VIEW_SNAPSHOT_KEY);
  } catch {
    /* quota / private mode */
  }
}

export function clearCompareSnapshotStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LETTIB_STATE_COMPARE);
    sessionStorage.removeItem(LEGACY_COMPARE_VIEW_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
