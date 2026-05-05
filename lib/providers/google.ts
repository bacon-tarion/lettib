import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createGoogleClient(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}
