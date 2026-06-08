import type { CoreMessage } from "ai";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const CHARS_PER_TOKEN = 4;

const TRANSIENT_ERROR_MARKERS = [
  "too many tokens",
  "message too long",
  "context_length_exceeded",
  "service unavailable",
  "rate limit",
  "overloaded",
  "try again",
  "503",
  "429",
  "please reduce",
] as const;

type SimpleGroqMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type StreamGroqResponseConfig = {
  apiKey: string;
  model: string;
  messages: CoreMessage[];
  systemPrompt?: string;
  onChunk: (chunk: string) => void;
  onFinish?: (usage: {
    promptTokens: number;
    completionTokens: number;
  }) => void;
};

function maxCharsForModel(model: string): number {
  const maxTokens = model === "llama-3.1-8b-instant" ? 2000 : 4000;
  return maxTokens * CHARS_PER_TOKEN;
}

function coreMessageToText(content: CoreMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}

function toSimpleMessages(messages: CoreMessage[]): SimpleGroqMessage[] {
  const out: SimpleGroqMessage[] = [];
  for (const message of messages) {
    if (
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system"
    ) {
      out.push({
        role: message.role,
        content: coreMessageToText(message.content),
      });
    }
  }
  return out;
}

function toCoreMessages(messages: SimpleGroqMessage[]): CoreMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function truncateGroqMessages(input: {
  model: string;
  messages: CoreMessage[];
  systemPrompt?: string;
}): { messages: CoreMessage[]; systemPrompt?: string } {
  const maxChars = maxCharsForModel(input.model);
  const systemRoleMessages = toSimpleMessages(
    input.messages.filter((m) => m.role === "system")
  );
  let conversation = toSimpleMessages(
    input.messages.filter((m) => m.role !== "system")
  );
  let systemPrompt = input.systemPrompt?.trim() || undefined;

  const totalChars = () => {
    let sum = systemPrompt?.length ?? 0;
    for (const message of systemRoleMessages) sum += message.content.length;
    for (const message of conversation) sum += message.content.length;
    return sum;
  };

  if (totalChars() <= maxChars) {
    return { messages: input.messages, systemPrompt };
  }

  let lastUserIndex = -1;
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) {
    while (totalChars() > maxChars && conversation.length > 1) {
      conversation.shift();
    }
    if (totalChars() > maxChars && conversation[0]) {
      const budget =
        maxChars -
        (totalChars() - conversation[0].content.length) -
        (systemPrompt?.length ?? 0) -
        systemRoleMessages.reduce((sum, m) => sum + m.content.length, 0);
      const content = conversation[0].content;
      conversation[0] = {
        ...conversation[0],
        content:
          content.length > budget
            ? content.slice(content.length - Math.max(0, budget))
            : content,
      };
    }
    return {
      messages: toCoreMessages([...systemRoleMessages, ...conversation]),
      systemPrompt,
    };
  }

  const lastUser = conversation[lastUserIndex]!;
  const middle = [
    ...conversation.slice(0, lastUserIndex),
    ...conversation.slice(lastUserIndex + 1),
  ];

  while (totalChars() > maxChars && middle.length > 0) {
    middle.shift();
    conversation = [...middle, lastUser];
  }

  if (totalChars() > maxChars && systemPrompt) {
    const fixed =
      totalChars() -
      systemPrompt.length +
      systemRoleMessages.reduce((sum, m) => sum + m.content.length, 0) +
      conversation.reduce((sum, m) => sum + m.content.length, 0);
    const systemBudget = Math.max(0, maxChars - fixed);
    systemPrompt =
      systemPrompt.length > systemBudget
        ? systemPrompt.slice(systemPrompt.length - systemBudget)
        : systemPrompt;
  }

  if (totalChars() > maxChars) {
    const fixed =
      totalChars() -
      lastUser.content.length +
      systemRoleMessages.reduce((sum, m) => sum + m.content.length, 0) +
      middle.reduce((sum, m) => sum + m.content.length, 0) +
      (systemPrompt?.length ?? 0);
    const userBudget = Math.max(0, maxChars - fixed);
    const content = lastUser.content;
    conversation = [
      ...middle,
      {
        ...lastUser,
        content:
          content.length > userBudget
            ? content.slice(content.length - userBudget)
            : content,
      },
    ];
  } else {
    conversation = [...middle, lastUser];
  }

  return {
    messages: toCoreMessages([...systemRoleMessages, ...conversation]),
    systemPrompt,
  };
}

