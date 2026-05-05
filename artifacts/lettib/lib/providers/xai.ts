import { createOpenAI } from "@ai-sdk/openai";

export function createXAIClient(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
  });
}
