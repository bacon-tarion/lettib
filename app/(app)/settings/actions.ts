"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ApiConnection = {
  id: string;
  provider: string;
  status: string | null;
  key_last_four: string | null;
  last_tested_at: string | null;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "xai",
  "custom",
] as const;
type ProviderValue = (typeof VALID_PROVIDERS)[number];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

function validateKey(
  provider: ProviderValue,
  rawKey: string,
  options?: { baseUrl?: string; modelName?: string }
): string | null {
  switch (provider) {
    case "openai":
      if (!rawKey.startsWith("sk-") || rawKey.length < 20)
        return 'OpenAI keys must start with "sk-" and be at least 20 characters.';
      break;
    case "anthropic":
      if (!rawKey.startsWith("sk-ant-") || rawKey.length < 20)
        return 'Anthropic keys must start with "sk-ant-" and be at least 20 characters.';
      break;
    case "google":
      if (rawKey.length < 20)
        return "Google API keys must be at least 20 characters.";
      break;
    case "groq":
      if (!rawKey.startsWith("gsk_") || rawKey.length < 20)
        return 'Groq keys must start with "gsk_" and be at least 20 characters.';
      break;
    case "xai":
      if (!rawKey.startsWith("xai-") || rawKey.length < 20)
        return 'xAI (Grok) keys must start with "xai-" and be at least 20 characters.';
      break;
    case "custom":
      if (!options?.baseUrl) return "Base URL is required for custom providers.";
      try {
        new URL(options.baseUrl);
      } catch {
        return "Base URL must be a valid URL (e.g. https://your-server.com/v1).";
      }
      if (rawKey !== "no-key" && rawKey.length < 8)
        return "API key must be at least 8 characters.";
      break;
  }
  return null;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function addApiKey(
  provider: string,
  rawKey: string,
  options?: { baseUrl?: string; modelName?: string }
): Promise<{ success: boolean; lastFour?: string; error?: string }> {
  if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
    return { success: false, error: "Invalid provider." };
  }

  const validationError = validateKey(provider as ProviderValue, rawKey, options);
  if (validationError) return { success: false, error: validationError };

  const user = await requireUser();
  const serviceClient = createServiceClient();
  const keyLastFour = rawKey === "no-key" ? null : rawKey.slice(-4);

  try {
    // Check for an existing connection so we can replace cleanly
    const { data: existing } = await serviceClient
      .from("api_connections")
      .select("id, vault_secret_id")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    // Store the new key via the public wrapper that calls vault.create_secret internally
    const { data: newSecretId, error: vaultError } = await serviceClient.rpc(
      "lettib_store_secret",
      {
        p_secret: rawKey,
        p_name: `lettib_${user.id}_${provider}_${Date.now()}`,
      }
    );

    if (vaultError || !newSecretId) {
      console.error("[addApiKey] lettib_store_secret failed:", vaultError);
      return {
        success: false,
        error: "Failed to store key securely.",
      };
    }

    if (existing) {
      // Delete the old vault secret to avoid orphans
      if (existing.vault_secret_id) {
        await serviceClient.rpc("lettib_delete_secret", {
          p_secret_id: existing.vault_secret_id,
        });
      }

      const { error: updateError } = await serviceClient
        .from("api_connections")
        .update({
          vault_secret_id: newSecretId,
          key_last_four: keyLastFour,
          status: "untested",
          custom_base_url: options?.baseUrl ?? null,
          custom_model_name: options?.modelName ?? null,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[addApiKey] update failed:", updateError);
        return { success: false, error: "Failed to update connection." };
      }
    } else {
      const { error: insertError } = await serviceClient
        .from("api_connections")
        .insert({
          user_id: user.id,
          provider,
          vault_secret_id: newSecretId,
          key_last_four: keyLastFour,
          status: "untested",
          custom_base_url: options?.baseUrl ?? null,
          custom_model_name: options?.modelName ?? null,
        });

      if (insertError) {
        console.error("[addApiKey] insert failed:", insertError);
        return { success: false, error: "Failed to save connection." };
      }
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { success: true, lastFour: keyLastFour ?? undefined };
  } catch (err) {
    console.error("[addApiKey] Unexpected error:", err);
    return {
      success: false,
      error: "An unexpected error occurred.",
    };
  }
}

export async function testApiKey(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const serviceClient = createServiceClient();

  // Fetch connection and verify ownership
  const { data: connection, error: connError } = await serviceClient
    .from("api_connections")
    .select("id, user_id, provider, vault_secret_id, custom_base_url")
    .eq("id", connectionId)
    .single();

  if (connError || !connection)
    return { success: false, error: "Connection not found." };
  if (connection.user_id !== user.id)
    return { success: false, error: "Unauthorized." };

  // Decrypt the raw key via the public wrapper — never leaves the server
  const { data: rawKey, error: readError } = await serviceClient.rpc(
    "lettib_read_secret",
    { p_secret_id: connection.vault_secret_id }
  );

  if (readError || !rawKey) {
    console.error("[testApiKey] lettib_read_secret failed:", readError);
    return { success: false, error: "Could not decrypt API key." };
  }

  let testOk = false;
  let testError: string | undefined;

  try {
    switch (connection.provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        testOk = res.ok;
        if (!testOk) testError = `OpenAI returned ${res.status}`;
        break;
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": rawKey,
            "anthropic-version": "2023-06-01",
          },
        });
        testOk = res.ok;
        if (!testOk) testError = `Anthropic returned ${res.status}`;
        break;
      }
      case "google": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${rawKey}`
        );
        testOk = res.ok;
        if (!testOk) testError = `Google returned ${res.status}`;
        break;
      }
      case "groq": {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        testOk = res.ok;
        if (!testOk) testError = `Groq returned ${res.status}`;
        break;
      }
      case "xai": {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: { Authorization: `Bearer ${rawKey}` },
        });
        testOk = res.ok;
        if (!testOk) testError = `xAI (Grok) returned ${res.status}`;
        break;
      }
      case "custom": {
        const baseUrl = connection.custom_base_url as string | null;
        if (!baseUrl) {
          testError = "No base URL configured for this custom provider.";
          break;
        }
        const headers: Record<string, string> = {};
        if (rawKey !== "no-key") headers["Authorization"] = `Bearer ${rawKey}`;
        const res = await fetch(`${baseUrl}/models`, { headers });
        testOk = res.status >= 200 && res.status < 300;
        if (!testOk) testError = `Server returned ${res.status}`;
        break;
      }
      default:
        testError = "Unknown provider.";
    }
  } catch (err) {
    testError =
      err instanceof Error ? err.message : "Network error during test.";
  }

  // Persist the test result
  await serviceClient
    .from("api_connections")
    .update({
      status: testOk ? "connected" : "invalid",
      last_tested_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: testOk, error: testError };
}

export async function deleteApiKey(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const serviceClient = createServiceClient();

  // Verify ownership and retrieve vault reference
  const { data: connection } = await serviceClient
    .from("api_connections")
    .select("id, user_id, vault_secret_id")
    .eq("id", connectionId)
    .single();

  if (!connection) return { success: false, error: "Connection not found." };
  if (connection.user_id !== user.id)
    return { success: false, error: "Unauthorized." };

  // Delete the connection row first
  await serviceClient.from("api_connections").delete().eq("id", connectionId);

  // Then delete the vault secret so no orphaned encrypted data remains
  if (connection.vault_secret_id) {
    await serviceClient.rpc("lettib_delete_secret", {
      p_secret_id: connection.vault_secret_id,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

// ─── Usage alert threshold (Session 10) ──────────────────────────────────────
//
// Stored on `profiles.usage_alert_threshold_cents` (see migration 027). We
// validate as a positive integer between $1 and $10,000 — matching the DB
// CHECK constraint — and write via the service client to keep policy + grant
// surface minimal. last_alerted_total_cents is NEVER touched here; it is
// server-managed via /api/usage/threshold (audit rule: never trust a client-
// supplied bookmark).

export async function getUsageAlertThresholdCents(): Promise<number> {
  const user = await requireUser();
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("usage_alert_threshold_cents")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as { usage_alert_threshold_cents: number | null } | null;
  return row?.usage_alert_threshold_cents ?? 1000;
}

export async function updateUsageAlertThresholdCents(
  cents: number
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isFinite(cents)) {
    return { success: false, error: "Threshold must be a number." };
  }
  const intCents = Math.floor(cents);
  if (intCents !== cents || intCents < 100 || intCents > 1_000_000) {
    return {
      success: false,
      error: "Threshold must be a whole-cent value between $1 and $10,000.",
    };
  }

  const user = await requireUser();
  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ usage_alert_threshold_cents: intCents })
    .eq("id", user.id);

  if (error) {
    console.error("[updateUsageAlertThresholdCents] update failed:", error);
    return { success: false, error: "Failed to update threshold." };
  }

  revalidatePath("/settings");
  revalidatePath("/usage");
  return { success: true };
}

export async function listApiKeys(): Promise<ApiConnection[]> {
  try {
    // Get the current user via the user-scoped client (for auth), then query
    // via serviceClient to bypass RLS (which may not have a SELECT policy yet).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("api_connections")
      .select(
        "id, provider, status, key_last_four, last_tested_at, custom_base_url, custom_model_name"
      )
      .eq("user_id", user.id)
      .order("provider");

    if (error) {
      console.error("[listApiKeys] query failed:", error);
      return [];
    }
    return (data ?? []) as ApiConnection[];
  } catch (err) {
    console.error("[listApiKeys] unexpected error:", err);
    return [];
  }
}
