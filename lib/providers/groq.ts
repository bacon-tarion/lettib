import { streamText, type CoreMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";

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

/** Model id sent to Groq (web search upgrades Llama lanes to Compound). */
export function resolveGroqCompareLaneModel(
  model: string,
  webSearchEnabled: boolean
): string {
  if (
    webSearchEnabled &&
    model !== "groq/compound" &&
    model !== "groq/compound-mini"
  ) {
    return "groq/compound";
  }
  return model;
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

  const groq = createGroq({ apiKey: config.apiKey });
  const result = streamText({
    model: groq(config.model),
    system: truncated.systemPrompt,
    messages: truncated.messages,
  });

  for await (const chunk of result.textStream) {
    config.onChunk(chunk);
  }

  const usage = await result.usage;
  config.onFinish?.({
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
  });
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
