import { createGroq } from "@ai-sdk/groq";

export const GROQ_SERVER_MODEL = "llama-3.3-70b-versatile";

/**
 * Server-side Groq API key from env (GROQ_API_KEY) — used for Manual Compare /
 * manual-key synthesis and built-in Groq compare lanes without user API keys.
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
