import { createAnthropic } from "@ai-sdk/anthropic";

export function createAnthropicClient(apiKey: string) {
  return createAnthropic({ apiKey });
}
