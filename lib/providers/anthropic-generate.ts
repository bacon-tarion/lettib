/**
 * Direct Anthropic Messages API helper.
 *
 * Bypasses the AI SDK default `temperature: 0`, which newer Anthropic models
 * (e.g. claude-opus-4-7) reject with "`temperature` is deprecated for this
 * model." Scoring and other deterministic passes omit temperature entirely.
 */
export async function generateAnthropicText(input: {
  apiKey: string;
  model: string;
  userContent: string;
  systemPrompt?: string;
  maxTokens?: number;
}): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens ?? 4096,
    messages: [{ role: "user", content: input.userContent }],
  };
  if (input.systemPrompt?.trim()) {
    body.system = input.systemPrompt.trim();
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(
      details || `Anthropic request failed with status ${res.status}`
    );
  }

  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");

  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