function isTransientGroqError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return TRANSIENT_ERROR_MARKERS.some((marker) => lower.includes(marker));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groqRetryDelayMs(message: string): number {
  const match = message.match(/try again in ([\d.]+)s/i);
  if (match) {
    const seconds = parseFloat(match[1]!);
    if (!Number.isNaN(seconds)) {
      return Math.min(Math.round(seconds * 1000 + 500), 8000);
    }
  }
  return 2000;
}

/**
 * Compare-only Groq model resolver. Upgrades to groq/compound ONLY when the
 * compare request has web_search=true. Never call with webSearchEnabled=true
 * unless the user turned on web search in Compare Mode.
 */
export function resolveGroqCompareLaneModel(
  model: string,
  webSearchEnabled: boolean
): string {
  if (!webSearchEnabled) return model;
  if (model === "groq/compound" || model === "groq/compound-mini") {
    return model;
  }
  return "groq/compound";
}

function buildGroqApiMessages(input: {
  messages: CoreMessage[];
  systemPrompt?: string;
}): SimpleGroqMessage[] {
  const out: SimpleGroqMessage[] = [];
  if (input.systemPrompt?.trim()) {
    out.push({ role: "system", content: input.systemPrompt.trim() });
  }
  for (const message of toSimpleMessages(input.messages)) {
    if (message.role === "system" && input.systemPrompt?.trim()) continue;
    out.push(message);
  }
  return out;
}

function extractCompoundChoiceText(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const c = choice as {
    delta?: { content?: string | null };
    message?: { content?: string | null };
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

function extractCompoundUsage(payload: unknown): {
  promptTokens: number;
  completionTokens: number;
} | null {
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
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}

/**
 * Read the OpenAI-compatible Groq SSE stream directly. Required for
 * groq/compound (tool-use blocks the AI SDK skips) and more reliable
 * for Llama models than streamText().fullStream in serverless.
 */
async function streamGroqHttp(
  config: StreamGroqResponseConfig,
  truncated: { messages: CoreMessage[]; systemPrompt?: string }
): Promise<void> {
  const messages = buildGroqApiMessages(truncated);
  let attempt1Failed = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let failedHttpStatus: number | undefined;
    try {
      const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
        }),
      });

      if (!res.ok) {
        failedHttpStatus = res.status;
        const errText = await res.text().catch(() => "");
        throw new Error(`Groq HTTP ${res.status}: ${errText}`);
      }
      if (!res.body) throw new Error("Groq stream response had no body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let promptTokens = 0;
      let completionTokens = 0;

      const handlePayload = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const p = payload as {
          error?: { message?: string };
          choices?: unknown[];
        };
        if (p.error?.message) throw new Error(p.error.message);

        const usage = extractCompoundUsage(payload);
        if (usage) {
          promptTokens = usage.promptTokens;
          completionTokens = usage.completionTokens;
        }

        for (const choice of p.choices ?? []) {
          const chunk = extractCompoundChoiceText(choice);
          if (!chunk) continue;
          let delta = chunk;
          if (chunk.startsWith(accumulated)) {
            delta = chunk.slice(accumulated.length);
          }
          if (delta) {
            accumulated += delta;
            config.onChunk(delta);
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

      config.onFinish?.({ promptTokens, completionTokens });
      if (attempt === 2 && attempt1Failed) {
        console.log("[groq] attempt 2 succeeded after 413/429 transient");
      }
      return;
    } catch (err) {
      if (attempt === 1) {
        attempt1Failed = true;
        const message = err instanceof Error ? err.message : String(err);
        const delayMs = groqRetryDelayMs(message);
        console.log(
          "[groq] attempt 1 failed:",
          message,
          `— retrying in ${delayMs}ms`
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
}

async function runGroqStream(config: StreamGroqResponseConfig): Promise<void> {
  const truncated = truncateGroqMessages({
    model: config.model,
    messages: config.messages,
    systemPrompt: config.systemPrompt,
  });

  const totalChars =
    (truncated.systemPrompt?.length ?? 0) +
    truncated.messages.reduce(
      (sum, message) => sum + coreMessageToText(message.content).length,
      0
    );

  console.log(
    "[groq] model:",
    config.model,
    "chars after truncation:",
    totalChars
  );

  await streamGroqHttp(config, truncated);
}

/**
 * Stream a Groq chat completion with truncation and a single transient retry.
 */
export async function streamGroqResponse(
  config: StreamGroqResponseConfig
): Promise<void> {
  try {
    await runGroqStream(config);
  } catch (err) {
    if (!isTransientGroqError(err)) throw err;
    console.log("[groq] transient error, retrying once...");
    await sleep(1000);
    try {
      await runGroqStream(config);
    } catch (retryErr) {
      throw retryErr;
    }
  }
}
