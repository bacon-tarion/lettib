import { MODELS_CATALOG } from "@/lib/providers/models";
import { createServiceClient } from "@/lib/supabase/service";

type UsageLogClient = {
  from: (table: "usage_logs") => {
    insert: (
      values: Record<string, unknown> | Record<string, unknown>[]
    ) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

type UsageLogInput = {
  userId: string;
  conversationId?: string | null;
  action: string;
  provider: string;
  model: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  createdAt?: string;
};

function asNonNegativeInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function calculateUsageCost(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (
    (entry.cost_in * tokensIn) / 1_000_000 +
    (entry.cost_out * tokensOut) / 1_000_000
  );
}

export function logUsageAsync(
  client: UsageLogClient,
  input: UsageLogInput
): void {
  void client;
  const tokensIn = asNonNegativeInt(input.tokensIn);
  const tokensOut = asNonNegativeInt(input.tokensOut);
  const costUsd =
    typeof input.costUsd === "number" && Number.isFinite(input.costUsd)
      ? input.costUsd
      : calculateUsageCost(input.provider, input.model, tokensIn, tokensOut);
  const row = {
    user_id: input.userId,
    conversation_id: input.conversationId ?? null,
    action: input.action,
    provider: input.provider,
    model: input.model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    latency_ms: asNonNegativeInt(input.latencyMs),
    created_at: input.createdAt ?? new Date().toISOString(),
  };

  console.log("[usage_logs] insert attempt:", {
    action: row.action,
    provider: row.provider,
    model: row.model,
    conversation_id: row.conversation_id,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    cost_usd: row.cost_usd,
  });

  void Promise.resolve(createServiceClient().from("usage_logs").insert(row))
    .then(({ error }) => {
      if (error) {
        console.error("[usage_logs] insert failed:", error);
      }
    })
    .catch((err: unknown) => {
      console.error("[usage_logs] insert threw:", {
        error: err,
        action: row.action,
        provider: row.provider,
        model: row.model,
        conversation_id: row.conversation_id,
      });
    });
}
