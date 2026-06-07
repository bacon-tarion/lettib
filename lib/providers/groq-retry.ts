import { generateText, streamText, type CoreMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const TRANSIENT_MESSAGE_MARKERS = [
  "service unavailable",
  "rate limit",
  "overloaded",
  "try again",
] as const;

export function isGroqTransientError(
  status?: number,
  message?: string
): boolean {
  if (status === 503 || status === 429) return true;
  if (!message) return false;
  const lower = message.toLowerCase();
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
 * (503/429 or known overload / rate-limit wording).
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
  return withGroqRetry(async () => {
    const result = streamText({
      model: createGroq({ apiKey: input.apiKey })(input.model),
      system: input.systemPrompt,
      messages: input.messages,
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
