import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const SERVER_GEMINI_MODEL = "gemini-2.0-flash";

/**
 * Server-side Google API key from env (GOOGLE_API_KEY) — used for Manual Compare
 * synthesis and BYOK synthesis fallback without user API keys.
 */
export function getServerGeminiApiKey(): string | null {
  const key = process.env.GOOGLE_API_KEY?.trim();
  return key || null;
}

export function createServerGeminiModel(model: string = SERVER_GEMINI_MODEL) {
  const apiKey = getServerGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Server Google API key is not configured (GOOGLE_API_KEY env var)."
    );
  }
  return createGoogleGenerativeAI({ apiKey })(model);
}
