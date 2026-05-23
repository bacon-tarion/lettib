import { createGroq } from "@ai-sdk/groq";

export const GROQ_SERVER_MODEL = "llama-3.3-70b-versatile";

/**
 * Server-side Groq API key from env — used for Manual Compare synthesis
 * and other built-in features that must not require user API keys.
 */
export function getServerGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim();
  return key || null;
}

export function createServerGroqModel(model: string = GROQ_SERVER_MODEL) {
  const apiKey = getServerGroqApiKey();
  if (!apiKey) {
    throw new Error(
      "Server Groq API key is not configured (GROQ_API_KEY env var)."
    );
  }
  return createGroq({ apiKey })(model);
}
