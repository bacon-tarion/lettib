import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompareKeyMode } from "@/lib/compare/key-mode";
import {
  createServerGeminiModel,
  SERVER_GEMINI_MODEL,
} from "@/lib/providers/gemini-server";

/** Preferred order when multiple BYOK providers are connected. */
const BYOK_PROVIDER_PRIORITY = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "custom",
  "groq",
] as const;

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  xai: "grok-4.20-0309-non-reasoning",
  groq: "llama-3.3-70b-versatile",
};

export type SynthesisProviderConfig = {
  model: LanguageModel;
  provider: string;
  modelId: string;
  compareKeyMode: CompareKeyMode;
};

type ConnRow = {
  provider: string;
  vault_secret_id: string;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

function buildByokModel(
  provider: string,
  apiKey: string,
  modelId: string,
  baseUrl: string | null
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "xai":
      return createXai({ apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey })(modelId);
    case "custom":
      if (!baseUrl) throw new Error("Custom provider is missing base URL.");
      return createOpenAI({ apiKey, baseURL: baseUrl })(modelId);
    default:
      throw new Error(`Unsupported synthesis provider: ${provider}`);
  }
}

function modelIdForConnection(conn: ConnRow): string {
  if (conn.provider === "custom") {
    return conn.custom_model_name?.trim() || "custom";
  }
  return DEFAULT_MODEL_BY_PROVIDER[conn.provider] ?? "gpt-4o-mini";
}

/**
 * Manual Compare synthesis uses the server GOOGLE_API_KEY.
 * BYOK Compare synthesis uses any connected user provider, else server Gemini.
 */
export async function resolveSynthesisProvider(
  serviceClient: SupabaseClient,
  userId: string,
  compareKeyMode: CompareKeyMode
): Promise<SynthesisProviderConfig> {
  if (compareKeyMode === "manual") {
    return {
      model: createServerGeminiModel(SERVER_GEMINI_MODEL),
      provider: "google",
      modelId: SERVER_GEMINI_MODEL,
      compareKeyMode: "manual",
    };
  }

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, vault_secret_id, custom_base_url, custom_model_name")
    .eq("user_id", userId)
    .in("status", ["connected", "untested"]);

  const connByProvider = new Map<string, ConnRow>();
  for (const c of (connections ?? []) as ConnRow[]) {
    connByProvider.set(c.provider, c);
  }

  for (const provider of BYOK_PROVIDER_PRIORITY) {
    const conn = connByProvider.get(provider);
    if (!conn) continue;

    const { data: apiKey, error: vaultError } = await serviceClient.rpc(
      "lettib_read_secret",
      { p_secret_id: conn.vault_secret_id }
    );
    if (vaultError || !apiKey) continue;

    const trimmedKey =
      typeof apiKey === "string" ? apiKey.trim() : String(apiKey).trim();
    if (!trimmedKey) continue;

    const modelId = modelIdForConnection(conn);
    try {
      const model = buildByokModel(
        provider,
        trimmedKey,
        modelId,
        conn.custom_base_url
      );
      return {
        model,
        provider,
        modelId,
        compareKeyMode: "byok",
      };
    } catch {
      continue;
    }
  }

  return {
    model: createServerGeminiModel(SERVER_GEMINI_MODEL),
    provider: "google",
    modelId: SERVER_GEMINI_MODEL,
    compareKeyMode: "manual",
  };
}
