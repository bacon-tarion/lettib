import { MODELS_CATALOG } from "@/lib/providers/models";

/** Soft UI warning when the compare prompt exceeds this length (characters). */
export const COMPARE_PROMPT_SOFT_CHAR_LIMIT = 4000;

const GROQ_MAX_TOTAL_TOKENS = 8000;
const GROQ_MAX_HISTORY_TOKENS = 4000;
const GROQ_COMPOUND_MAX_TOTAL_TOKENS = 4000;
const GROQ_COMPOUND_MAX_HISTORY_TOKENS = 2000;

/** Groq Compound lanes use smaller effective context than Llama Groq models. */
export const GROQ_COMPOUND_MODEL_IDS = [
  "groq/compound",
  "groq/compound-mini",
] as const;

function groqCompareTokenLimits(model: string): {
  maxTotalTokens: number;
  maxHistoryTokens: number;
} {
  if (GROQ_COMPOUND_MODEL_IDS.includes(model as (typeof GROQ_COMPOUND_MODEL_IDS)[number])) {
    return {
      maxTotalTokens: GROQ_COMPOUND_MAX_TOTAL_TOKENS,
      maxHistoryTokens: GROQ_COMPOUND_MAX_HISTORY_TOKENS,
    };
  }
  return {
    maxTotalTokens: GROQ_MAX_TOTAL_TOKENS,
    maxHistoryTokens: GROQ_MAX_HISTORY_TOKENS,
  };
}

const FOLLOW_UP_HISTORY_SEP = "\n\n---\n\nNew question:\n";

/** Rough token estimate (~4 chars per token). */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Keep the tail of `text` within an approximate token budget. */
function truncateTextToTokenBudgetFromEnd(
  text: string,
  maxTokens: number
): string {
  if (!text || maxTokens <= 0) return "";
  if (estimateTextTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
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

  const totalTokens = () =>
    estimateTextTokens(userContent) + estimateTextTokens(systemPrompt);

  if (totalTokens() <= maxTotalTokens) {
    return { userContent, systemPrompt, truncated: false };
  }

  const sepIdx = userContent.indexOf(FOLLOW_UP_HISTORY_SEP);
  if (sepIdx !== -1) {
    const recap = userContent.slice(0, sepIdx);
    const suffix = userContent.slice(sepIdx);
    const trimmedRecap = truncateTextToTokenBudgetFromEnd(
      recap,
      maxHistoryTokens
    );
    if (trimmedRecap !== recap) truncated = true;
    userContent = trimmedRecap + suffix;
  }

  if (totalTokens() > maxTotalTokens && systemPrompt) {
    const systemBudget = Math.max(
      0,
      maxTotalTokens - estimateTextTokens(userContent)
    );
    const trimmedSystem = truncateTextToTokenBudgetFromEnd(
      systemPrompt,
      systemBudget
    );
    if (trimmedSystem !== systemPrompt) truncated = true;
    systemPrompt = trimmedSystem;
  }

  if (totalTokens() > maxTotalTokens) {
    const userBudget = Math.max(
      0,
      maxTotalTokens - estimateTextTokens(systemPrompt)
    );
    const trimmedUser = truncateTextToTokenBudgetFromEnd(userContent, userBudget);
    if (trimmedUser !== userContent) truncated = true;
    userContent = trimmedUser;
  }

  if (truncated) {
    console.warn("[compare] truncated context for Groq");
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
