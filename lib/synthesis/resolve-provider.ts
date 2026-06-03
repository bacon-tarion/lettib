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

async function tryResolveByokProvider(
  provider: string,
  conn: ConnRow | undefined,
  serviceClient: SupabaseClient,
  compareKeyMode: CompareKeyMode
): Promise<SynthesisProviderConfig | null> {
  if (!conn) return null;

  const { data: apiKey, error: vaultError } = await serviceClient.rpc(
    "lettib_read_secret",
    { p_secret_id: conn.vault_secret_id }
  );
  if (vaultError || !apiKey) return null;

  const trimmedKey =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey).trim();
  if (!trimmedKey) return null;

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
      compareKeyMode: compareKeyMode === "manual" ? "manual" : "byok",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a synthesis model from the user's BYOK vault, optionally falling
 * back to server Gemini when no usable key is found.
 */
export async function resolveSynthesisProvider(
  serviceClient: SupabaseClient,
  userId: string,
  compareKeyMode: CompareKeyMode,
  options?: { requireByok?: boolean; preferredProvider?: string | null }
): Promise<SynthesisProviderConfig> {
  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, vault_secret_id, custom_base_url, custom_model_name")
    .eq("user_id", userId)
    .in("status", ["connected", "untested"]);

  const connByProvider = new Map<string, ConnRow>();
  for (const c of (connections ?? []) as ConnRow[]) {
    connByProvider.set(c.provider, c);
  }

  const preferred = options?.preferredProvider?.trim();
  if (preferred && preferred !== "auto") {
    const preferredResolved = await tryResolveByokProvider(
      preferred,
      connByProvider.get(preferred),
      serviceClient,
      compareKeyMode
    );
    if (preferredResolved) return preferredResolved;
  }

  for (const provider of BYOK_PROVIDER_PRIORITY) {
    if (preferred && preferred !== "auto" && provider === preferred) {
      continue;
    }

    const resolved = await tryResolveByokProvider(
      provider,
      connByProvider.get(provider),
      serviceClient,
      compareKeyMode
    );
    if (resolved) return resolved;
  }

  if (options?.requireByok) {
    throw new Error(
      "Manual Compare requires at least one connected API key. Add a key in Settings → API Keys to use this feature."
    );
  }

  console.warn(
    `[synthesis] no BYOK provider available for user ${userId}; falling back to server Gemini`
  );

  return {
    model: createServerGeminiModel(SERVER_GEMINI_MODEL),
    provider: "google",
    modelId: SERVER_GEMINI_MODEL,
    compareKeyMode,
  };
}
