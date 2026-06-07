import { generateText, streamText, type CoreMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

/** Compare follow-ups embed prior rounds before this separator. */
const FOLLOW_UP_HISTORY_SEP = "\n\n---\n\nNew question:\n";

export type GroqChatMessage = { role: string; content: string };

/** Hard total-content char ceiling enforced immediately before Groq HTTP calls. */
export function groqMaxContentChars(model: string): number {
  if (model === "llama-3.1-8b-instant") return 4000;
  return 8000;
}

function groqMessageContentChars(messages: GroqChatMessage[]): number {
  return messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
}

/**
 * Trim oldest conversation content first while keeping the system prompt and
 * the most recent user message intact.
 */
export function truncateGroqMessagesForModel(
  model: string,
  messages: GroqChatMessage[]
): GroqChatMessage[] {
  const maxChars = groqMaxContentChars(model);
  if (groqMessageContentChars(messages) <= maxChars) return messages;

  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length === 0) return messages;

  const middle = nonSystem.slice(0, -1).map((m) => ({ ...m }));
  let lastUser = { ...nonSystem[nonSystem.length - 1]! };

  const rebuild = () => [...systemMsgs, ...middle, lastUser];

  while (groqMessageContentChars(rebuild()) > maxChars && middle.length > 0) {
    middle.shift();
  }

  if (groqMessageContentChars(rebuild()) > maxChars) {
    const content = lastUser.content;
    const sepIdx = content.indexOf(FOLLOW_UP_HISTORY_SEP);
    if (sepIdx !== -1) {
      const recap = content.slice(0, sepIdx);
      const suffix = content.slice(sepIdx);
      const fixed = groqMessageContentChars(systemMsgs) + suffix.length;
      const recapBudget = Math.max(0, maxChars - fixed);
      const trimmedRecap =
        recap.length > recapBudget ? recap.slice(recap.length - recapBudget) : recap;
      lastUser = { ...lastUser, content: trimmedRecap + suffix };
    }
  }

  if (groqMessageContentChars(rebuild()) > maxChars) {
    const content = lastUser.content;
    const sepIdx = content.indexOf(FOLLOW_UP_HISTORY_SEP);
    const suffix = sepIdx !== -1 ? content.slice(sepIdx) : "";
    const prefix = sepIdx !== -1 ? content.slice(0, sepIdx) : content;
    const fixed = groqMessageContentChars(systemMsgs) + suffix.length;
    const prefixBudget = Math.max(0, maxChars - fixed);
    const trimmedPrefix =
      prefix.length > prefixBudget
        ? prefix.slice(prefix.length - prefixBudget)
        : prefix;
    lastUser = { ...lastUser, content: trimmedPrefix + suffix };
  }

  return rebuild();
}

/** Merge optional system prompt into a message list for truncation. */
export function truncateGroqChatRequest(input: {
  model: string;
  messages: GroqChatMessage[];
  systemPrompt?: string;
}): { messages: GroqChatMessage[]; systemPrompt?: string } {
  const merged: GroqChatMessage[] = [];
  if (input.systemPrompt?.trim()) {
    merged.push({ role: "system", content: input.systemPrompt.trim() });
  }
  for (const message of input.messages) {
    merged.push({ ...message });
  }

  const truncated = truncateGroqMessagesForModel(input.model, merged);
  const systemMsgs = truncated.filter((m) => m.role === "system");
  const rest = truncated.filter((m) => m.role !== "system");

  return {
    systemPrompt:
      systemMsgs.length > 0
        ? systemMsgs.map((m) => m.content).join("\n")
        : undefined,
    messages: rest,
  };
}

export function logGroqSend(model: string, messages: GroqChatMessage[]): void {
  const chars = groqMessageContentChars(messages);
  console.log(
    `[groq] SENDING request — model: ${model}, content chars: ${chars}`
  );
}

const TRANSIENT_MESSAGE_MARKERS = [
  "too many tokens",
  "message too long",
  "context_length_exceeded",
  "context length exceeded",
  "service unavailable",
  "rate limit",
  "overloaded",
  "try again",
  "please reduce",
] as const;

export function isGroqTransientError(
  status?: number,
  message?: string
): boolean {
  if (status === 503 || status === 429) return true;
  if (!message) return false;
  const lower = message.toLowerCase();
  if (lower.includes("503") || lower.includes("429")) return true;
  return TRANSIENT_MESSAGE_MARKERS.some((marker) => lower.includes(marker));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groqErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
  };
  if (typeof e.statusCode === "number") return e.statusCode;
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  return undefined;
}

function groqErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Retry a Groq async call once after 1s when the failure looks transient
 * (503/429, cold-start misclassified length errors, or overload wording).
 */
export async function withGroqRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      !isGroqTransientError(groqErrorStatus(err), groqErrorMessage(err))
    ) {
      throw err;
    }
    console.log("[groq] transient error, retrying in 1s...");
    await sleep(1000);
    return await fn();
  }
}

/**
 * Retry a Groq streaming call once after 1s. Wraps the full streamText()
 * invocation and consumption so thrown SDK errors are retried (groqFetch-only
 * retry does not cover AI SDK streamText exceptions).
 */
export async function withGroqStreamRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      !isGroqTransientError(groqErrorStatus(err), groqErrorMessage(err))
    ) {
      throw err;
    }
    console.log("[groq] transient stream error, retrying in 1s...");
    await sleep(1000);
    return await fn();
  }
}

/** OpenAI-compatible Groq HTTP fetch with a single transient retry. */
export async function groqFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  const attempt = () => fetch(url, init);

  const res = await attempt();
  if (res.ok) return res;

  if (isGroqTransientError(res.status)) {
    await res.text().catch(() => "");
    console.log("[groq] transient error, retrying in 1s...");
    await sleep(1000);
    return attempt();
  }

  const details = await res.text().catch(() => "");
  if (isGroqTransientError(undefined, details)) {
    console.log("[groq] transient error, retrying in 1s...");
    await sleep(1000);
    return attempt();
  }

  return new Response(details, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

export async function groqGenerateText(
  params: Parameters<typeof generateText>[0]
) {
  return withGroqRetry(() => generateText(params));
}

/**
 * Stream a Groq chat completion via the AI SDK, retrying once on transient
 * failures. Consumes the stream inside the retry boundary so a failed first
 * request can be retried before any chunks are emitted.
 */
export async function streamGroqTextCollecting(input: {
  apiKey: string;
  model: string;
  messages: CoreMessage[];
  systemPrompt?: string;
  onChunk: (text: string) => void;
}): Promise<{ inputTokens: number; outputTokens: number }> {
  return withGroqStreamRetry(async () => {
    const prepared = truncateGroqChatRequest({
      model: input.model,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : String(m.content),
      })),
      systemPrompt: input.systemPrompt,
    });
    const sendMessages: GroqChatMessage[] = [];
    if (prepared.systemPrompt) {
      sendMessages.push({ role: "system", content: prepared.systemPrompt });
    }
    sendMessages.push(...prepared.messages);
    logGroqSend(input.model, sendMessages);

    const result = streamText({
      model: createGroq({ apiKey: input.apiKey })(input.model),
      system: prepared.systemPrompt,
      messages: prepared.messages as CoreMessage[],
    });

    for await (const chunk of result.textStream) {
      input.onChunk(chunk);
    }

    const usage = await result.usage;
    return {
      inputTokens: usage?.promptTokens ?? 0,
      outputTokens: usage?.completionTokens ?? 0,
    };
  });
}

export { GROQ_CHAT_COMPLETIONS_URL };

