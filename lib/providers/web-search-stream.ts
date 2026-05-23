import { streamText, type CoreMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamGroqCompoundText } from "@/lib/providers/groq-compound";

export type WebSearchStreamInput = {
  provider: string;
  model: string;
  apiKey: string;
  groqApiKey?: string | null;
  messages: CoreMessage[];
  systemPrompt?: string;
  onFinish?: (usage: {
    promptTokens?: number;
    completionTokens?: number;
  }) => void;
};

export function resolveWebSearchModel(
  provider: string,
  model: string
): { provider: string; model: string } {
  if (provider === "groq") {
    return { provider: "groq", model: "groq/compound" };
  }
  return { provider, model };
}

function lastUserText(messages: CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((p) =>
            typeof p === "object" && p && "text" in p
              ? String((p as { text?: string }).text ?? "")
              : ""
          )
          .join("");
      }
    }
  }
  return "";
}

function dataStreamResponseFromText(
  text: string,
  headers?: Record<string, string>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
      controller.enqueue(
        encoder.encode(`d:${JSON.stringify({ finishReason: "stop" })}\n`)
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
      ...headers,
    },
  });
}

async function anthropicWebSearchText(input: WebSearchStreamInput): Promise<string> {
  const userContent = lastUserText(input.messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages: [{ role: "user", content: userContent }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `Anthropic web search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text =
    data.content
      ?.filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("") ?? "";
  input.onFinish?.({
    promptTokens: data.usage?.input_tokens,
    completionTokens: data.usage?.output_tokens,
  });
  return text;
}

async function openAIWebSearchText(input: WebSearchStreamInput): Promise<string> {
  const userContent = lastUserText(input.messages);
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model.startsWith("gpt-") ? input.model : "gpt-4.1",
      input: userContent,
      tools: [{ type: "web_search_preview" }],
    }),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `OpenAI web search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    output?: { content?: { text?: string }[] }[];
  };
  const text =
    data.output
      ?.flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? "")
      .join("") ?? "";
  input.onFinish?.({});
  return text;
}

/**
 * Search-augmented chat stream. Returns a Response compatible with useChat.
 */
export async function streamWebSearchChatResponse(
  input: WebSearchStreamInput,
  headers?: Record<string, string>
): Promise<Response> {
  const { provider, model } = resolveWebSearchModel(input.provider, input.model);

  if (provider === "groq") {
    const parts: string[] = [];
    const usage = await streamGroqCompoundText({
      apiKey: input.apiKey,
      model,
      userContent: lastUserText(input.messages),
      systemPrompt: input.systemPrompt,
      onText: (t) => parts.push(t),
    });
    input.onFinish?.({
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
    });
    return dataStreamResponseFromText(parts.join(""), headers);
  }

  if (provider === "xai") {
    const groqKey = input.groqApiKey?.trim();
    if (!groqKey) {
      throw new Error(
        "Web search for Grok requires a connected Groq key for the search pass."
      );
    }
    const parts: string[] = [];
    const usage = await streamGroqCompoundText({
      apiKey: groqKey,
      model: "groq/compound",
      userContent: lastUserText(input.messages),
      systemPrompt: input.systemPrompt,
      onText: (t) => parts.push(t),
    });
    input.onFinish?.({
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
    });
    return dataStreamResponseFromText(parts.join(""), headers);
  }

  if (provider === "anthropic") {
    const text = await anthropicWebSearchText({ ...input, provider, model });
    return dataStreamResponseFromText(text, headers);
  }

  if (provider === "openai") {
    const text = await openAIWebSearchText({ ...input, provider, model });
    return dataStreamResponseFromText(text, headers);
  }

  if (provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: input.apiKey });
    const result = await streamText({
      model: google(model),
      system: input.systemPrompt,
      messages: input.messages,
      providerOptions: {
        google: {
          useSearchGrounding: true,
        },
      },
      onFinish: ({ usage }) => input.onFinish?.(usage),
    });
    return result.toDataStreamResponse({ headers });
  }

  throw new Error(`Web search is not supported for provider: ${provider}`);
}

export async function fetchGroqKeyForUser(
  serviceClient: ReturnType<
    typeof import("@/lib/supabase/service").createServiceClient
  >,
  userId: string
): Promise<string | null> {
  const { data: conn } = await serviceClient
    .from("api_connections")
    .select("vault_secret_id")
    .eq("user_id", userId)
    .eq("provider", "groq")
    .in("status", ["connected", "untested"])
    .maybeSingle();
  if (!conn) return null;
  const { data: apiKey } = await serviceClient.rpc("lettib_read_secret", {
    p_secret_id: (conn as { vault_secret_id: string }).vault_secret_id,
  });
  const trimmed =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey ?? "").trim();
  return trimmed || null;
}
