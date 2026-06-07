/**
 * Groq Compound (`groq/compound`) chat helper.
 *
 * Compound is a server-side agent that may emit tool-use blocks before the
 * final answer. The AI SDK streaming parser only forwards `delta.content`
 * text-deltas, so Compare lanes can finish with tokens/latency but an empty
 * body. This module reads the OpenAI-compatible Groq stream directly and
 * also accepts final `message.content` chunks that the SDK schema drops.
 */

import {
  GROQ_CHAT_COMPLETIONS_URL,
  groqFetch,
  logGroqSend,
  truncateGroqMessagesForModel,
  withGroqRetry,
  withGroqStreamRetry,
  type GroqChatMessage,
} from "@/lib/providers/groq-retry";

export type GroqCompoundUsage = {
  inputTokens: number;
  outputTokens: number;
};

function extractTextFromChoice(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const c = choice as {
    delta?: { content?: string | null; reasoning?: string | null };
    message?: { content?: string | null; reasoning?: string | null };
  };
  const parts: string[] = [];
  if (typeof c.delta?.content === "string" && c.delta.content) {
    parts.push(c.delta.content);
  }
  if (typeof c.message?.content === "string" && c.message.content) {
    parts.push(c.message.content);
  }
  return parts.join("");
}

function extractUsage(payload: unknown): GroqCompoundUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    x_groq?: {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
  };
  const usage = p.x_groq?.usage ?? p.usage;
  if (!usage) return null;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}

/**
 * Stream an OpenAI-compatible Groq chat completion via direct HTTP (with
 * transient retry on the initial request). Invokes `onText` for each delta.
 */
async function streamGroqOpenAIMessagesOnce(input: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
  onText: (text: string) => void;
}): Promise<GroqCompoundUsage> {
  const messages = truncateGroqMessagesForModel(input.model, input.messages);
  logGroqSend(input.model, messages);

  const res = await groqFetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `Groq stream failed with status ${res.status}`);
  }
  if (!res.body) throw new Error("Groq stream response had no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let accumulated = "";

  const handlePayload = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as {
      error?: { message?: string };
      choices?: unknown[];
    };
    if (p.error?.message) {
      throw new Error(p.error.message);
    }
    const usage = extractUsage(payload);
    if (usage) {
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
    }
    for (const choice of p.choices ?? []) {
      const chunk = extractTextFromChoice(choice);
      if (!chunk) continue;
      let delta = chunk;
      if (chunk.startsWith(accumulated)) {
        delta = chunk.slice(accumulated.length);
      }
      if (delta) {
        accumulated += delta;
        input.onText(delta);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      handlePayload(JSON.parse(data));
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (data && data !== "[DONE]") {
      handlePayload(JSON.parse(data));
    }
  }

  return { inputTokens, outputTokens };
}

export async function streamGroqOpenAIMessages(input: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
  onText: (text: string) => void;
}): Promise<GroqCompoundUsage> {
  return withGroqStreamRetry(() => streamGroqOpenAIMessagesOnce(input));
}

/**
 * Stream a Groq Compound completion, invoking `onText` for every prose
 * fragment observed in the SSE feed.
 */
export async function streamGroqCompoundText(input: {
  apiKey: string;
  model: string;
  userContent: string;
  systemPrompt?: string;
  onText: (text: string) => void;
}): Promise<GroqCompoundUsage> {
  const messages: GroqChatMessage[] = [];
  if (input.systemPrompt?.trim()) {
    messages.push({ role: "system", content: input.systemPrompt.trim() });
  }
  messages.push({ role: "user", content: input.userContent });

  let inputTokens = 0;
  let outputTokens = 0;
  let accumulated = "";

  const usage = await streamGroqOpenAIMessages({
    apiKey: input.apiKey,
    model: input.model,
    messages,
    onText: (chunk) => {
      accumulated += chunk;
      input.onText(chunk);
    },
  });
  inputTokens = usage.inputTokens;
  outputTokens = usage.outputTokens;

  // Last-resort: non-stream retry when the agent ran tools but never streamed
  // prose (observed on multi-tool Compound requests).
  if (!accumulated.trim()) {
    const fallback = await generateGroqCompoundText({
      apiKey: input.apiKey,
      model: input.model,
      userContent: input.userContent,
      systemPrompt: input.systemPrompt,
    });
    if (fallback.text.trim()) {
      accumulated = fallback.text;
      input.onText(fallback.text);
    }
    inputTokens = fallback.inputTokens;
    outputTokens = fallback.outputTokens;
  }

  return { inputTokens, outputTokens };
}

/** Non-streaming Compound completion — used as a fallback after empty streams. */
export async function generateGroqCompoundText(input: {
  apiKey: string;
  model: string;
  userContent: string;
  systemPrompt?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  return withGroqRetry(() => generateGroqCompoundTextOnce(input));
}

async function generateGroqCompoundTextOnce(input: {
  apiKey: string;
  model: string;
  userContent: string;
  systemPrompt?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const messages: GroqChatMessage[] = [];
  if (input.systemPrompt?.trim()) {
    messages.push({ role: "system", content: input.systemPrompt.trim() });
  }
  messages.push({ role: "user", content: input.userContent });

  const truncatedMessages = truncateGroqMessagesForModel(input.model, messages);
  logGroqSend(input.model, truncatedMessages);

  const res = await groqFetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: truncatedMessages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `Groq request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function isGroqCompoundModel(model: string): boolean {
  return model === "groq/compound";
}

/** AI SDK–compatible data stream for Groq chat (text-only messages). */
export function streamGroqChatDataStreamResponse(input: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
  headers?: Record<string, string>;
  onFinish?: (usage: GroqCompoundUsage) => void;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const usage = await streamGroqOpenAIMessages({
          apiKey: input.apiKey,
          model: input.model,
          messages: input.messages,
          onText: (chunk) => {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
          },
        });
        input.onFinish?.(usage);
        controller.enqueue(
          encoder.encode(`d:${JSON.stringify({ finishReason: "stop" })}\n`)
        );
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
      ...input.headers,
    },
  });
}
