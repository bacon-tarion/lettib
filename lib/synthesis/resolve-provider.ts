import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompareKeyMode } from "@/lib/compare/key-mode";
import {
  createServerGroqModel,
  GROQ_SERVER_MODEL,
} from "@/lib/providers/groq-server";

const BYOK_SYNTH_PROVIDER = "anthropic";
const BYOK_SYNTH_MODEL = "claude-sonnet-4-6";

export type SynthesisProviderConfig = {
  model: LanguageModel;
  provider: string;
  modelId: string;
  compareKeyMode: CompareKeyMode;
};

/**
 * Manual Compare synthesis uses the server GROQ_API_KEY.
 * BYOK Compare synthesis uses the user's Anthropic vault key.
 */
export async function resolveSynthesisProvider(
  serviceClient: SupabaseClient,
  userId: string,
  compareKeyMode: CompareKeyMode
): Promise<SynthesisProviderConfig> {
  if (compareKeyMode === "manual") {
    return {
      model: createServerGroqModel(GROQ_SERVER_MODEL),
      provider: "groq",
      modelId: GROQ_SERVER_MODEL,
      compareKeyMode: "manual",
    };
  }

  const { data: anthropicConn } = await serviceClient
    .from("api_connections")
    .select("vault_secret_id")
    .eq("user_id", userId)
    .eq("provider", "anthropic")
    .in("status", ["connected", "untested"])
    .maybeSingle();

  if (!anthropicConn) {
    throw new Error(
      "LettiB Synthesis uses Claude Sonnet on your Anthropic account. Connect Anthropic in Settings."
    );
  }

  const { data: apiKey, error: vaultError } = await serviceClient.rpc(
    "lettib_read_secret",
    {
      p_secret_id: (anthropicConn as { vault_secret_id: string }).vault_secret_id,
    }
  );
  if (vaultError || !apiKey) {
    throw new Error("Could not decrypt Anthropic API key for synthesis");
  }
  const trimmedKey =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey).trim();
  if (!trimmedKey) {
    throw new Error("Anthropic API key is empty after decrypt");
  }

  return {
    model: createAnthropic({ apiKey: trimmedKey })(BYOK_SYNTH_MODEL),
    provider: BYOK_SYNTH_PROVIDER,
    modelId: BYOK_SYNTH_MODEL,
    compareKeyMode: "byok",
  };
}
