import { MODELS_CATALOG } from "@/lib/providers/models";
import { isGroqCompoundModel } from "@/lib/providers/groq-compound";

/** Soft UI warning when the compare prompt exceeds this length (characters). */
export const COMPARE_PROMPT_SOFT_CHAR_LIMIT = 4000;

const GROQ_COMPOUND_MAX_TOTAL_TOKENS = 4000;
const GROQ_COMPOUND_MAX_HISTORY_TOKENS = 2000;

/** Groq Compound lanes use smaller effective context than Llama Groq models. */
export const GROQ_COMPOUND_MODEL_IDS = [
  "groq/compound",
  "groq/compound-mini",
] as const;

const GROQ_MODEL_TOKEN_LIMITS: Record<
  string,
  { maxTotalTokens: number; maxHistoryTokens: number }
> = {
  "llama-3.3-70b-versatile": {
    maxTotalTokens: 4000,
    maxHistoryTokens: 2000,
  },
  "llama-3.1-8b-instant": {
    maxTotalTokens: 2000,
    maxHistoryTokens: 1000,
  },
};

/**
 * Groq tokenizes denser than chars/4 — use a conservative ratio so truncation
 * runs before Groq returns 413 / "too many tokens".
 */
const GROQ_CHARS_PER_TOKEN = 2;

function groqCompareTokenLimits(model: string): {
  maxTotalTokens: number;
  maxHistoryTokens: number;
} {
  const configured = GROQ_MODEL_TOKEN_LIMITS[model];
  if (configured) return configured;

  if (
    GROQ_COMPOUND_MODEL_IDS.includes(
      model as (typeof GROQ_COMPOUND_MODEL_IDS)[number]
    )
  ) {
    return {
      maxTotalTokens: GROQ_COMPOUND_MAX_TOTAL_TOKENS,
      maxHistoryTokens: GROQ_COMPOUND_MAX_HISTORY_TOKENS,
    };
  }

  return {
    maxTotalTokens: 4000,
    maxHistoryTokens: 2000,
  };
}

/** Model id actually sent to Groq (web search upgrades Llama lanes to Compound). */
export function resolveGroqCompareLaneModel(
  model: string,
  webSearchEnabled: boolean
): string {
  if (webSearchEnabled && !isGroqCompoundModel(model)) {
    return "groq/compound";
  }
  return model;
}

const FOLLOW_UP_HISTORY_SEP = "\n\n---\n\nNew question:\n";

/** Rough token estimate (~4 chars per token) for non-Groq providers. */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateGroqTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / GROQ_CHARS_PER_TOKEN);
}

function groqMaxChars(maxTotalTokens: number): number {
  return maxTotalTokens * GROQ_CHARS_PER_TOKEN;
}

/** Keep the tail of `text` within an approximate token budget. */
function truncateTextToCharBudgetFromEnd(
  text: string,
  maxChars: number
): string {
  if (!text || maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function truncateTextToGroqTokenBudgetFromEnd(
  text: string,
  maxTokens: number
): string {
  return truncateTextToCharBudgetFromEnd(text, groqMaxChars(maxTokens));
}

export type ComparePayload = {
  userContent: string;
  systemPrompt: string;
};

export type FitGroqComparePayloadResult = ComparePayload & {
  truncated: boolean;
};

/**
 * Groq compare lanes can fail with HTTP 413 when recap + system context is
 * too large. Trim history first, then system prompt, then user content.
 */
export function fitGroqComparePayload(
  input: ComparePayload,
  model: string
): FitGroqComparePayloadResult {
  let userContent = input.userContent;
  let systemPrompt = input.systemPrompt;
  let truncated = false;
  const { maxTotalTokens, maxHistoryTokens } = groqCompareTokenLimits(model);
  const maxChars = groqMaxChars(maxTotalTokens);

  const payloadChars = () => userContent.length + systemPrompt.length;
  const payloadTokens = () =>
    estimateGroqTokens(userContent) + estimateGroqTokens(systemPrompt);

  console.log(
    `[groq] payload size before truncation: ${payloadChars()} chars (model: ${model}, budget: ${maxTotalTokens} tokens / ${maxChars} chars)`
  );

  const needsTruncation =
    payloadChars() > maxChars || payloadTokens() > maxTotalTokens;

  if (!needsTruncation) {
    return { userContent, systemPrompt, truncated: false };
  }

  console.log(`[groq] truncating to ${maxTotalTokens} tokens (model: ${model})`);

  const sepIdx = userContent.indexOf(FOLLOW_UP_HISTORY_SEP);
  if (sepIdx !== -1) {
    const recap = userContent.slice(0, sepIdx);
    const suffix = userContent.slice(sepIdx);
    const trimmedRecap = truncateTextToGroqTokenBudgetFromEnd(
      recap,
      maxHistoryTokens
    );
    if (trimmedRecap !== recap) truncated = true;
    userContent = trimmedRecap + suffix;
  }

  if (payloadTokens() > maxTotalTokens && systemPrompt) {
    const systemBudget = Math.max(
      0,
      maxTotalTokens - estimateGroqTokens(userContent)
    );
    const trimmedSystem = truncateTextToGroqTokenBudgetFromEnd(
      systemPrompt,
      systemBudget
    );
    if (trimmedSystem !== systemPrompt) truncated = true;
    systemPrompt = trimmedSystem;
  }

  if (payloadTokens() > maxTotalTokens) {
    const userBudget = Math.max(
      0,
      maxTotalTokens - estimateGroqTokens(systemPrompt)
    );
    const trimmedUser = truncateTextToGroqTokenBudgetFromEnd(
      userContent,
      userBudget
    );
    if (trimmedUser !== userContent) truncated = true;
    userContent = trimmedUser;
  }

  // Hard char ceiling — Groq may reject on request size before context window.
  if (payloadChars() > maxChars) {
    const userBudgetChars = Math.max(0, maxChars - systemPrompt.length);
    const trimmedUser = truncateTextToCharBudgetFromEnd(
      userContent,
      userBudgetChars
    );
    if (trimmedUser !== userContent) truncated = true;
    userContent = trimmedUser;
  }

  if (truncated) {
    console.warn(
      `[groq] truncated context for ${model} (${payloadChars()} chars, ~${payloadTokens()} est. tokens, budget ${maxTotalTokens})`
    );
  }

  return { userContent, systemPrompt, truncated };
}

function modelContextLimit(provider: string, model: string): number | null {
  const catalog = MODELS_CATALOG[provider as keyof typeof MODELS_CATALOG];
  if (!catalog) return null;
  const entry = catalog.find((m) => m.id === model);
  return entry?.context ?? null;
}

/**
 * Per-provider payload guard before a compare lane is sent. Groq payloads are
 * silently trimmed; other providers are returned unchanged after a limit check.
 */
export function prepareComparePayloadForProvider(
  provider: string,
  model: string,
  userContent: string,
  systemPrompt: string
): ComparePayload {
  if (provider === "groq") {
    return fitGroqComparePayload({ userContent, systemPrompt }, model);
  }

  const contextLimit = modelContextLimit(provider, model);
  if (contextLimit != null) {
    const estimated =
      estimateTextTokens(userContent) + estimateTextTokens(systemPrompt);
    if (estimated > contextLimit) {
      console.warn(
        `[compare] payload (~${estimated} tokens) exceeds ${provider}/${model} context (${contextLimit}); sending unchanged`
      );
    }
  }

  return { userContent, systemPrompt };
}

export function humanizeCompareLaneError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("request entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("413") ||
    lower.includes("context length exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("too many tokens")
  ) {
    return "Message too long for this model — try a shorter prompt";
  }
  return message;
}
