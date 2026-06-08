import { MODELS_CATALOG } from "@/lib/providers/models";

/** Soft UI warning when the compare prompt exceeds this length (characters). */
export const COMPARE_PROMPT_SOFT_CHAR_LIMIT = 4000;

/** Rough token estimate (~4 chars per token) for non-Groq providers. */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export type ComparePayload = {
  userContent: string;
  systemPrompt: string;
};

function modelContextLimit(provider: string, model: string): number | null {
  const catalog = MODELS_CATALOG[provider as keyof typeof MODELS_CATALOG];
  if (!catalog) return null;
  const entry = catalog.find((m) => m.id === model);
  return entry?.context ?? null;
}

/**
 * Per-provider payload guard before a compare lane is sent. Groq truncation
 * happens in lib/providers/groq.ts at stream time.
 */
export function prepareComparePayloadForProvider(
  provider: string,
  model: string,
  userContent: string,
  systemPrompt: string
): ComparePayload {
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

export function isGroqAutoRetryError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("request entity too large") ||
    lower.includes("too many tokens") ||
    lower.includes("rate limit") ||
    lower.includes("try again")
  );
}

export function humanizeCompareLaneError(
  message: string,
  provider?: string
): string {
  if (provider === "groq") return message;
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
