import { streamText, CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";

export {
  MODELS_CATALOG,
  DEFAULT_TEAM_MODELS,
  getModelById,
  getModelDisplayName,
  getProviderForModel,
  getProviderLabel,
} from "./models";
export type { Provider, ModelEntry } from "./models";

export type StreamChatInput = {
  provider: "openai" | "anthropic" | "google" | "xai" | "custom";
  model: string;
  apiKey: string;
  baseUrl?: string;
  messages: CoreMessage[];
  systemPrompt?: string;
};

export async function streamChat(input: StreamChatInput) {
  const { provider, model, apiKey, baseUrl, messages, systemPrompt } = input;

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
  });
}
