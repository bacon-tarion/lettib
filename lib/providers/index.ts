import { streamText, CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { getServerGroqApiKey } from "./groq-server";

export {
  MODELS_CATALOG,
  DEFAULT_TEAM_MODELS,
  getModelById,
  getModelDisplayName,
  getProviderForModel,
  getProviderLabel,
  isFreeModel,
  FREE_PROVIDERS,
} from "./models";
export type { Provider, ModelEntry } from "./models";
export { getServerGroqApiKey } from "./groq-server";

export type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "groq"
  | "custom";

export type StreamChatInput = {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
  messages: CoreMessage[];
  systemPrompt?: string;
  onFinish?: Parameters<typeof streamText>[0]["onFinish"];
  abortSignal?: AbortSignal;
  maxTokens?: number;
};

/**
 * Resolve the API key for a built-in free provider from server env.
 * Returns null if the provider is not free or no env key is set.
 *
 * Used as a fallback when the user has not connected their own key for
 * `google` or `groq`. Manual Compare synthesis always uses the server
 * Groq key via `createServerGroqModel`; Compare lanes fall back here.
 */
export function getServerApiKey(provider: string): string | null {
  if (provider === "google") return process.env.GOOGLE_API_KEY ?? null;
  if (provider === "groq") return getServerGroqApiKey();
  return null;
}

export async function streamChat(input: StreamChatInput) {
  const {
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    systemPrompt,
    onFinish,
    abortSignal,
    maxTokens = 4096,
  } = input;

  type ModelInstance = Parameters<typeof streamText>[0]["model"];
  let modelInstance: ModelInstance;

  switch (provider) {
    case "openai":
      modelInstance = createOpenAI({ apiKey })(model);
      break;
    case "anthropic":
      modelInstance = createAnthropic({ apiKey })(model);
      break;
    case "google":
      modelInstance = createGoogleGenerativeAI({ apiKey })(model);
      break;
    case "xai":
      modelInstance = createXai({ apiKey })(model);
      break;
    case "groq":
      modelInstance = createGroq({ apiKey })(model);
      break;
    case "custom":
      if (!baseUrl) throw new Error("baseUrl required for custom provider");
      modelInstance = createOpenAI({ apiKey, baseURL: baseUrl })(model);
      break;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  return streamText({
    model: modelInstance,
    system: systemPrompt,
    messages,
    onFinish,
    abortSignal,
    maxTokens,
    ...(provider === "google"
      ? {
          providerOptions: {
            google: {
              thinkingConfig: { thinkingBudget: 0 },
            },
          },
        }
      : {}),
  });
}
