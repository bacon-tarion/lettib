import { createOpenAI } from "@ai-sdk/openai";

export function createOpenAIClient(apiKey: string) {
  return createOpenAI({ apiKey });
}
